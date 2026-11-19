using System.Text.RegularExpressions;
using CvTemplate.Api.Data;
using CvTemplate.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CvTemplate.Api.Controllers;

public record SaveCandidateRequest(
    string? FullName, string? Nic, DateOnly? DateOfBirth, string? DobSource, string? Phone,
    string? Location, string? Religion,
    string? OlEnglish, string? OlMaths, string? OlSinhala, string? OlTamil, string? OlScience,
    string? OlSummary, string? AlResults, string? Notes, string? SourceFileName, bool RequiresOcr);

public record RecentCandidateDto(int CandidateId, string FullName, string? SourceFileName, DateTime CreatedAtUtc, string ParseStatus);

public record CandidateListItemDto(int CandidateId, string FullName, string? Nic, string? Phone, string? Location,
    string? SourceFileName, DateTime CreatedAtUtc, string ParseStatus);
public record CandidateListResponse(List<CandidateListItemDto> Items, int Total, int Page, int PageSize);

public record CandidateDetailDto(
    int CandidateId, string FullName, string? Nic, DateOnly? DateOfBirth, string? DobSource, string? Phone, string? Location,
    string? Religion, string? OlEnglish, string? OlMaths, string? OlSinhala, string? OlTamil, string? OlScience,
    string? OlSummary, string? AlResults, string? Notes, string? SourceFileName, string ParseStatus,
    DateTime CreatedAtUtc, string? CreatedBy, DateTime? UpdatedAtUtc, string? UpdatedBy);

[ApiController]
[Authorize]
[Route("api/v1/candidates")]
public class CandidatesController(AtsDbContext db, ILogger<CandidatesController> logger) : ControllerBase
{
    private static readonly Regex NicRx = new(@"^(\d{9}[VvXx]|\d{12})$", RegexOptions.Compiled);
    private static readonly Regex PhoneRawRx = new(@"^[\d\s\-+()]+$", RegexOptions.Compiled);
    private static readonly Regex MobileRx = new(@"^07\d{8}$", RegexOptions.Compiled);
    private static readonly Regex GradeRx = new(@"^[ABCSFWabcsfw]$", RegexOptions.Compiled);
    private static readonly Regex NameRx = new(@"^[\p{L}\s.'\-]+$", RegexOptions.Compiled);
    private static readonly string[] Religions = { "Buddhism", "Catholic", "Christian", "Hindu", "Islam", "Other" };
    private static readonly TimeSpan Lk = TimeSpan.FromHours(5.5);   // Sri Lanka time (no daylight saving)

