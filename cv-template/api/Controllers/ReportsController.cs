using System.Text;
using System.Text.RegularExpressions;
using CvTemplate.Api.Data;
using CvTemplate.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CvTemplate.Api.Controllers;

public record CountItem(string Name, int Count);
public record MonthItem(string Month, int Applications, int Extracted, int OcrRequired);   // Month = "yyyy-MM"
public record ActivityItem(string User, int Count, DateTime FirstAddedUtc, DateTime LastAddedUtc);
public record GradeCounts(int A, int B, int C, int S, int F, int W, int NotEntered);
public record OlResultsDto(GradeCounts English, GradeCounts Maths, GradeCounts Sinhala, GradeCounts Tamil, GradeCounts Science);
public record ReportSummaryDto(int Total, int Extracted, int OcrRequired, List<MonthItem> Monthly, List<CountItem> Religion,
    List<CountItem> AgeBands, OlResultsDto OlResults, List<ActivityItem> Activity);

public record RegisterRowDto(int CandidateId, string FullName, string? Nic, DateOnly? DateOfBirth, int? Age, string? Phone, string? Location,
    string? Religion, string? OlEnglish, string? OlMaths, string? OlSinhala, string? OlTamil, string? OlScience, string? OlSummary,
    string? AlResults, string ParseStatus, DateTime CreatedAtUtc, string? CreatedBy);
public record RegisterResponse(List<RegisterRowDto> Items, int Total, int Page, int PageSize);

[ApiController]
[Authorize]
[Route("api/v1/reports")]
public class ReportsController(AtsDbContext db, ILogger<ReportsController> logger) : ControllerBase
{
    private static readonly TimeSpan Lk = TimeSpan.FromHours(5.5);   // Sri Lanka time (no daylight saving)
    private const int MaxExportRows = 50_000;
    private static readonly Regex NicRx = new(@"^(\d{9}[VvXx]|\d{12})$", RegexOptions.Compiled);
    private static readonly Regex DigitsRx = new(@"^\d+$", RegexOptions.Compiled);

