using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.StaticFiles;

namespace CvTemplate.Api.Services;

/// <summary>Serves the built React app (api/wwwroot) from the same site as the API.</summary>
public static class SpaSetup
{
    private static void Cache(StaticFileResponseContext ctx)
    {
        var headers = ctx.Context.Response.Headers;
        if (ctx.File.Name.Equals("index.html", StringComparison.OrdinalIgnoreCase))
            headers["Cache-Control"] = "no-store";                              // a new deployment is picked up immediately
        else if (ctx.Context.Request.Path.StartsWithSegments("/assets"))
            headers["Cache-Control"] = "public, max-age=31536000, immutable";   // build output has hashed file names
    }

    public static WebApplication UseAtsSpa(this WebApplication app)
    {
        app.Use(async (ctx, next) =>
        {
            var h = ctx.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "DENY";
            h["Referrer-Policy"] = "same-origin";
            h["Content-Security-Policy"] =
                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
                "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
            await next();
        });
        app.UseDefaultFiles();
        app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = Cache });
        return app;
    }

    // Any other address (e.g. /candidates/12 opened directly or refreshed) gets the app; unknown /api addresses get a real 404.
    public static WebApplication MapAtsSpaFallback(this WebApplication app)
    {
        app.MapFallback("/api/{**path}", () => Results.NotFound(new { message = "Not found." }));
        app.MapFallbackToFile("index.html", new StaticFileOptions { OnPrepareResponse = Cache });
        return app;
    }
}
