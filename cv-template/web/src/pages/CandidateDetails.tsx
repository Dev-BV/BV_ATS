import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CircleCheck, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { deleteCandidate, getCandidate, type CandidateDetail } from "../api";
import { ConfirmDialog } from "../components";
import { ageFrom, fmtDate, fmtDateTime, initialsOf } from "../format";
import { useApp } from "../ctx";

const Row = ({ k, v }: { k: string; v?: string | null }) => <><dt>{k}</dt><dd>{v || "—"}</dd></>;

export default function CandidateDetails() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { notify, refresh } = useApp();
  const [c, setC] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState("");

  useEffect(() => {
    setC(null); setError("");
    getCandidate(id).then(setC).catch((e) => setError(e instanceof Error ? e.message : "Could not load the candidate."));
  }, [id]);

  if (error) return <div className="card"><div className="alert err">{error}</div><p><Link className="viewall" to="/candidates">← Back to candidates</Link></p></div>;
  if (!c) return <div className="card"><p className="muted">Loading…</p></div>;

  const ocr = c.parseStatus === "OcrRequired";
  const remove = async () => {
    setBusy(true); setDelError("");
    try {
      await deleteCandidate(c.candidateId);
      notify("Candidate deleted.");
      refresh();
      navigate("/candidates");
    } catch (e) {
      setDelError(e instanceof Error ? e.message : "Could not delete the candidate.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card phead">
        <span className="bigav">{initialsOf(c.fullName)}</span>
        <div className="pinfo">
          <h2>{c.fullName}</h2>
          <p>
            {c.nic ?? "No NIC"} &nbsp;·&nbsp; {c.phone ?? "No mobile"} &nbsp;
            <span className={"pill " + (ocr ? "warn" : "ok")}>{ocr ? <TriangleAlert size={15} /> : <CircleCheck size={15} />} {ocr ? "OCR Required" : "Extracted"}</span>
          </p>
        </div>
        <div className="pactions">
          <button className="btn ghost" onClick={() => navigate("/candidates")}><ArrowLeft size={16} /> Back</button>
          <button className="btn" onClick={() => navigate(`/candidates/${c.candidateId}/edit`)}><Pencil size={16} /> Edit</button>
          <button className="btn danger" onClick={() => setConfirm(true)}><Trash2 size={16} /> Delete</button>
        </div>
      </div>

      <div className="pgrid">
        <section className="card">
          <h3>Personal Details</h3>
          <dl className="dl">
            <Row k="Full name" v={c.fullName} />
            <Row k="NIC" v={c.nic} />
            <Row k="Date of birth" v={c.dateOfBirth ? `${fmtDate(c.dateOfBirth)} (age ${ageFrom(c.dateOfBirth)})` : null} />
            <Row k="Mobile" v={c.phone} />
            <Row k="Location" v={c.location} />
            <Row k="Religion" v={c.religion} />
          </dl>
        </section>

        <section className="card">
          <h3>GCE Ordinary Level</h3>
          <div className="gtiles">
            {([["English", c.olEnglish], ["Maths", c.olMaths], ["Sinhala", c.olSinhala], ["Tamil", c.olTamil], ["Science", c.olScience]] as const).map(([label, g]) => (
              <div className="gt" key={label}><b>{g ?? "–"}</b><small>{label}</small></div>
            ))}
          </div>
          {c.olSummary && <p className="muted tiny">Summary on the CV: {c.olSummary}</p>}
          <h3 className="sub">GCE Advanced Level</h3>
          <p className="plain">{c.alResults || "—"}</p>
        </section>

        <section className="card">
          <h3>Notes</h3>
          <p className="plain">{c.notes || "No notes."}</p>
        </section>

        <section className="card">
          <h3>Record</h3>
          <dl className="dl">
            <Row k="Candidate ID" v={String(c.candidateId)} />
            <Row k="Source file" v={c.sourceFileName} />
            <Row k="Added" v={`${fmtDateTime(c.createdAtUtc)}${c.createdBy ? " by " + c.createdBy : ""}`} />
            <Row k="Last updated" v={c.updatedAtUtc ? `${fmtDateTime(c.updatedAtUtc)}${c.updatedBy ? " by " + c.updatedBy : ""}` : null} />
          </dl>
        </section>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Delete this candidate?" confirmLabel="Delete" busy={busy} error={delError}
          message={`${c.fullName} will be removed from all lists and searches. The record is kept in the database (marked as deleted) and can be restored by an administrator.`}
          onConfirm={remove} onCancel={() => setConfirm(false)} />
      )}
    </>
  );
}
