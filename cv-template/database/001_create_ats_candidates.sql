-- Run once on database [application] with a login that has CREATE TABLE rights.
-- Table is prefixed ATS_ so it cannot clash with other tables in this shared database.
IF OBJECT_ID(N'dbo.ATS_Candidates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ATS_Candidates
    (
        CandidateId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ATS_Candidates PRIMARY KEY,
        FullName        NVARCHAR(200)  NOT NULL,
        Nic             NVARCHAR(12)   NULL,
        DateOfBirth     DATE           NULL,
        DobSource       NVARCHAR(10)   NULL,      -- 'CV' or 'NIC'
        Phone           NVARCHAR(20)   NULL,
        Location        NVARCHAR(300)  NULL,
        Religion        NVARCHAR(50)   NULL,
        OlEnglish       NVARCHAR(2)    NULL,
        OlMaths         NVARCHAR(2)    NULL,
        OlSinhala       NVARCHAR(2)    NULL,
        OlTamil         NVARCHAR(2)    NULL,
        OlScience       NVARCHAR(2)    NULL,
        OlSummary       NVARCHAR(50)   NULL,
        AlResults       NVARCHAR(500)  NULL,
        Notes           NVARCHAR(1000) NULL,
        SourceFileName  NVARCHAR(260)  NULL,
        ParseStatus     NVARCHAR(20)   NOT NULL CONSTRAINT DF_ATS_Candidates_ParseStatus DEFAULT (N'Extracted'),
        CreatedAtUtc    DATETIME2      NOT NULL CONSTRAINT DF_ATS_Candidates_Created DEFAULT (SYSUTCDATETIME()),
        UpdatedAtUtc    DATETIME2      NULL
    );

    -- Duplicate protection: one candidate per NIC (NULL NICs are allowed many times)
    CREATE UNIQUE INDEX UX_ATS_Candidates_Nic ON dbo.ATS_Candidates (Nic) WHERE Nic IS NOT NULL;
    CREATE INDEX IX_ATS_Candidates_Created ON dbo.ATS_Candidates (CreatedAtUtc DESC);
END
GO

-- Quick check
SELECT TOP 20 * FROM dbo.ATS_Candidates ORDER BY CandidateId DESC;
