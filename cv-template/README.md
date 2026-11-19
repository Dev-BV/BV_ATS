# Bellvantage ATS - CV Extract Template

## 1. Create / update the table (run each script once, in order)
Run on database `application` (needs a login with CREATE/ALTER TABLE rights):
1. `database/001_create_ats_candidates.sql`  - creates `dbo.ATS_Candidates`
2. `database/002_candidate_module.sql`      - adds audit columns + soft delete (keeps existing rows)

## 2. Store the connection string as a user secret (never commit the password)
cd api
dotnet user-secrets set "ConnectionStrings:AtsDb" "Data Source=10.9.8.27;Initial Catalog=application;User ID=belldevusr;Password=<PASSWORD>;TrustServerCertificate=True"

## 3. Sign-in (ALMANAC)
Users sign in with their ALMANAC account. The API calls the SOAP operation `AuthenticateUser`
(settings in `api/appsettings.json`, section "Almanac"); passwords are never stored or logged.
If login always fails with "sign-in service is not available", check the API console: it logs the
element names of the service response. Compare with the sample request/response shown on
http://apps.bellvantage.com:8048/Service/ALMANACService.asmx?op=AuthenticateUser and adjust
`UsernameParam`, `PasswordParam`, `Namespace` (and `AlmanacAuthClient.cs` if the result shape differs).

## 4. Run the API
cd api
dotnet restore
dotnet run          # http://localhost:5080

## 5. Run the web app
cd web
npm install
npm run dev         # http://localhost:5173

## Endpoints
POST /api/v1/auth/login            sign in (sets a secure HttpOnly cookie); rate limited
GET  /api/v1/auth/me               current user (401 if not signed in)
POST /api/v1/auth/logout           sign out
(all endpoints below now require a signed-in user)
POST /api/v1/cv/extract            upload PDF/DOCX -> extracted fields (nothing stored)
POST /api/v1/candidates            save reviewed candidate (409 if the NIC already exists)
GET  /api/v1/candidates            list: ?search&status&from&to&sort&dir&page&pageSize
GET  /api/v1/candidates/{id}       one candidate
PUT  /api/v1/candidates/{id}       edit (same validation as save; 409 on duplicate NIC)
DELETE /api/v1/candidates/{id}     soft delete (hidden everywhere, kept in the database)
GET  /api/v1/candidates/recent     latest saved candidates (dashboard table)
GET  /api/v1/reports/summary       report data: monthly intake, religion, age bands, O/L grades, user activity (?from&to&status)
GET  /api/v1/reports/register      candidate register, paged (+ search, sort)
GET  /api/v1/reports/register.csv  CSV download of every matching row (UTF-8 with BOM)
GET  /api/v1/health                open after deployment: {"status":"ok","database":true}
GET  /api/v1/dashboard/summary     real counts for the dashboard cards and chart (totals, last 14 days, last 6 months)

## Notes
- The web app uses real page addresses (/candidates, /candidates/12 ...). When you host the built site (npm run build), the web server must serve index.html for unknown paths (SPA fallback).

## Hosting for the team
See `deploy/HOSTING.md` (IIS on a Windows server, one address for everyone). Build the package with `deploy\publish.ps1`.
