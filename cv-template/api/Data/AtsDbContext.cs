using CvTemplate.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CvTemplate.Api.Data;

public class AtsDbContext(DbContextOptions<AtsDbContext> options) : DbContext(options)
{
    public DbSet<Candidate> Candidates => Set<Candidate>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Candidate>(e =>
        {
            e.ToTable("ATS_Candidates", "dbo");
            e.HasKey(x => x.CandidateId);
            e.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Nic).HasMaxLength(12);
            e.Property(x => x.DobSource).HasMaxLength(10);
            e.Property(x => x.Phone).HasMaxLength(20);
            e.Property(x => x.Location).HasMaxLength(300);
            e.Property(x => x.Religion).HasMaxLength(50);
            e.Property(x => x.OlEnglish).HasMaxLength(2);
            e.Property(x => x.OlMaths).HasMaxLength(2);
            e.Property(x => x.OlSinhala).HasMaxLength(2);
            e.Property(x => x.OlTamil).HasMaxLength(2);
            e.Property(x => x.OlScience).HasMaxLength(2);
            e.Property(x => x.OlSummary).HasMaxLength(50);
            e.Property(x => x.AlResults).HasMaxLength(500);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.SourceFileName).HasMaxLength(260);
            e.Property(x => x.ParseStatus).HasMaxLength(20).IsRequired();
            e.Property(x => x.CreatedBy).HasMaxLength(100);
            e.Property(x => x.UpdatedBy).HasMaxLength(100);
            e.Property(x => x.DeletedBy).HasMaxLength(100);
            e.HasQueryFilter(x => !x.IsDeleted);   // soft-deleted candidates never appear in any query
            e.HasIndex(x => x.Nic).IsUnique().HasFilter("[Nic] IS NOT NULL AND [IsDeleted] = 0").HasDatabaseName("UX_ATS_Candidates_Nic");
        });
    }
}
