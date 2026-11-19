using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace CvTemplate.Api.Services;

public static class AuthSetup
{
    public static IServiceCollection AddAtsAuth(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<AlmanacOptions>(config.GetSection("Almanac"));
        services.AddHttpClient<IAlmanacAuthClient, AlmanacAuthClient>(c => c.Timeout = TimeSpan.FromSeconds(15));

        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(o =>
            {
                o.Cookie.Name = "ats.auth";
                o.Cookie.HttpOnly = true;                               // not readable from JavaScript
                o.Cookie.SameSite = SameSiteMode.Lax;
                // Auth:SecureCookies = true once the site is served over HTTPS (recommended)
                o.Cookie.SecurePolicy = config.GetValue<bool>("Auth:SecureCookies") ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
                o.SlidingExpiration = false;
                // APIs answer 401/403 instead of redirecting to a login page
                o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
                o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
            });
        services.AddAuthorization();

        // Slow down password guessing: 8 sign-in attempts per minute per client address
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 8, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        return services;
    }

    public static WebApplication UseAtsAuth(this WebApplication app)
    {
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        return app;
    }
}
