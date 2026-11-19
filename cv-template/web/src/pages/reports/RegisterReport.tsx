import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, Search, TriangleAlert } from "lucide-react";
import { fetchRegister, type RegisterResponse } from "../../api";
import { fmtDate, fmtDateTime } from "../../format";

const DEFAULT_DIR: Record<string, string> = { name: "asc", created: "desc", status: "asc" };
const g = (v: string | null) => v ?? "–";

export default function RegisterReport({ sp, update, from, to, status }:
  { sp: URLSearchParams; update: (p: Record<string, string | null>) => void; from: string; to: string; status: string }) {
  const q = sp.get("q") ?? "";
  const sort = sp.get("sort") ?? "created";
  const dir = sp.get("dir") ?? DEFAULT_DIR[sort] ?? "desc";
  const page = Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1);
  const size = [25, 50, 100].includes(parseInt(sp.get("size") ?? "", 10)) ? parseInt(sp.get("size")!, 10) : 25;

  const [search, setSearch] = useState(q);
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    const t = setTimeout(() => { if (search.trim() !== q) update({ q: search.trim() || null, page: null }); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const [data, setData] = useState<RegisterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchRegister({ from, to, status, search: q, sort, dir, page, pageSize: size })
      .then((r) => { if (alive) { setData(r); setError(""); } })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not build the report."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [from, to, status, q, sort, dir, page, size]);

  const toggle = (key: string) => key === sort ? update({ dir: dir === "asc" ? "desc" : "asc", page: null }) : update({ sort: key, dir: DEFAULT_DIR[key], page: null });
  const icon = (key: string) => key !== sort ? <ArrowUpDown size={13} className="sico" /> : dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  const th = (key: string, label: string) => <th className="sortable" onClick={() => toggle(key)}><span>{label} {icon(key)}</span></th>;

  const total = data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / size), 1);
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(page * size, total);

  return (
    <>
      <div className="kpis"><div className="kpi"><b>{data ? total : "–"}</b><span>Candidates in report</span></div>
        <div className="search rsearch noprint"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search within this report" aria-label="Search the register" /></div></div>
      {error && <div className="alert err"><TriangleAlert size={18} /> {error}</div>}
      <div className="scroll">
        <table className={"rtable wide" + (loading ? " loading" : "")}>
          <thead>
            <tr>
              <th>ID</th>{th("name", "Name")}<th>NIC</th><th>Date of birth</th><th>Mobile</th><th>Location</th><th>Religion</th>
              <th title="English · Maths · Sinhala · Tamil · Science">O/L (En·Ma·Si·Ta·Sc)</th><th>A/L results</th>{th("status", "Status")}{th("created", "Date added")}<th>Added by</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.candidateId}>
                <td>{r.candidateId}</td>
                <td className="strong">{r.fullName}</td>
                <td>{r.nic ?? "—"}</td>
                <td>{r.dateOfBirth ? `${fmtDate(r.dateOfBirth)} (${r.age})` : "—"}</td>
                <td>{r.phone ?? "—"}</td>
                <td className="loc" title={r.location ?? ""}>{r.location ?? "—"}</td>
                <td>{r.religion ?? "—"}</td>
                <td className="ol">{[r.olEnglish, r.olMaths, r.olSinhala, r.olTamil, r.olScience].map(g).join(" · ")}</td>
                <td className="loc" title={r.alResults ?? ""}>{r.alResults ?? "—"}</td>
                <td><span className={"pill " + (r.parseStatus === "OcrRequired" ? "warn" : "ok")}>
                  {r.parseStatus === "OcrRequired" ? <TriangleAlert size={14} /> : <CircleCheck size={14} />} {r.parseStatus === "OcrRequired" ? "OCR Required" : "Extracted"}</span></td>
                <td>{fmtDateTime(r.createdAtUtc)}</td>
                <td>{r.createdBy ?? "—"}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={12} className="empty">No candidates match these filters.</td></tr>}
            {!data && loading && <tr><td colSpan={12} className="empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager noprint">
        <span>{total === 0 ? "No candidates" : `Showing ${first}–${last} of ${total}`}. “Export CSV” includes every matching row.</span>
        <div className="pg">
          <label className="psize">Rows
            <select value={size} onChange={(e) => update({ size: e.target.value, page: null })}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
          <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>‹</button>
          <button className="on">{page}</button>
          <button disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>›</button>
        </div>
      </div>
    </>
  );
}
