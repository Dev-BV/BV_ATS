# Hosting the Bellvantage ATS on a Windows server (IIS)

The whole system runs as **one website**: IIS runs the ASP.NET Core API, and the API also serves the web app.
Your team opens one address in their browser, e.g. `http://ats-server:8080` (or `https://ats.bellvantage...`).

```
Team browsers ──► IIS site "ATS" (API + web app) ──► SQL Server 10.9.8.27  (database: application)
                                                  └─► ALMANAC service apps.bellvantage.com:8048 (sign-in)
```

## What you need
- A Windows server on the company network (Windows Server 2019/2022; a Windows 10/11 Pro PC also works for a small team). 4 GB RAM is plenty.
- From that server you must be able to reach **SQL Server 10.9.8.27 port 1433** and **apps.bellvantage.com port 8048** (ask IT to open the firewall if needed).
- An address for the team: the server name + port is enough to start; ask IT for a friendly DNS name later.
- The database scripts `database\001_...sql` and `002_...sql` already run on the `application` database.
- **Keep it internal.** Do not expose this server to the internet without IT's help (HTTPS, reverse proxy, firewall).

## Step 1 – Build the package (on your development PC)
Needs the .NET SDK and Node.js (you already have both). In PowerShell, from the project folder:
```
.\deploy\publish.ps1
```
(If PowerShell blocks scripts: `Set-ExecutionPolicy -Scope Process Bypass` first.)
It builds the web app, puts it inside the API, and creates a folder called `publish`. That folder is everything the server needs.

## Step 2 – Prepare the server (once)
1. **Install IIS.** Windows Server: `Install-WindowsFeature Web-Server, Web-Mgmt-Console` (PowerShell as Administrator).
   Windows 10/11: Control Panel > Programs > Turn Windows features on or off > Internet Information Services.
2. **Install the .NET 9 Hosting Bundle** (download "ASP.NET Core Runtime 9.x – Hosting Bundle" from dotnet.microsoft.com), then run `iisreset`.
   Without it you get HTTP Error 500.19 / 502.5.

## Step 3 – Copy the files
Copy the **contents** of the `publish` folder to `C:\inetpub\ATS` on the server.

## Step 4 – Add the database connection (on the server)
Copy `deploy\appsettings.Production.json.example` to `C:\inetpub\ATS\appsettings.Production.json` and fill in the real values.
This file is NOT part of the build, so updates never overwrite it. **Never put the password in source control.**

Strongly recommended: ask the DBA for a dedicated account for this app (for example `ats_app`) that can only read/write the
tables of this system, instead of the developer account `belldevusr`. Also change any password that was ever shared in chat or e-mail.

## Step 5 – Create the IIS site (PowerShell as Administrator, on the server)
```
Import-Module WebAdministration

# application pool with no managed runtime (ASP.NET Core)
New-WebAppPool -Name ATS
Set-ItemProperty IIS:\AppPools\ATS -Name managedRuntimeVersion -Value ""

# the site, on port 8080
New-Website -Name ATS -PhysicalPath C:\inetpub\ATS -ApplicationPool ATS -Port 8080

# let the site read its files
icacls C:\inetpub\ATS /grant "IIS AppPool\ATS:(OI)(CI)RX"

# only administrators and this site may read the secrets file
icacls C:\inetpub\ATS\appsettings.Production.json /inheritance:r /grant "Administrators:F" "IIS AppPool\ATS:R"

# allow the team's PCs to connect (company network only)
New-NetFirewallRule -DisplayName "ATS 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Domain
```
(If you want the plain address `http://ats-server` use `-Port 80` and stop/remove the "Default Web Site" first.)

## Step 6 – Check it works
On the server:
```
Test-NetConnection 10.9.8.27 -Port 1433
Test-NetConnection apps.bellvantage.com -Port 8048
```
Both must say `TcpTestSucceeded : True`. Then open `http://localhost:8080/api/v1/health` – you should see
`{"status":"ok","database":true}`. Finally, from another PC open `http://<server-name>:8080` and sign in.

## Step 7 – HTTPS (recommended before the whole team uses it)
Sign-in passwords travel from each browser to this server, so use HTTPS:
1. Ask IT for a certificate for the server name (from the company certificate authority).
2. IIS Manager > Sites > ATS > Bindings > Add > https, port 443, choose the certificate. Open port 443 in the firewall.
3. In `appsettings.Production.json` set `"Auth": { "SecureCookies": true }`, then recycle the app pool.

## Updating to a new version
On your PC run `.\deploy\publish.ps1`, copy the `publish` folder to the server, then on the server:
```
Stop-WebAppPool ATS
robocopy <path-to>\publish C:\inetpub\ATS /E /XF appsettings.Production.json
Start-WebAppPool ATS
```
If a new version adds a database script (`database\00x_...sql`), run it on the database first.

## Before go-live checklist
- [ ] Dedicated least-privilege database account in use (not `belldevusr`); old/shared passwords changed.
- [ ] HTTPS on, and `Auth:SecureCookies` = true.
- [ ] Server reachable only from the company network (VPN for remote staff).
- [ ] The ALMANAC address is plain `http://` – ask the ALMANAC owners for an HTTPS address if possible, then update `Almanac:Url`.
- [ ] Database backups are covered by the DBA (the system keeps no other data; CV files are not stored).
- [ ] You tried: sign in, upload a CV, save, edit, delete, a report and a print on a second PC.

## Troubleshooting
| Problem | Likely cause / fix |
|---|---|
| HTTP Error 500.19 or 502.5 | Hosting Bundle not installed (or wrong version) – install the .NET 9 Hosting Bundle, `iisreset`. |
| HTTP Error 500.30 / site will not start | Usually the connection string is missing. Check `appsettings.Production.json`. To see the real error: edit `C:\inetpub\ATS\web.config`, set `stdoutLogEnabled="true"`, create folder `C:\inetpub\ATS\logs`, give `IIS AppPool\ATS` Modify permission on it, restart the pool, read the log, then turn logging off again. |
| `/api/v1/health` shows `"database":false` | SQL Server not reachable from the server (firewall/name), wrong login, or wrong database name. |
| Sign-in says "sign-in service is not available" | The server cannot reach `apps.bellvantage.com:8048`, or the ALMANAC reply changed. The API log shows the reason. |
| White page / missing images after deploying | `wwwroot` was not included – always use `publish.ps1`, not a plain `dotnet publish`. |
| Browser shows an old version | Press Ctrl+F5 once; the app itself is never cached by the browser. |
| "Too many sign-in attempts" | Built-in protection: 8 attempts per minute per computer. Wait a minute. |

## Other ways to host (if IIS is not an option)
- **Windows Service / plain Kestrel:** run the published app with `dotnet CvTemplate.Api.dll` as a service (NSSM or `UseWindowsService`) behind your own reverse proxy.
- **Docker:** possible, but your team would need to maintain images/hosts; IIS is simpler in a Windows shop.
- **Cloud (Azure etc.):** the database and ALMANAC are internal, so the cloud app would need a VPN/private link to them.
