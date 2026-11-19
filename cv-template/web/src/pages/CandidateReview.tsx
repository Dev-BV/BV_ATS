import { Navigate, useNavigate } from "react-router-dom";
import CandidateForm from "./CandidateForm";
import { saveCandidate } from "../api";
import { useApp } from "../ctx";

/** Step after uploading a CV: review/correct the extracted values, then save as a new candidate. */
export default function CandidateReview() {
  const { extraction, setExtraction, notify, refresh } = useApp();
  const navigate = useNavigate();
  if (!extraction) return <Navigate to="/upload" replace />;   // e.g. page refreshed: the extracted data is not kept
  const d = extraction.data;

  return (
    <CandidateForm
      initial={d}
      dobFromNic={d.dobSource === "NIC"}
      ocrWarning={d.requiresOcr}
      infoTitle="Extraction Info"
      info={[["Source", d.requiresOcr ? "Scan" : "CV"], ["DOB Source", d.dobSource ?? "—"], ["Requires OCR", d.requiresOcr ? "Yes" : "No"]]}
      badge={d.requiresOcr ? undefined : "Extraction Complete"}
      secondary={{ label: "Reset", icon: "reset", onClick: () => navigate("/upload") }}
      primaryLabel="Save Candidate"
      onSubmit={async (v) => {
        const { candidateId } = await saveCandidate({ ...v, dobSource: d.dobSource, sourceFileName: extraction.file, requiresOcr: d.requiresOcr });
        notify(`Candidate saved successfully (ID ${candidateId}).`);
        setExtraction(null);
        await refresh();
        navigate("/");
      }}
    />
  );
}
