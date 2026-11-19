import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Sidebar, Topbar } from "./components";
import { AppContext, type AppCtx } from "./ctx";
import Dashboard, { type UploadRow } from "./pages/Dashboard";
import UploadCv from "./pages/UploadCv";
import CandidateReview from "./pages/CandidateReview";
import Candidates from "./pages/Candidates";
import CandidateDetails from "./pages/CandidateDetails";
import CandidateEdit from "./pages/CandidateEdit";
import Reports from "./pages/Reports";
import Login from "./pages/Login";
import { fmtDateTime } from "./format";
import {
  currentUser, fetchRecent, fetchSummary, logout, setUnauthorizedHandler,
  type AuthUser, type DashboardSummary, type RecentCandidate,
} from "./api";

type Head = { title: string; subtitle: string; crumbs?: string[] };

function headFor(path: string): Head {
  if (path.startsWith("/upload")) return { title: "Upload CV", subtitle: "Upload a candidate's CV to extract details automatically", crumbs: ["Dashboard", "Upload CV"] };
  if (path.startsWith("/review")) return { title: "Candidate Review", subtitle: "Please review and confirm the extracted information", crumbs: ["Dashboard", "Candidates", "Review"] };
  if (/^\/candidates\/\d+\/edit/.test(path)) return { title: "Edit Candidate", subtitle: "Update the candidate's saved details", crumbs: ["Dashboard", "Candidates", "Edit"] };
  if (/^\/candidates\/\d+/.test(path)) return { title: "Candidate Profile", subtitle: "Everything saved about this candidate", crumbs: ["Dashboard", "Candidates", "Profile"] };
  if (path.startsWith("/reports")) return { title: "Reports", subtitle: "Analyse recruitment activity, then print or export the results", crumbs: ["Dashboard", "Reports"] };
  if (path.startsWith("/candidates")) return { title: "Candidates", subtitle: "Search, review and manage every candidate", crumbs: ["Dashboard", "Candidates"] };
  return { title: "Applicant Tracking System", subtitle: "Manage and track your recruitment process efficiently" };
}

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = still checking the session
  const [notice, setNotice] = useState("");
  const [extraction, setExtraction] = useState<AppCtx["extraction"]>(null);
  const [recent, setRecent] = useState<RecentCandidate[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);

  // Session check on load + automatic sign-out when the API says the session expired
  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); setNotice("Your session has expired. Please sign in again."); });
    currentUser().then(setUser);
    return () => setUnauthorizedHandler(null);
  }, []);

  const refresh = useCallback(async () => {
    const [r, sm] = await Promise.allSettled([fetchRecent(), fetchSummary()]);
    if (r.status === "fulfilled") setRecent(r.value);
    if (sm.status === "fulfilled") setSummary(sm.value);
    setLoadError(r.status === "rejected" || sm.status === "rejected");
  }, []);
  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4000);
  }, []);

  const signOut = async () => {
    await logout();
    setUser(null); setNotice(""); setExtraction(null); setRecent([]); setSummary(null);
    navigate("/");
  };

  if (user === undefined) return null;
  if (user === null) return <Login notice={notice} onSignedIn={(u) => { setNotice(""); setUser(u); }} />;

  const uploads: UploadRow[] = recent.map((r) => ({
    id: r.candidateId, when: fmtDateTime(r.createdAtUtc), name: r.fullName, file: r.sourceFileName ?? "—",
    status: r.parseStatus === "OcrRequired" ? "OCR Required" : "Extracted",
  }));

  return (
    <AppContext.Provider value={{ user, notify, refresh, extraction, setExtraction }}>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Topbar {...headFor(pathname)} user={user} onLogout={signOut} />
          {toast && <div className="toast">{toast}</div>}
          <Routes>
            <Route path="/" element={<Dashboard uploads={uploads} summary={summary} loadError={loadError} onUpload={() => navigate("/upload")} />} />
            <Route path="/upload" element={<UploadCv onExtracted={(data, file) => { setExtraction({ data, file }); navigate("/review"); }} />} />
            <Route path="/review" element={<CandidateReview />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/candidates/:id" element={<CandidateDetails />} />
            <Route path="/candidates/:id/edit" element={<CandidateEdit />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </AppContext.Provider>
  );
}
