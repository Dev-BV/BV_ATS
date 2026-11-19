import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, CalendarDays, Download, GraduationCap, Printer, Table2, Users } from "lucide-react";
import { downloadRegisterCsv, fetchReportSummary, type ReportSummary } from "../api";
import { csvDownload } from "../csv";
import { useApp } from "../ctx";
import { fmtDate } from "../format";
import logo from "../assets/bellvantage-logo.png";
import RegisterReport from "./reports/RegisterReport";
import { Demographics, MonthlyIntake, OlResults, UserActivity, csvRows } from "./reports/Views";

const TABS = [
  ["intake", "Monthly Intake", CalendarDays],
  ["register", "Candidate Register", Table2],
  ["demographics", "Demographics", Users],
  ["ol", "O/L Results", GraduationCap],
  ["activity", "User Activity", Activity],
] as const;
type TabKey = (typeof TABS)[number][0];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DEFAULT_DIR: Record<string, string> = { name: "asc", created: "desc", status: "asc" };

function presets() {
  const now = new Date();
  const ago = new Date(now); ago.setDate(now.getDate() - 29);
  return [
    { label: "This month", from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) },
    { label: "Last 30 days", from: iso(ago), to: iso(now) },
    { label: "This year", from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) },
    { label: "All time", from: "", to: "" },
  ];
}

export default function Reports() {
  const { user } = useApp();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some(([k]) => k === sp.get("tab")) ? sp.get("tab") : "intake") as TabKey;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const status = sp.get("status") ?? "";

  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => (v === null || v === "" ? n.delete(k) : n.set(k, v)));
      return n;
    }, { replace: true });

  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const needsSummary = tab !== "register";

  useEffect(() => {
    if (!needsSummary) return;
    let alive = true;
    setLoading(true);
    fetchReportSummary({ from, to, status })
      .then((r) => { if (alive) { setData(r); setError(""); } })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not build the report."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [from, to, status, needsSummary]);

  const exportCsv = async () => {
    setExporting(true); setExportError("");
    try {
      const stamp = iso(new Date()).replace(/-/g, "");
      if (tab === "register") {
        const sort = sp.get("sort") ?? "created";
        await downloadRegisterCsv({ from, to, status, search: sp.get("q") ?? "", sort, dir: sp.get("dir") ?? DEFAULT_DIR[sort] ?? "desc" });
      } else if (data) csvDownload(`report-${tab}-${stamp}.csv`, csvRows(tab, data));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Could not export the report.");
    } finally {
      setExporting(false);
    }
  };

  const tabName = TABS.find(([k]) => k === tab)![1];
  const period = from || to ? `${from ? fmtDate(from) : "Start"} – ${to ? fmtDate(to) : "Today"}` : "All time";
  const statusName = status === "" ? "All statuses" : status === "OcrRequired" ? "OCR Required" : "Extracted";
  const generated = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " ");
  const active = presets().find((p) => p.from === from && p.to === to)?.label;

  return (
    <div className="card rpage">
      <div className="printhead">
        <img src={logo} alt="" />
        <div><h2>{tabName}</h2><p>Period: {period} &nbsp;·&nbsp; Status: {statusName}</p><p>Generated {generated} by {user.displayName}</p></div>
      </div>

      <div className="rfilters noprint">
        <div className="chips">
          {presets().map((p) => (
            <button key={p.label} className={"chip" + (active === p.label ? " on" : "")} onClick={() => update({ from: p.from || null, to: p.to || null, page: null })}>{p.label}</button>
          ))}
        </div>
        <label>From<input type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value, page: null })} /></label>
        <label>To<input type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value, page: null })} /></label>
        <label>Status
          <select value={status} onChange={(e) => update({ status: e.target.value, page: null })}>
            <option value="">All</option><option value="Extracted">Extracted</option><option value="OcrRequired">OCR Required</option>
          </select>
        </label>
        <div className="ractions">
          <button className="btn ghost small" onClick={() => window.print()}><Printer size={16} /> Print / PDF</button>
          <button className="btn small" disabled={exporting || (needsSummary && !data)} onClick={exportCsv}><Download size={16} /> {exporting ? "Exporting…" : "Export CSV"}</button>
        </div>
      </div>

      <div className="tabs noprint">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => update({ tab: k === "intake" ? null : k })}><Icon size={15} /> {label}</button>
        ))}
      </div>

      {exportError && <div className="alert err">{exportError}</div>}
      {error && needsSummary && <div className="alert err">{error}</div>}

      <div className={"rbody" + (loading ? " loading" : "")}>
        {tab === "register" && <RegisterReport sp={sp} update={update} from={from} to={to} status={status} />}
        {needsSummary && !data && !error && <p className="muted">Building report…</p>}
        {needsSummary && data && tab === "intake" && <MonthlyIntake d={data} />}
        {needsSummary && data && tab === "demographics" && <Demographics d={data} />}
        {needsSummary && data && tab === "ol" && <OlResults d={data} />}
        {needsSummary && data && tab === "activity" && <UserActivity d={data} />}
      </div>
    </div>
  );
}
