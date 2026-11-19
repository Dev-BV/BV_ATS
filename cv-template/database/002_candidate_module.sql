-- Candidate module: audit columns + soft delete. Safe to run once on top of 001 (existing rows are kept).
IF COL_LENGTH('dbo.ATS_Candidates', 'CreatedBy') IS NULL
    ALTER TABLE dbo.ATS_Candidates ADD CreatedBy NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.ATS_Candidates', 'UpdatedBy') IS NULL
    ALTER TABLE dbo.ATS_Candidates ADD UpdatedBy NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.ATS_Candidates', 'IsDeleted') IS NULL
    ALTER TABLE dbo.ATS_Candidates ADD IsDeleted BIT NOT NULL CONSTRAINT DF_ATS_Candidates_IsDeleted DEFAULT (0);
IF COL_LENGTH('dbo.ATS_Candidates', 'DeletedAtUtc') IS NULL
    ALTER TABLE dbo.ATS_Candidates ADD DeletedAtUtc DATETIME2 NULL;
IF COL_LENGTH('dbo.ATS_Candidates', 'DeletedBy') IS NULL
    ALTER TABLE dbo.ATS_Candidates ADD DeletedBy NVARCHAR(100) NULL;
GO

-- The NIC must be unique among ACTIVE candidates only, so a deleted candidate can be added again later.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ATS_Candidates_Nic' AND object_id = OBJECT_ID('dbo.ATS_Candidates'))
    DROP INDEX UX_ATS_Candidates_Nic ON dbo.ATS_Candidates;
GO
CREATE UNIQUE INDEX UX_ATS_Candidates_Nic ON dbo.ATS_Candidates (Nic) WHERE Nic IS NOT NULL AND IsDeleted = 0;
GO

-- Quick check
SELECT TOP 20 CandidateId, FullName, Nic, IsDeleted, CreatedBy, UpdatedBy FROM dbo.ATS_Candidates ORDER BY CandidateId DESC;
