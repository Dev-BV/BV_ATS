using CvTemplate.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CvTemplate.Api.Controllers;

public record DayPoint(string Date, int Applications, int Extracted, int OcrRequired);
public record MonthPoint(string Month, int Applications, int Extracted, int OcrRequired);   // Month = "yyyy-MM"
public record DashboardSummaryDto(int Total, int Extracted, int OcrRequired, List<DayPoint> Daily, List<MonthPoint> Monthly);

[ApiController]
[Authorize]
[Route("api/v1/dashboard")]
public class DashboardController(AtsDbContext db, ILogger<DashboardController> logger) : ControllerBase
{
    // Days and months are counted in Sri Lanka time (UTC+05:30, no daylight saving)
    private static readonly TimeSpan Lk = TimeSpan.FromHours(5.5);

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        try
        {
            var nowLk = DateTime.UtcNow + Lk;
            var firstMonth = new DateTime(nowLk.Year, nowLk.Month, 1).AddMonths(-5);   // 6 months including this one
            var firstDay = nowLk.Date.AddDays(-13);                                     // last 14 days including today
            var windowStartUtc = firstMonth - Lk;

            var total = await db.Candidates.CountAsync(ct);
            var byStatus = await db.Candidates.GroupBy(c => c.ParseStatus)
                .Select(g => new { Status = g.Key, N = g.Count() }).ToListAsync(ct);
            var rows = await db.Candidates.AsNoTracking()
                .Where(c => c.CreatedAtUtc >= windowStartUtc)
                .Select(c => new { c.CreatedAtUtc, c.ParseStatus })
                .ToListAsync(ct);

            var local = rows.Select(r => (When: r.CreatedAtUtc + Lk, Ocr: r.ParseStatus == "OcrRequired")).ToList();

            var monthly = Enumerable.Range(0, 6).Select(i =>
            {
                var m = firstMonth.AddMonths(i);
                var inMonth = local.Where(r => r.When.Year == m.Year && r.When.Month == m.Month).ToList();
                var ocr = inMonth.Count(r => r.Ocr);
                return new MonthPoint(m.ToString("yyyy-MM"), inMonth.Count, inMonth.Count - ocr, ocr);
            }).ToList();

            var daily = Enumerable.Range(0, 14).Select(i =>
            {
                var d = firstDay.AddDays(i);
                var inDay = local.Where(r => r.When.Date == d).ToList();
                var ocr = inDay.Count(r => r.Ocr);
                return new DayPoint(d.ToString("yyyy-MM-dd"), inDay.Count, inDay.Count - ocr, ocr);
            }).ToList();

            var ocrTotal = byStatus.FirstOrDefault(s => s.Status == "OcrRequired")?.N ?? 0;
            return Ok(new DashboardSummaryDto(total, total - ocrTotal, ocrTotal, daily, monthly));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Loading dashboard summary failed.");
            return StatusCode(500, new { message = "Could not load the dashboard." });
        }
    }
}
