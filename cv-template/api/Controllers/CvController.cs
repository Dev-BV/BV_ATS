using CvTemplate.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CvTemplate.Api.Controllers;

public record CvExtractResponse(
    string? FullName,
    string? Nic,
    string? DateOfBirth,
    string? DobSource,
    string? Phone,
    string? Location,
    string? Religion,
    string? OlEnglish,
    string? OlMaths,
    string? OlSinhala,
    string? OlTamil,
    string? OlScience,
    string? OlSummary,
    string? AlResults,
    bool RequiresOcr,
    string Message);

[ApiController]
[Authorize]
[Route("api/v1/cv")]
public class CvController(ICvTextExtractor extractor, ICvDataParser parser, ILogger<CvController> logger) : ControllerBase
{
    private const long MaxBytes = 5 * 1024 * 1024; // 5 MB

    [HttpPost("extract")]
    [RequestSizeLimit(MaxBytes + 64 * 1024)]
    public async Task<IActionResult> Extract(IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "Please choose a CV file." });
        if (file.Length > MaxBytes)
            return BadRequest(new { message = "File is too large (max 5 MB)." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext is not (".pdf" or ".docx"))
            return BadRequest(new { message = "Only PDF and DOCX files are allowed." });

        // Held in memory only - nothing is saved to disk or database in this template
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var bytes = ms.ToArray();

        // Check real file signature, not just the extension
        var validSignature = ext == ".pdf"
            ? bytes.Length > 4 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46   // %PDF
            : bytes.Length > 4 && bytes[0] == 0x50 && bytes[1] == 0x4B;                                          // PK (zip)
        if (!validSignature)
            return BadRequest(new { message = "File content does not match its extension." });

        try
        {
            ms.Position = 0;
            var text = extractor.Extract(ms, ext);

            if (text.Trim().Length < 20)
                return Ok(new CvExtractResponse(null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    true, "No readable text found. This looks like a scanned CV (OCR needed)."));

            var parsed = parser.Parse(text);
            return Ok(new CvExtractResponse(
                parsed.FullName, parsed.Nic, parsed.DateOfBirth, parsed.DobSource, parsed.Phone,
                parsed.Location, parsed.Religion,
                parsed.OlEnglish, parsed.OlMaths, parsed.OlSinhala, parsed.OlTamil, parsed.OlScience, parsed.OlSummary,
                parsed.AlResults,
                false, "Extraction complete. Please review the values."));
        }
        catch (Exception ex)
        {
            // Do not log CV content (contains personal data)
            logger.LogError(ex, "CV extraction failed.");
            return StatusCode(500, new { message = "Could not read this file. It may be corrupted or password-protected." });
        }
    }
}
