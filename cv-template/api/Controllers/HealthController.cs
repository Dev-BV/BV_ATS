using CvTemplate.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CvTemplate.Api.Controllers;

/// <summary>Open this address after a deployment to confirm the app and the database connection work.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/v1/health")]
public class HealthController(AtsDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        bool ok;
        try { ok = await db.Database.CanConnectAsync(ct); }
        catch { ok = false; }
        return StatusCode(ok ? 200 : 503, new { status = ok ? "ok" : "degraded", database = ok });   // no details are exposed
    }
}