    private static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);
    private static DateOnly TodayLk() => DateOnly.FromDateTime(DateTime.UtcNow + Lk);

    private static int AgeOn(DateOnly today, DateOnly dob)
    {
        var age = today.Year - dob.Year;
        if (today < dob.AddYears(age)) age--;
        return age;
    }

    // Same filters for every report. Dates are Sri Lanka calendar days, inclusive.
    private IQueryable<Candidate> Filtered(DateOnly? from, DateOnly? to, string? status, string? search = null)
    {
        var q = db.Candidates.Where(c => !c.IsDeleted);
        if (status is "Extracted" or "OcrRequired") q = q.Where(c => c.ParseStatus == status);
        if (from is { } f) { var fromUtc = f.ToDateTime(TimeOnly.MinValue) - Lk; q = q.Where(c => c.CreatedAtUtc >= fromUtc); }
        if (to is { } t) { var toUtc = t.ToDateTime(TimeOnly.MinValue).AddDays(1) - Lk; q = q.Where(c => c.CreatedAtUtc < toUtc); }

        var s = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        if (s is not null)
        {
            var digits = new string(s.Where(char.IsDigit).ToArray());
            if (digits.StartsWith("0094")) digits = "0" + digits[4..];
            else if (digits.StartsWith("94") && digits.Length > 3) digits = "0" + digits[2..];
            q = digits.Length >= 3
                ? q.Where(c => c.FullName.Contains(s) || (c.Nic != null && c.Nic.Contains(s)) || (c.Phone != null && c.Phone.Contains(digits)) || (c.Location != null && c.Location.Contains(s)))
                : q.Where(c => c.FullName.Contains(s) || (c.Nic != null && c.Nic.Contains(s)) || (c.Location != null && c.Location.Contains(s)));
        }
        return q;
    }

    // ------------------------------------------------------------------ aggregated reports (one call feeds four tabs)

    private record Row(DateTime CreatedAtUtc, string ParseStatus, string? Religion, DateOnly? Dob,
        string? En, string? Ma, string? Si, string? Ta, string? Sc, string? CreatedBy);

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery(Name = "from")] DateOnly? dateFrom, [FromQuery(Name = "to")] DateOnly? dateTo,
        [FromQuery] string? status, CancellationToken ct)
    {
        try
        {
            var raw = await Filtered(dateFrom, dateTo, status).AsNoTracking()
                .Select(c => new { c.CreatedAtUtc, c.ParseStatus, c.Religion, c.DateOfBirth, c.OlEnglish, c.OlMaths, c.OlSinhala, c.OlTamil, c.OlScience, c.CreatedBy })
                .ToListAsync(ct);
            var rows = raw.Select(r => new Row(r.CreatedAtUtc, r.ParseStatus, r.Religion, r.DateOfBirth, r.OlEnglish, r.OlMaths, r.OlSinhala, r.OlTamil, r.OlScience, r.CreatedBy)).ToList();

            var ocr = rows.Count(r => r.ParseStatus == "OcrRequired");
            var today = TodayLk();

            // monthly intake: the filtered range (default: last 12 months), at most 36 months
            var nowLk = DateTime.UtcNow + Lk;
            var thisMonth = new DateTime(nowLk.Year, nowLk.Month, 1);
            var end = thisMonth;
            if (dateTo is { } t) { var tm = new DateTime(t.Year, t.Month, 1); if (tm < end) end = tm; }
            DateTime start;
            if (dateFrom is { } f) start = new DateTime(f.Year, f.Month, 1);
            else
            {
                start = end.AddMonths(-11);
                if (rows.Count > 0)
                {
                    var first = rows.Min(r => r.CreatedAtUtc) + Lk;
                    var firstMonth = new DateTime(first.Year, first.Month, 1);
                    if (firstMonth < start) start = firstMonth;
                }
            }
            if (start > end) start = end;
            if (((end.Year - start.Year) * 12 + end.Month - start.Month) >= 36) start = end.AddMonths(-35);

            var local = rows.Select(r => (When: r.CreatedAtUtc + Lk, Ocr: r.ParseStatus == "OcrRequired")).ToList();
            var monthly = new List<MonthItem>();
            for (var m = start; m <= end; m = m.AddMonths(1))
            {
                var inMonth = local.Where(r => r.When.Year == m.Year && r.When.Month == m.Month).ToList();
                var o = inMonth.Count(r => r.Ocr);
                monthly.Add(new MonthItem(m.ToString("yyyy-MM"), inMonth.Count, inMonth.Count - o, o));
            }

            var religion = rows.GroupBy(r => string.IsNullOrWhiteSpace(r.Religion) ? "Not specified" : r.Religion!)
                .Select(g => new CountItem(g.Key, g.Count())).OrderByDescending(x => x.Count).ThenBy(x => x.Name).ToList();

            string[] bandNames = { "Under 21", "21 – 25", "26 – 30", "31 – 35", "36 – 40", "41 – 50", "Over 50", "Not available" };
            var bands = new int[bandNames.Length];
            foreach (var r in rows)
            {
                if (r.Dob is not { } dob) { bands[7]++; continue; }
                var age = AgeOn(today, dob);
                bands[age < 21 ? 0 : age <= 25 ? 1 : age <= 30 ? 2 : age <= 35 ? 3 : age <= 40 ? 4 : age <= 50 ? 5 : 6]++;
            }
            var ageBands = bandNames.Select((n, i) => new CountItem(n, bands[i])).ToList();

            GradeCounts Grades(Func<Row, string?> pick)
            {
                int N(string g) => rows.Count(r => string.Equals(pick(r), g, StringComparison.OrdinalIgnoreCase));
                var entered = "ABCSFW".Sum(ch => N(ch.ToString()));
                return new GradeCounts(N("A"), N("B"), N("C"), N("S"), N("F"), N("W"), rows.Count - entered);
            }
            var ol = new OlResultsDto(Grades(r => r.En), Grades(r => r.Ma), Grades(r => r.Si), Grades(r => r.Ta), Grades(r => r.Sc));

            var activity = rows.GroupBy(r => string.IsNullOrWhiteSpace(r.CreatedBy) ? "(not recorded)" : r.CreatedBy!)
                .Select(g => new ActivityItem(g.Key, g.Count(), Utc(g.Min(x => x.CreatedAtUtc)), Utc(g.Max(x => x.CreatedAtUtc))))
                .OrderByDescending(a => a.Count).ThenBy(a => a.User).ToList();

            return Ok(new ReportSummaryDto(rows.Count, rows.Count - ocr, ocr, monthly, religion, ageBands, ol, activity));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Building the report summary failed.");
            return StatusCode(500, new { message = "Could not build the report." });
        }
    }

    // ------------------------------------------------------------------ candidate register (paged) + CSV

    private IQueryable<Candidate> Sorted(IQueryable<Candidate> q, string? sort, string? dir)
    {
        var asc = string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        IOrderedQueryable<Candidate> ordered = sort?.ToLowerInvariant() switch
        {
            "name" => asc ? q.OrderBy(c => c.FullName) : q.OrderByDescending(c => c.FullName),
            "status" => asc ? q.OrderBy(c => c.ParseStatus) : q.OrderByDescending(c => c.ParseStatus),
            _ => asc ? q.OrderBy(c => c.CreatedAtUtc) : q.OrderByDescending(c => c.CreatedAtUtc)
        };
        return ordered.ThenByDescending(c => c.CandidateId);
    }

    private static RegisterRowDto ToRow(Candidate c, DateOnly today) => new(c.CandidateId, c.FullName, c.Nic, c.DateOfBirth,
        c.DateOfBirth is { } d ? AgeOn(today, d) : null, c.Phone, c.Location, c.Religion, c.OlEnglish, c.OlMaths, c.OlSinhala, c.OlTamil,
        c.OlScience, c.OlSummary, c.AlResults, c.ParseStatus, Utc(c.CreatedAtUtc), c.CreatedBy);

    [HttpGet("register")]
    public async Task<IActionResult> Register([FromQuery(Name = "from")] DateOnly? dateFrom, [FromQuery(Name = "to")] DateOnly? dateTo,
        [FromQuery] string? status, [FromQuery] string? search, [FromQuery] string? sort, [FromQuery] string? dir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 5, 100);
        try
        {
            var q = Filtered(dateFrom, dateTo, status, search);
            var total = await q.CountAsync(ct);
            var rows = await Sorted(q, sort, dir).Skip((page - 1) * pageSize).Take(pageSize).AsNoTracking().ToListAsync(ct);
            var today = TodayLk();
            return Ok(new RegisterResponse(rows.Select(c => ToRow(c, today)).ToList(), total, page, pageSize));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Building the candidate register failed.");
            return StatusCode(500, new { message = "Could not build the report." });
        }
    }

    [HttpGet("register.csv")]
    public async Task<IActionResult> RegisterCsv([FromQuery(Name = "from")] DateOnly? dateFrom, [FromQuery(Name = "to")] DateOnly? dateTo,
        [FromQuery] string? status, [FromQuery] string? search, [FromQuery] string? sort, [FromQuery] string? dir, CancellationToken ct = default)
    {
        try
        {
            var q = Filtered(dateFrom, dateTo, status, search);
            var rows = await Sorted(q, sort, dir).Take(MaxExportRows).AsNoTracking().ToListAsync(ct);
            var today = TodayLk();

            var sb = new StringBuilder();
            sb.Append("Candidate ID,Full Name,NIC,Date of Birth,Age,Mobile,Location,Religion,O/L English,O/L Maths,O/L Sinhala,O/L Tamil,O/L Science,O/L Summary,A/L Results,Status,Date Added (Sri Lanka time),Added By\r\n");
            foreach (var c in rows)
            {
                var age = c.DateOfBirth is { } d ? AgeOn(today, d).ToString() : "";
                var added = (c.CreatedAtUtc + Lk).ToString("yyyy-MM-dd HH:mm");
                sb.Append(string.Join(',',
                    c.CandidateId.ToString(), Csv(c.FullName), CsvText(c.Nic, NicRx), c.DateOfBirth?.ToString("yyyy-MM-dd") ?? "", age,
                    CsvText(c.Phone, DigitsRx), Csv(c.Location), Csv(c.Religion), Csv(c.OlEnglish), Csv(c.OlMaths), Csv(c.OlSinhala), Csv(c.OlTamil),
                    Csv(c.OlScience), Csv(c.OlSummary), Csv(c.AlResults), c.ParseStatus == "OcrRequired" ? "OCR Required" : "Extracted", added, Csv(c.CreatedBy)));
                sb.Append("\r\n");
            }

            logger.LogInformation("Candidate register exported by {User}: {Rows} rows.", User.Identity?.Name, rows.Count);   // exports of personal data are audited
            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();   // BOM so Excel reads Sinhala/Tamil names
            return File(bytes, "text/csv; charset=utf-8", $"candidate-register-{TodayLk():yyyyMMdd}.csv");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Exporting the candidate register failed.");
            return StatusCode(500, new { message = "Could not export the report." });
        }
    }

    // ------------------------------------------------------------------ CSV helpers

    // Quotes a value and neutralises spreadsheet formulas (a CV could contain a name like "=HYPERLINK(...)")
    private static string Csv(string? v)
    {
        if (string.IsNullOrEmpty(v)) return "";
        v = v.Replace("\r", " ").Replace("\n", " ");
        if ("=+-@\t".Contains(v[0])) v = "'" + v;
        return v.Contains(',') || v.Contains('"') ? $"\"{v.Replace("\"", "\"\"")}\"" : v;
    }

    // Validated digit-only values (NIC, mobile) are written as ="0771234567" so Excel keeps the leading zero
    private static string CsvText(string? v, Regex safe) =>
        !string.IsNullOrEmpty(v) && safe.IsMatch(v) ? $"=\"{v}\"" : Csv(v);
}
