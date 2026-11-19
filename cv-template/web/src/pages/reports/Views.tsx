import type { CountItem, GradeCounts, ReportSummary } from "../../api";
import { axisStep } from "../../chart";
import { fmtDateTime } from "../../format";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (key: string) => `${MON[parseInt(key.slice(5, 7), 10) - 1]} ${key.slice(0, 4)}`;
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

export function Kpis({ items }: { items: [string, number | string][] }) {
  return (
    <div className="kpis">
      {items.map(([label, value]) => <div className="kpi" key={label}><b>{value}</b><span>{label}</span></div>)}
    </div>
  );
}

function HBars({ items, total }: { items: CountItem[]; total: number }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="hbars">
      {items.map((i) => (
        <div className="hbar" key={i.name}>
          <span className="hl">{i.name}</span>
          <span className="ht"><i style={{ width: (i.count / max) * 100 + "%" }} /></span>
          <span className="hv">{i.count} <small>({pct(i.count, total)}%)</small></span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyIntake({ d }: { d: ReportSummary }) {
  const months = d.monthly;
  const dense = months.length > 14;
  const step = axisStep(Math.max(...months.map((m) => m.applications), 0));
  const axisMax = step * 4;
  const avg = months.length ? Math.round((d.total / months.length) * 10) / 10 : 0;
  return (
    <>
      <Kpis items={[["Total applications", d.total], ["Extracted automatically", d.extracted], ["OCR required", d.ocrRequired], ["Average per month", avg]]} />
      <div className={"chart rchart" + (dense ? " dense" : "")}>
        <div className="yaxis">{[4, 3, 2, 1, 0].map((i) => <span key={i}>{i * step}</span>)}</div>
        <div className="plot">
          {[0, 25, 50, 75, 100].map((v) => <div className="grid" key={v} style={{ bottom: `calc(26px + (100% - 26px) * ${v / 100})` }} />)}
          {months.map((m) => (
            <div className="month" key={m.month}>
              <div className="bars">
                <div className="bar a" style={{ height: (m.applications / axisMax) * 100 + "%" }}>{m.applications > 0 && <span>{m.applications}</span>}</div>
                <div className="bar h" style={{ height: (m.extracted / axisMax) * 100 + "%" }}>{m.extracted > 0 && <span>{m.extracted}</span>}</div>
              </div>
              <small>{dense ? monthLabel(m.month).replace(" 20", " ’") : monthLabel(m.month).slice(0, 3)}</small>
            </div>
          ))}
          {d.total === 0 && <div className="chartempty"><span>No candidates in this period.</span></div>}
        </div>
      </div>
      <div className="legend left"><i className="a" />Applications <i className="h" />Extracted automatically</div>
      <div className="scroll">
        <table className="rtable">
          <thead><tr><th>Month</th><th className="num">Applications</th><th className="num">Extracted</th><th className="num">OCR required</th><th className="num">OCR %</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{m.applications}</td><td className="num">{m.extracted}</td>
                <td className="num">{m.ocrRequired}</td><td className="num">{m.applications ? pct(m.ocrRequired, m.applications) + "%" : "—"}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num">{months.reduce((a, m) => a + m.applications, 0)}</td><td className="num">{months.reduce((a, m) => a + m.extracted, 0)}</td>
            <td className="num">{months.reduce((a, m) => a + m.ocrRequired, 0)}</td><td className="num" /></tr></tfoot>
        </table>
      </div>
      {!months.length ? null : <p className="muted tiny">Shows {months.length} month{months.length > 1 ? "s" : ""}. Without a start date, the last 12 months (or since the first CV) are shown.</p>}
    </>
  );
}

export function Demographics({ d }: { d: ReportSummary }) {
  return (
    <>
      <Kpis items={[["Candidates in report", d.total]]} />
      <div className="two">
        <section className="subcard"><h4>By religion</h4>{d.total ? <HBars items={d.religion} total={d.total} /> : <p className="muted">No data.</p>}</section>
        <section className="subcard"><h4>By age (today)</h4>{d.total ? <HBars items={d.ageBands} total={d.total} /> : <p className="muted">No data.</p>}</section>
      </div>
    </>
  );
}

const SUBJECTS: [string, keyof ReportSummary["olResults"]][] = [["English", "english"], ["Maths", "maths"], ["Sinhala", "sinhala"], ["Tamil", "tamil"], ["Science", "science"]];
const GRADES: [string, keyof GradeCounts][] = [["A", "a"], ["B", "b"], ["C", "c"], ["S", "s"], ["F", "f"], ["W", "w"]];

export function OlResults({ d }: { d: ReportSummary }) {
  return (
    <>
      <Kpis items={[["Candidates in report", d.total]]} />
      <div className="scroll">
        <table className="rtable">
          <thead><tr><th>Subject</th>{GRADES.map(([g]) => <th className="num" key={g}>{g}</th>)}<th className="num">Not entered</th><th className="num">% with A</th></tr></thead>
          <tbody>
            {SUBJECTS.map(([label, key]) => {
              const g = d.olResults[key];
              return (
                <tr key={key}>
                  <td className="strong">{label}</td>
                  {GRADES.map(([, k]) => (
                    <td className="num heat" key={k} style={{ ["--s" as string]: d.total ? g[k] / d.total : 0 }}>{g[k]}</td>
                  ))}
                  <td className="num">{g.notEntered}</td>
                  <td className="num">{pct(g.a, d.total)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted tiny">Counts of candidates per grade. Darker cells = larger share of the candidates in this report. Tamil is optional, so most candidates show as “Not entered”.</p>
    </>
  );
}

export function UserActivity({ d }: { d: ReportSummary }) {
  return (
    <>
      <Kpis items={[["CVs added", d.total], ["HR users", d.activity.length]]} />
      {d.total ? <HBars items={d.activity.map((a) => ({ name: a.user, count: a.count }))} total={d.total} /> : <p className="muted">No data.</p>}
      <div className="scroll" style={{ marginTop: 18 }}>
        <table className="rtable">
          <thead><tr><th>User</th><th className="num">CVs added</th><th>First added</th><th>Last added</th></tr></thead>
          <tbody>
            {d.activity.map((a) => <tr key={a.user}><td className="strong">{a.user}</td><td className="num">{a.count}</td><td>{fmtDateTime(a.firstAddedUtc)}</td><td>{fmtDateTime(a.lastAddedUtc)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="muted tiny">“(not recorded)” = candidates saved before user tracking was added.</p>
    </>
  );
}

// Rows for "Export CSV" of the aggregated reports
export function csvRows(tab: string, d: ReportSummary): (string | number | null)[][] {
  if (tab === "intake")
    return [["Month", "Applications", "Extracted", "OCR required"], ...d.monthly.map((m) => [m.month, m.applications, m.extracted, m.ocrRequired])];
  if (tab === "demographics")
    return [["Group", "Value", "Candidates", "Percent"],
      ...d.religion.map((r) => ["Religion", r.name, r.count, pct(r.count, d.total)]),
      ...d.ageBands.map((r) => ["Age", r.name, r.count, pct(r.count, d.total)])];
  if (tab === "ol")
    return [["Subject", "A", "B", "C", "S", "F", "W", "Not entered", "Candidates"],
      ...SUBJECTS.map(([label, key]) => { const g = d.olResults[key]; return [label, g.a, g.b, g.c, g.s, g.f, g.w, g.notEntered, d.total]; })];
  return [["User", "CVs added", "First added", "Last added"], ...d.activity.map((a) => [a.user, a.count, a.firstAddedUtc, a.lastAddedUtc])];
}
