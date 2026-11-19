import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Briefcase, CalendarDays, CircleCheck, Search, TriangleAlert, UploadCloud, Zap } from "lucide-react";
import type { DashboardSummary, MonthPoint } from "../api";
import { axisStep } from "../chart";

export interface UploadRow { id: number; when: string; name: string; file: string; status: "Extracted" | "OCR Required" }

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string) => MON[parseInt(key.slice(5, 7), 10) - 1] ?? key;


// % change vs last month (null = nothing to compare yet)
function trend(cur: number, prev: number): { text: string; dir: "up" | "down" | "flat" } | null {
  if (cur === 0 && prev === 0) return null;
  if (prev === 0) return { text: "New", dir: "up" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { text: `${Math.abs(pct)}%`, dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const step = 96 / Math.max(values.length - 1, 1);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${(2 + i * step).toFixed(1)} ${(28 - (v / max) * 22).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Dashboard({ uploads, summary, loadError, onUpload }:
  { uploads: UploadRow[]; summary: DashboardSummary | null; loadError: boolean; onUpload: () => void }) {
  const navigate = useNavigate();
  const monthly: MonthPoint[] = summary?.monthly ?? [];
  const cur = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];
  const daily = summary?.daily ?? [];

  // Every number below comes from the database (candidates saved through this system)
  const cards = [
    { Icon: Briefcase, label: "Total Applications", value: summary?.total, pick: (p: { applications: number }) => p.applications, bg: "#dfe9ff", fg: "#2f5fd9", line: "#4c7df0", goodWhenUp: true, hint: "New applications this month vs last month" },
    { Icon: CalendarDays, label: "Added This Month", value: cur?.applications, pick: (p: { applications: number }) => p.applications, bg: "#e9e0fb", fg: "#7c4ddb", line: "#7c4ddb", goodWhenUp: true, hint: "This month vs last month" },
    { Icon: CircleCheck, label: "Extracted Automatically", value: summary?.extracted, pick: (p: { extracted: number }) => p.extracted, bg: "#d9f5e3", fg: "#16a34a", line: "#22a559", goodWhenUp: true, hint: "This month vs last month" },
    { Icon: TriangleAlert, label: "OCR Required", value: summary?.ocrRequired, pick: (p: { ocrRequired: number }) => p.ocrRequired, bg: "#ffe8d2", fg: "#ea7a1a", line: "#f08a24", goodWhenUp: false, hint: "This month vs last month" },
  ];

  const maxVal = Math.max(...monthly.map((m) => m.applications), 0);
  const step = axisStep(maxVal);
  const axisMax = step * 4;
  const ticks = [4, 3, 2, 1, 0].map((i) => i * step);
  const empty = !summary || summary.total === 0;

  return (
    <>
      <section className="stats">
        {cards.map(({ Icon, label, value, pick, bg, fg, line, goodWhenUp, hint }) => {
          const t = cur && prev ? trend(pick(cur as never), pick(prev as never)) : null;
          const good = t ? (t.dir === "flat" ? true : (t.dir === "up") === goodWhenUp) : true;
          return (
            <div className="card stat" key={label}>
              <span className="ico" style={{ background: bg, color: fg }}><Icon size={28} /></span>
              <div className="num"><b>{value ?? "–"}</b><span>{label}</span></div>
              {t && <em className={"trend" + (good ? "" : " neg")} title={hint}>{t.dir === "down" ? "↓" : t.dir === "up" ? "↑" : "→"} {t.text}</em>}
              {summary && <Spark values={daily.map((d) => pick(d as never))} color={line} />}
            </div>
          );
        })}
      </section>

      <div className="dash">
        <div className="stack">
          <section className="card">
            <h3><Zap size={20} fill="#1f56d8" color="#1f56d8" /> Quick Actions</h3>
            <div className="tiles">
              <button className="tile primary" onClick={onUpload}><UploadCloud size={38} />Upload CV<br />(PDF / DOCX)</button>
              <button className="tile" onClick={() => navigate("/candidates")}><Search size={36} color="#1f56d8" />View Candidates</button>
              <button className="tile" disabled><CalendarDays size={36} color="#1f56d8" />Schedule Interview</button>
              <button className="tile" onClick={() => navigate("/reports")}><BarChart3 size={36} color="#1f56d8" />View Reports</button>
            </div>
          </section>

          <section className="card">
            <div className="cardhead"><h3>Recent CV Uploads</h3><Link className="viewall" to="/candidates">View All <ArrowRight size={16} /></Link></div>
            <div className="scroll">
              <table>
                <thead><tr><th>Date &amp; Time</th><th>Candidate Name</th><th>File Name</th><th>Status</th></tr></thead>
                <tbody>
                  {uploads.map((u, i) => (
                    <tr key={i}>
                      <td>{u.when}</td><td><Link className="rowname" to={`/candidates/${u.id}`}>{u.name}</Link></td><td>{u.file}</td>
                      <td>
                        <span className={"pill " + (u.status === "Extracted" ? "ok" : "warn")}>
                          {u.status === "Extracted" ? <CircleCheck size={15} /> : <TriangleAlert size={15} />} {u.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {uploads.length === 0 && <tr><td colSpan={4} className="empty">No CVs uploaded yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {loadError && <p className="note">Could not load the latest data – check that the API and database connection are running.</p>}
          </section>
        </div>

        <div className="stack">
          <section className="card chartcard">
            <div className="cardhead">
              <h3>Recruitment Overview</h3>
              <div className="legend"><i className="a" />Applications <i className="h" />Extracted automatically</div>
            </div>
            <div className="chart">
              <div className="yaxis">{ticks.map((v) => <span key={v}>{v}</span>)}</div>
              <div className="plot">
                {[0, 25, 50, 75, 100].map((v) => <div className="grid" key={v} style={{ bottom: `calc(26px + (100% - 26px) * ${v / 100})` }} />)}
                {monthly.map((m) => (
                  <div className="month" key={m.month}>
                    <div className="bars">
                      <div className="bar a" style={{ height: (m.applications / axisMax) * 100 + "%" }}>{m.applications > 0 && <span>{m.applications}</span>}</div>
                      <div className="bar h" style={{ height: (m.extracted / axisMax) * 100 + "%" }}>{m.extracted > 0 && <span>{m.extracted}</span>}</div>
                    </div>
                    <small>{monthLabel(m.month)}</small>
                  </div>
                ))}
                {empty && summary && <div className="chartempty"><span>No data yet – saved candidates will appear here.</span></div>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