    // Soft-deleted candidates are hidden everywhere (also enforced by a global query filter in AtsDbContext)
    private IQueryable<Candidate> Active => db.Candidates.Where(c => !c.IsDeleted);
    private string? CurrentUser => User.Identity?.Name;
    private static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);

    // ------------------------------------------------------------------ create

    [HttpPost]
    public async Task<IActionResult> Save([FromBody] SaveCandidateRequest request, CancellationToken ct)
    {
        var errors = Validate(request);
        if (errors.Count > 0) return BadRequest(new { message = "Please correct the highlighted fields.", errors });

        var nic = Clean(request.Nic)?.ToUpperInvariant();
        if (nic is not null && await Active.AnyAsync(c => c.Nic == nic, ct)) return DuplicateNic();

        var candidate = new Candidate
        {
            SourceFileName = Clean(request.SourceFileName),
            ParseStatus = request.RequiresOcr ? "OcrRequired" : "Extracted",
            CreatedAtUtc = DateTime.UtcNow,
            CreatedBy = CurrentUser
        };
        Apply(candidate, request);
        db.Candidates.Add(candidate);

        var failure = await TrySaveAsync(ct);
        return failure ?? StatusCode(201, new { candidateId = candidate.CandidateId });
    }

    // ------------------------------------------------------------------ read

    [HttpGet("recent")]
    public async Task<IActionResult> Recent([FromQuery] int count = 10, CancellationToken ct = default)
    {
        count = Math.Clamp(count, 1, 50);
        try
        {
            var rows = await Active.AsNoTracking()
                .OrderByDescending(c => c.CreatedAtUtc)
                .Take(count)
                .Select(c => new { c.CandidateId, c.FullName, c.SourceFileName, c.CreatedAtUtc, c.ParseStatus })
                .ToListAsync(ct);

            return Ok(rows.Select(r => new RecentCandidateDto(r.CandidateId, r.FullName, r.SourceFileName, Utc(r.CreatedAtUtc), r.ParseStatus)));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Loading recent candidates failed.");
            return StatusCode(500, new { message = "Could not load candidates." });
        }
    }

    // Search + filter + sort + paging, all done in the database
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search, [FromQuery] string? status,
        [FromQuery(Name = "from")] DateOnly? dateFrom, [FromQuery(Name = "to")] DateOnly? dateTo,
        [FromQuery] string? sort, [FromQuery] string? dir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 5, 100);
        try
        {
            var q = Active;

            var s = Clean(search);
            if (s is not null)
            {
                var digits = new string(s.Where(char.IsDigit).ToArray());
                if (digits.StartsWith("0094")) digits = "0" + digits[4..];
                else if (digits.StartsWith("94") && digits.Length > 3) digits = "0" + digits[2..];

                q = digits.Length >= 3
                    ? q.Where(c => c.FullName.Contains(s) || (c.Nic != null && c.Nic.Contains(s)) ||
                                   (c.Phone != null && c.Phone.Contains(digits)) || (c.Location != null && c.Location.Contains(s)))
                    : q.Where(c => c.FullName.Contains(s) || (c.Nic != null && c.Nic.Contains(s)) ||
                                   (c.Location != null && c.Location.Contains(s)));
            }

            if (status is "Extracted" or "OcrRequired") q = q.Where(c => c.ParseStatus == status);
            if (dateFrom is { } f) { var fromUtc = f.ToDateTime(TimeOnly.MinValue) - Lk; q = q.Where(c => c.CreatedAtUtc >= fromUtc); }
            if (dateTo is { } t) { var toUtc = t.ToDateTime(TimeOnly.MinValue).AddDays(1) - Lk; q = q.Where(c => c.CreatedAtUtc < toUtc); }

            var total = await q.CountAsync(ct);

            var asc = string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
            IOrderedQueryable<Candidate> ordered = sort?.ToLowerInvariant() switch
            {
                "name" => asc ? q.OrderBy(c => c.FullName) : q.OrderByDescending(c => c.FullName),
                "status" => asc ? q.OrderBy(c => c.ParseStatus) : q.OrderByDescending(c => c.ParseStatus),
                _ => asc ? q.OrderBy(c => c.CreatedAtUtc) : q.OrderByDescending(c => c.CreatedAtUtc)
            };

            var rows = await ordered.ThenByDescending(c => c.CandidateId)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(c => new { c.CandidateId, c.FullName, c.Nic, c.Phone, c.Location, c.SourceFileName, c.CreatedAtUtc, c.ParseStatus })
                .ToListAsync(ct);

            var items = rows.Select(r => new CandidateListItemDto(r.CandidateId, r.FullName, r.Nic, r.Phone, r.Location,
                r.SourceFileName, Utc(r.CreatedAtUtc), r.ParseStatus)).ToList();
            return Ok(new CandidateListResponse(items, total, page, pageSize));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Listing candidates failed.");
            return StatusCode(500, new { message = "Could not load candidates." });
        }
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct)
    {
        var c = await Active.AsNoTracking().FirstOrDefaultAsync(x => x.CandidateId == id, ct);
        if (c is null) return NotFound(new { message = "Candidate not found." });

        return Ok(new CandidateDetailDto(c.CandidateId, c.FullName, c.Nic, c.DateOfBirth, c.DobSource, c.Phone, c.Location,
            c.Religion, c.OlEnglish, c.OlMaths, c.OlSinhala, c.OlTamil, c.OlScience, c.OlSummary, c.AlResults, c.Notes,
            c.SourceFileName, c.ParseStatus, Utc(c.CreatedAtUtc), c.CreatedBy,
            c.UpdatedAtUtc is { } u ? Utc(u) : null, c.UpdatedBy));
    }

    // ------------------------------------------------------------------ update

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] SaveCandidateRequest request, CancellationToken ct)
    {
        var errors = Validate(request);
        if (errors.Count > 0) return BadRequest(new { message = "Please correct the highlighted fields.", errors });

        var c = await Active.FirstOrDefaultAsync(x => x.CandidateId == id, ct);
        if (c is null) return NotFound(new { message = "Candidate not found." });

        var nic = Clean(request.Nic)?.ToUpperInvariant();
        if (nic is not null && await Active.AnyAsync(x => x.Nic == nic && x.CandidateId != id, ct)) return DuplicateNic();

        Apply(c, request);   // source file name and parse status stay as they were when the CV was first uploaded
        c.UpdatedAtUtc = DateTime.UtcNow;
        c.UpdatedBy = CurrentUser;

        var failure = await TrySaveAsync(ct);
        return failure ?? Ok(new { candidateId = id });
    }

    // ------------------------------------------------------------------ delete (soft)

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var c = await Active.FirstOrDefaultAsync(x => x.CandidateId == id, ct);
        if (c is null) return NotFound(new { message = "Candidate not found." });

        c.IsDeleted = true;
        c.DeletedAtUtc = DateTime.UtcNow;
        c.DeletedBy = CurrentUser;

        var failure = await TrySaveAsync(ct);
        if (failure is not null) return failure;

        logger.LogInformation("Candidate {Id} was deleted by {User}.", id, CurrentUser);
        return NoContent();
    }

    // ------------------------------------------------------------------ helpers

    private IActionResult DuplicateNic() => Conflict(new
    {
        message = "A candidate with this NIC already exists.",
        errors = new Dictionary<string, string> { ["nic"] = "A candidate with this NIC already exists." }
    });

    private async Task<IActionResult?> TrySaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
            return null;
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("UX_ATS_Candidates_Nic") == true)
        {
            return DuplicateNic();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Saving candidate failed.");   // candidate values are never logged
            return StatusCode(500, new { message = "Could not save the candidate. Check the database connection and try again." });
        }
    }

    private static void Apply(Candidate c, SaveCandidateRequest r)
    {
        c.FullName = r.FullName!.Trim();
        c.Nic = Clean(r.Nic)?.ToUpperInvariant();
        c.DateOfBirth = r.DateOfBirth;
        c.DobSource = Clean(r.DobSource);
        c.Phone = NormalizeMobile(r.Phone);
        c.Location = Clean(r.Location);
        c.Religion = Religions.First(x => x.Equals(Clean(r.Religion), StringComparison.OrdinalIgnoreCase));
        c.OlEnglish = Grade(r.OlEnglish);
        c.OlMaths = Grade(r.OlMaths);
        c.OlSinhala = Grade(r.OlSinhala);
        c.OlTamil = Grade(r.OlTamil);
        c.OlScience = Grade(r.OlScience);
        c.OlSummary = Clean(r.OlSummary);
        c.AlResults = Clean(r.AlResults);
        c.Notes = Clean(r.Notes);
    }

    // Returns field name (camelCase, matches the JSON) -> message. Empty = valid.
    private static Dictionary<string, string> Validate(SaveCandidateRequest r)
    {
        var e = new Dictionary<string, string>();

        var name = Clean(r.FullName);
        if (name is null) e["fullName"] = "Full name is required.";
        else if (name.Length < 2 || name.Length > 200) e["fullName"] = "Full name must be 2 to 200 characters.";
        else if (!NameRx.IsMatch(name)) e["fullName"] = "Full name can contain letters, spaces, . ' and - only.";

        var nic = Clean(r.Nic);
        if (nic is null) e["nic"] = "NIC number is required.";
        else if (!NicRx.IsMatch(nic)) e["nic"] = "NIC must be 9 digits followed by V or X, or 12 digits.";

        if (r.DateOfBirth is not { } dob) e["dateOfBirth"] = "Date of birth is required.";
        else if (dob.Year < 1930 || dob > DateOnly.FromDateTime(DateTime.UtcNow)) e["dateOfBirth"] = "Date of birth is not valid.";

        var phone = Clean(r.Phone);
        if (phone is null) e["phone"] = "Contact mobile number is required.";
        else if (!PhoneRawRx.IsMatch(phone) || NormalizeMobile(phone) is null)
            e["phone"] = "Enter a valid Sri Lankan mobile number, e.g. 0771234567 or +94771234567.";

        var location = Clean(r.Location);
        if (location is null) e["location"] = "Location is required.";
        else if (location.Length < 5 || location.Length > 300) e["location"] = "Location must be 5 to 300 characters.";

        var religion = Clean(r.Religion);
        if (religion is null) e["religion"] = "Religion is required.";
        else if (!Religions.Any(x => x.Equals(religion, StringComparison.OrdinalIgnoreCase))) e["religion"] = "Select a valid religion.";

        void CheckGrade(string key, string? value, string label, bool required)
        {
            var g = Clean(value);
            if (g is null) { if (required) e[key] = $"{label} grade is required."; }
            else if (!GradeRx.IsMatch(g)) e[key] = "Grade must be A, B, C, S, F or W.";
        }
        CheckGrade("olEnglish", r.OlEnglish, "English", true);
        CheckGrade("olMaths", r.OlMaths, "Maths", true);
        CheckGrade("olSinhala", r.OlSinhala, "Sinhala", true);
        CheckGrade("olScience", r.OlScience, "Science", true);
        CheckGrade("olTamil", r.OlTamil, "Tamil", false);

        if ((r.OlSummary?.Length ?? 0) > 50) e["olSummary"] = "O/L summary is too long (max 50).";
        if ((r.AlResults?.Length ?? 0) > 500) e["alResults"] = "A/L results are too long (max 500).";
        if ((r.Notes?.Length ?? 0) > 1000) e["notes"] = "Notes are too long (max 1000).";

        return e;
    }

    // 0771234567 / +94 77 123 4567 / 0094771234567 -> 0771234567 ; null if not a Sri Lankan mobile number
    private static string? NormalizeMobile(string? s)
    {
        var t = Clean(s);
        if (t is null) return null;
        var digits = new string(t.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("0094")) digits = "0" + digits[4..];
        else if (digits.StartsWith("94") && digits.Length == 11) digits = "0" + digits[2..];
        return MobileRx.IsMatch(digits) ? digits : null;
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    private static string? Grade(string? s) => Clean(s)?.ToUpperInvariant();
}
