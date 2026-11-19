import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import CandidateForm from "./CandidateForm";
import { getCandidate, updateCandidate, type CandidateDetail } from "../api";
import { fmtDateTime } from "../format";
import { useApp } from "../ctx";

export default function CandidateEdit() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { notify, refresh } = useApp();
  const [c, setC] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setC(null); setError("");
    getCandidate(id).then(setC).catch((e) => setError(e instanceof Error ? e.message : "Could not load the candidate."));
  }, [id]);

  if (error) return <div className="card"><div className="alert err">{error}</div><p><Link className="viewall" to="/candidates">← Back to candidates</Link></p></div>;
  if (!c) return <div className="card"><p className="muted">Loading…</p></div>;

  return (
    <CandidateForm
      initial={c}
      dobFromNic={c.dobSource === "NIC"}
      infoTitle="Record Info"
      info={[["Candidate ID", String(c.candidateId)], ["Added", fmtDateTime(c.createdAtUtc)], ["Added by", c.createdBy ?? "—"], ["Source", c.sourceFileName ?? "—"]]}
      secondary={{ label: "Cancel", icon: "cancel", onClick: () => navigate(`/candidates/${c.candidateId}`) }}
      primaryLabel="Save Changes"
      onSubmit={async (v) => {
        await updateCandidate(c.candidateId, { ...v, dobSource: c.dobSource, sourceFileName: c.sourceFileName, requiresOcr: c.parseStatus === "OcrRequired" });
        notify("Changes saved.");
        refresh();
        navigate(`/candidates/${c.candidateId}`);
      }}
    />
  );
}
