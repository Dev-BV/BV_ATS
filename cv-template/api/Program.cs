using CvTemplate.Api.Data;
using CvTemplate.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
// Development only: in IIS the address comes from the site binding
if (builder.Environment.IsDevelopment()) builder.WebHost.UseUrls("http://localhost:5080");

var connectionString = builder.Configuration.GetConnectionString("AtsDb");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException(
        "Connection string 'AtsDb' is not set. Development: dotnet user-secrets set \"ConnectionStrings:AtsDb\" \"<your connection string>\". Server: put it in appsettings.Production.json (see deploy/HOSTING.md).");

builder.Services.AddControllers();
builder.Services.AddAtsAuth(builder.Configuration);
builder.Services.AddDbContext<AtsDbContext>(o => o.UseSqlServer(connectionString));
builder.Services.AddSingleton<ICvTextExtractor, CvTextExtractor>();
builder.Services.AddSingleton<ICvDataParser, CvDataParser>();

var app = builder.Build();
app.UseAtsSpa();            // security headers + the built web app (wwwroot)
app.UseAtsAuth();
app.MapControllers();
app.MapAtsSpaFallback();
app.Run();
