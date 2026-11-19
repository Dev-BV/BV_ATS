namespace CvTemplate.Api.Models;

public class Candidate
{
    public int CandidateId { get; set; }
    public string FullName { get; set; } = "";
    public string? Nic { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? DobSource { get; set; }
    public string? Phone { get; set; }
    public string? Location { get; set; }
    public string? Religion { get; set; }
    public string? OlEnglish { get; set; }
    public string? OlMaths { get; set; }
    public string? OlSinhala { get; set; }
    public string? OlTamil { get; set; }
    public string? OlScience { get; set; }
    public string? OlSummary { get; set; }
    public string? AlResults { get; set; }
    public string? Notes { get; set; }
    public string? SourceFileName { get; set; }
    public string ParseStatus { get; set; } = "Extracted";
    public DateTime CreatedAtUtc { get; set; }
    public string? CreatedBy { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
    public string? DeletedBy { get; set; }
}
