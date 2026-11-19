using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace CvTemplate.Api.Services;

public interface ICvTextExtractor
{
    string Extract(Stream stream, string extension);
}

public class CvTextExtractor : ICvTextExtractor
{
    public string Extract(Stream stream, string extension) => extension switch
    {
        ".pdf" => FromPdf(stream),
        ".docx" => FromDocx(stream),
        _ => throw new NotSupportedException("Unsupported file type.")
    };

    private static string FromPdf(Stream stream)
    {
        var sb = new StringBuilder();
        using var doc = PdfDocument.Open(stream);
        foreach (var page in doc.GetPages())
            sb.AppendLine(ContentOrderTextExtractor.GetText(page));
        return sb.ToString();
    }

    private static string FromDocx(Stream stream)
    {
        var sb = new StringBuilder();
        using var doc = WordprocessingDocument.Open(stream, false);
        var body = doc.MainDocumentPart?.Document?.Body;
        if (body is null) return string.Empty;
        foreach (var p in body.Descendants<Paragraph>())
            sb.AppendLine(p.InnerText);
        return sb.ToString();
    }
}
