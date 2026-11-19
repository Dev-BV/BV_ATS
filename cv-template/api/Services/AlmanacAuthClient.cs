using System.Net;
using System.Text;
using System.Xml.Linq;
using Microsoft.Extensions.Options;

namespace CvTemplate.Api.Services;

/// <summary>Settings for the ALMANAC SOAP service (section "Almanac" in appsettings.json).</summary>
public class AlmanacOptions
{
    public string Url { get; set; } = "http://apps.bellvantage.com:8048/Service/ALMANACService.asmx";
    public string Namespace { get; set; } = "http://tempuri.org/";
    public string Operation { get; set; } = "AuthenticateUser";
    public string UsernameParam { get; set; } = "userName";   // CHECK against the service page
    public string PasswordParam { get; set; } = "password";   // CHECK against the service page
    public string? SoapAction { get; set; }                   // optional override
    public string SuccessValue { get; set; } = "LOGIN_OK";    // text the service returns when the login is accepted
}

public enum AuthOutcome { Success, InvalidCredentials, ServiceUnavailable, UnexpectedResponse }

public record AlmanacAuthResult(AuthOutcome Outcome, string? DisplayName = null);

public interface IAlmanacAuthClient
{
    Task<AlmanacAuthResult> AuthenticateAsync(string username, string password, CancellationToken ct);
}

/// <summary>
/// Calls ALMANAC AuthenticateUser (SOAP 1.1). Credentials are only ever sent server-to-server.
/// Fails CLOSED: anything that is not clearly "true" is treated as a failed login.
/// </summary>
public class AlmanacAuthClient(HttpClient http, IOptions<AlmanacOptions> options, ILogger<AlmanacAuthClient> logger) : IAlmanacAuthClient
{
    private static readonly XNamespace Soap = "http://schemas.xmlsoap.org/soap/envelope/";
    private readonly AlmanacOptions o = options.Value;

    public async Task<AlmanacAuthResult> AuthenticateAsync(string username, string password, CancellationToken ct)
    {
        XNamespace ns = o.Namespace;
        // XElement escapes the values, so credentials cannot inject XML
        var envelope = new XElement(Soap + "Envelope",
            new XAttribute(XNamespace.Xmlns + "soap", Soap),
            new XElement(Soap + "Body",
                new XElement(ns + o.Operation,
                    new XElement(ns + o.UsernameParam, username),
                    new XElement(ns + o.PasswordParam, password))));

        var action = o.SoapAction ?? $"{o.Namespace.TrimEnd('/')}/{o.Operation}";
        using var request = new HttpRequestMessage(HttpMethod.Post, o.Url)
        {
            Content = new StringContent(envelope.ToString(SaveOptions.DisableFormatting), Encoding.UTF8, "text/xml")
        };
        request.Headers.TryAddWithoutValidation("SOAPAction", $"\"{action}\"");

        string body;
        HttpStatusCode status;
        try
        {
            using var response = await http.SendAsync(request, ct);
            status = response.StatusCode;
            body = await response.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogError("ALMANAC authentication service not reachable: {Type}", ex.GetType().Name);
            return new AlmanacAuthResult(AuthOutcome.ServiceUnavailable);
        }

        XDocument doc;
        try { doc = XDocument.Parse(body); }
        catch
        {
            logger.LogError("ALMANAC returned a non-XML response (HTTP {Status}).", (int)status);
            return new AlmanacAuthResult(AuthOutcome.ServiceUnavailable);
        }

        var fault = doc.Descendants(Soap + "Fault").FirstOrDefault();
        if (fault is not null)
        {
            logger.LogError("ALMANAC returned a SOAP fault: {Fault}", fault.Element("faultstring")?.Value);
            return new AlmanacAuthResult(AuthOutcome.ServiceUnavailable);
        }

        var result = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == o.Operation + "Result");
        if (result is null) return Unexpected(doc);

        // Shape 1: the service returns a status string, e.g. <AuthenticateUserResult>LOGIN_OK</AuthenticateUserResult>
        if (!result.HasElements)
        {
            var text = result.Value.Trim();
            if (text.Equals(o.SuccessValue, StringComparison.OrdinalIgnoreCase))
                return new AlmanacAuthResult(AuthOutcome.Success);
            if (bool.TryParse(text, out var ok))                       // also accept plain true/false
                return new AlmanacAuthResult(ok ? AuthOutcome.Success : AuthOutcome.InvalidCredentials);

            // Any other status text = login not accepted. The code is logged to help diagnose (it is a status, not a credential).
            logger.LogWarning("ALMANAC did not accept the login. Result code: {Code}", text.Length > 60 ? text[..60] : text);
            return new AlmanacAuthResult(AuthOutcome.InvalidCredentials);
        }

        // Shape 2: an object with a Success / IsAuthenticated style flag
        string? Child(params string[] names) =>
            result.Elements().FirstOrDefault(e => names.Contains(e.Name.LocalName, StringComparer.OrdinalIgnoreCase))?.Value.Trim();

        var flag = Child("Success", "IsSuccess", "IsAuthenticated", "Authenticated", "IsValid");
        if (flag is not null && bool.TryParse(flag, out var success))
            return new AlmanacAuthResult(success ? AuthOutcome.Success : AuthOutcome.InvalidCredentials,
                success ? Child("FullName", "DisplayName", "Name", "UserName") : null);

        return Unexpected(doc);
    }

    private AlmanacAuthResult Unexpected(XDocument doc)
    {
        // Log only the element NAMES (never values) so the response shape can be checked safely
        var shape = string.Join(", ", doc.Descendants().Select(e => e.Name.LocalName).Take(15));
        logger.LogError("ALMANAC response was not recognised. Elements: {Shape}", shape);
        return new AlmanacAuthResult(AuthOutcome.UnexpectedResponse);
    }
}
