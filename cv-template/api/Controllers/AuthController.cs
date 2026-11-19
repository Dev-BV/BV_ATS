using System.Security.Claims;
using CvTemplate.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CvTemplate.Api.Controllers;

public record LoginRequest(string? Username, string? Password, bool RememberMe);

[ApiController]
[Route("api/v1/auth")]
public class AuthController(IAlmanacAuthClient almanac, ILogger<AuthController> logger) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var username = request.Username?.Trim();
        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(request.Password))
            return BadRequest(new { message = "Username and password are required." });
        if (username.Length > 100 || request.Password.Length > 200)
            return BadRequest(new { message = "Username or password is too long." });

        var result = await almanac.AuthenticateAsync(username, request.Password, ct);

        switch (result.Outcome)
        {
            case AuthOutcome.Success:
                break;
            case AuthOutcome.InvalidCredentials:
                logger.LogWarning("Failed sign-in for user {User}.", username);   // the password is never logged
                return Unauthorized(new { message = "Invalid username or password." });
            default:
                return StatusCode(503, new { message = "The sign-in service is not available right now. Please try again shortly." });
        }

        var displayName = string.IsNullOrWhiteSpace(result.DisplayName) ? username : result.DisplayName!;
        var identity = new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.Name, username), new Claim("display_name", displayName) },
            CookieAuthenticationDefaults.AuthenticationScheme);

        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties
            {
                IsPersistent = request.RememberMe,   // "Remember me" = cookie survives closing the browser
                ExpiresUtc = DateTimeOffset.UtcNow.Add(request.RememberMe ? TimeSpan.FromDays(7) : TimeSpan.FromHours(8))
            });

        logger.LogInformation("User {User} signed in.", username);
        return Ok(new { username, displayName });
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var name = User.Identity?.Name ?? "";
        return Ok(new { username = name, displayName = User.FindFirst("display_name")?.Value ?? name });
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }
}
