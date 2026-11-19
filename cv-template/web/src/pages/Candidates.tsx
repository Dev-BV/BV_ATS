import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, Eye, Pencil, Search, Trash2, TriangleAlert, UploadCloud, X } from "lucide-react";
import { deleteCandidate, listCandidates, type CandidateListItem, type CandidateListResponse } from "../api";
import { ConfirmDialog } from "../components";
import { fmtDateTime } from "../format";
import { useApp } from "../ctx";

const DEFAULT_DIR: Record<string, string> = { name: "asc", created: "desc", status: "asc" };

export default function Candidates() {
  const navigate = useNavigate();
  const { notify, refresh } = useApp();
  // Filters live in the URL, so refresh / Back / bookmarks keep the same view
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const sort = sp.get("sort") ?? "created";
  const dir = sp.get("dir") ?? DEFAULT_DIR[sort] ?? "desc";
  const page = Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1);
  const size = [10, 20, 50].includes(parseInt(sp.get("size") ?? "", 10)) ? parseInt(sp.get("size")!, 10) : 10;

  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => (v === null || v === "" ? n.delete(k) : n.set(k, v)));
      return n;
    }, { replace: true });

  // Typing is applied to the URL after a short pause, so we don't query on every key press
  const [search, setSearch] = useState(q);
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    const t = setTimeout(() => { if (search.trim() !== q) update({ q: search.trim() || null, page: null }); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const [data, setData] = useState<CandidateListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [toDelete, setToDelete] = useState<CandidateListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listCandidates({ search: q, status, from, to, sort, dir, page, pageSize: size })
      .then((r) => {
        if (!alive) return;
        setData(r); setError("");
        if (r.items.length === 0 && page > 1) update({ page: String(page - 1) });   // e.g. deleted the last row of the last page
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load candidates."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [q, status, from, to, sort, dir, page, size, reload]);

  const toggleSort = (key: string) =>
    key === sort ? update({ dir: dir === "asc" ? "desc" : "asc", page: null }) : update({ sort: key, dir: DEFAULT_DIR[key], page: null });
  const sortIcon = (key: string) => key !== sort ? <ArrowUpDown size={14} className="sico" /> : dir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  const filtered = !!(q || status || from || to);
  const clear = () => { setSearch(""); setSp({}, { replace: true }); };

  const total = data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / size), 1);
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(page * size, total);
  const winStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => winStart + i);

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true); setDelError("");
    try {
      await deleteCandidate(toDelete.candidateId);
      notify("Candidate deleted.");
      setToDelete(null); setBusy(false);
      setReload((n) => n + 1);
      refresh();
    } catch (e) {
      setDelError(e instanceof Error ? e.message : "Could not delete the candidate.");
      setBusy(false);
    }
  };

  const th = (key: string, label: string) => (
    <th className="sortable" onClick={() => toggleSort(key)} aria-sort={key === sort ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <span>{label} {sortIcon(key)}</span>
    </th>
  );

  return (
    <div className="card">
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, NIC, mobile or location" aria-label="Search candidates" />
        </div>
        <label>Status
          <select value={status} onChange={(e) => update({ status: e.target.value, page: null })}>
            <option value="">All</option><option value="Extracted">Extracted</option><option value="OcrRequired">OCR Required</option>
          </select>
        </label>
        <label>Added from<input type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value, page: null })} /></label>
        <label>Added to<input type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value, page: null })} /></label>
        {filtered && <button className="btn ghost small" onClick={clear}><X size={14} /> Clear</button>}
        <button className="btn small push" onClick={() => navigate("/upload")}><UploadCloud size={16} /> Upload CV</button>
      </div>

      {error && <div className="alert err"><TriangleAlert size={18} /> {error}</div>}

      <div className="scroll">
        <table className={"ctable" + (loading ? " loading" : "")}>
          <thead>
            <tr>
              {th("name", "Candidate Name")}<th>NIC</th><th>Mobile</th><th>Location</th>{th("created", "Date Added")}{th("status", "Status")}<th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.candidateId} className="rowlink" onClick={() => navigate(`/candidates/${c.candidateId}`)}>
                <td className="strong">{c.fullName}</td>
                <td>{c.nic ?? "—"}</td>
                <td>{c.phone ?? "—"}</td>
                <td className="loc" title={c.location ?? ""}>{c.location ?? "—"}</td>
                <td>{fmtDateTime(c.createdAtUtc)}</td>
                <td>
                  <span className={"pill " + (c.parseStatus === "OcrRequired" ? "warn" : "ok")}>
                    {c.parseStatus === "OcrRequired" ? <TriangleAlert size={15} /> : <CircleCheck size={15} />} {c.parseStatus === "OcrRequired" ? "OCR Required" : "Extracted"}
                  </span>
                </td>
                <td className="right" onClick={(e) => e.stopPropagation()}>
                  <span className="act">
                    <button className="iconbtn" title="View" aria-label={`View ${c.fullName}`} onClick={() => navigate(`/candidates/${c.candidateId}`)}><Eye size={17} /></button>
                    <button className="iconbtn" title="Edit" aria-label={`Edit ${c.fullName}`} onClick={() => navigate(`/candidates/${c.candidateId}/edit`)}><Pencil size={17} /></button>
                    <button className="iconbtn danger" title="Delete" aria-label={`Delete ${c.fullName}`} onClick={() => { setDelError(""); setToDelete(c); }}><Trash2 size={17} /></button>
                  </span>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={7} className="empty">{filtered ? "No candidates match your search." : "No candidates yet. Upload a CV to add the first one."}</td></tr>
            )}
            {!data && loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <span>{total === 0 ? "No candidates" : `Showing ${first}–${last} of ${total}`}</span>
        <div className="pg">
          <label className="psize">Rows
            <select value={size} onChange={(e) => update({ size: e.target.value, page: null })}>{[10, 20, 50].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
          <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>‹</button>
          {pages.map((n) => <button key={n} className={n === page ? "on" : ""} onClick={() => update({ page: String(n) })}>{n}</button>)}
          <button disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>›</button>
        </div>
      </div>

      {toDelete && (
        <ConfirmDialog
          title="Delete this candidate?" confirmLabel="Delete" busy={busy} error={delError}
          message={`${toDelete.fullName} will be removed from all lists and searches. The record is kept in the database (marked as deleted) and can be restored by an administrator.`}
          onConfirm={remove} onCancel={() => setToDelete(null)} />
      )}
    </div>
  );
}
