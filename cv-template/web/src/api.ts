export interface CvExtractResponse {
  fullName: string | null; nic: string | null; dateOfBirth: string | null; dobSource: "CV" | "NIC" | null;
  phone: string | null; location: string | null; religion: string | null;
  olEnglish: string | null; olMaths: string | null; olSinhala: string | null; olTamil: string | null; olScience: string | null;
  olSummary: string | null; alResults: string | null; requiresOcr: boolean; message: string;
}

export interface SaveCandidateRequest {
  fullName: string; nic: string | null; dateOfBirth: string | null; dobSource: string | null; phone: string | null;
  location: string | null; religion: string | null;
  olEnglish: string | null; olMaths: string | null; olSinhala: string | null; olTamil: string | null; olScience: string | null;
  olSummary: string | null; alResults: string | null; notes: string | null; sourceFileName: string | null; requiresOcr: boolean;
}

export interface RecentCandidate {
  candidateId: number; fullName: string; sourceFileName: string | null; createdAtUtc: string; parseStatus: string;
}

export interface AuthUser { username: string; displayName: string }

export class ApiError extends Error {
  errors?: Record<string, string>;
  constructor(message: string, errors?: Record<string, string>) { super(message); this.errors = errors; }
}

// Called when any API answers 401 (session expired) so the app can show the sign-in screen
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  if (res.status === 401 && !url.includes("/auth/")) onUnauthorized?.();
  return res;
}

export async function extractCv(file: File): Promise<CvExtractResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch("/api/v1/cv/extract", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Upload failed.");
  return data as CvExtractResponse;
}

export async function saveCandidate(r: SaveCandidateRequest): Promise<{ candidateId: number }> {
  const res = await apiFetch("/api/v1/candidates", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message ?? "Could not save the candidate.", data.errors);
  return data;
}

export async function fetchRecent(): Promise<RecentCandidate[]> {
  const res = await apiFetch("/api/v1/candidates/recent?count=10");
  if (!res.ok) throw new Error("Could not load candidates.");
  return res.json();
}

/* ---------- authentication ---------- */

export async function login(username: string, password: string, rememberMe: boolean): Promise<AuthUser> {
  let res: Response;
  try {
    res = await apiFetch("/api/v1/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, rememberMe }),
    });
  } catch {
    throw new Error("Cannot reach the server. Please check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error("Too many sign-in attempts. Please wait a minute and try again.");
  if (!res.ok) throw new Error(data.message ?? "Sign-in failed. Please try again.");
  return data as AuthUser;
}

export async function currentUser(): Promise<AuthUser | null> {
  try {
    const res = await apiFetch("/api/v1/auth/me");
    return res.ok ? ((await res.json()) as AuthUser) : null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
}

export interface DayPoint { date: string; applications: number; extracted: number; ocrRequired: number }
export interface MonthPoint { month: string; applications: number; extracted: number; ocrRequired: number }
export interface DashboardSummary { total: number; extracted: number; ocrRequired: number; daily: DayPoint[]; monthly: MonthPoint[] }

export async function fetchSummary(): Promise<DashboardSummary> {
  const res = await apiFetch("/api/v1/dashboard/summary");
  if (!res.ok) throw new Error("Could not load the dashboard.");
  return res.json();
}

/* ---------- candidates module ---------- */

export interface CandidateListItem {
  candidateId: number; fullName: string; nic: string | null; phone: string | null; location: string | null;
  sourceFileName: string | null; createdAtUtc: string; parseStatus: string;
}
export interface CandidateListResponse { items: CandidateListItem[]; total: number; page: number; pageSize: number }

export interface CandidateDetail {
  candidateId: number; fullName: string; nic: string | null; dateOfBirth: string | null; dobSource: string | null;
  phone: string | null; location: string | null; religion: string | null;
  olEnglish: string | null; olMaths: string | null; olSinhala: string | null; olTamil: string | null; olScience: string | null;
  olSummary: string | null; alResults: string | null; notes: string | null; sourceFileName: string | null; parseStatus: string;
  createdAtUtc: string; createdBy: string | null; updatedAtUtc: string | null; updatedBy: string | null;
}

export interface CandidateQuery {
  search: string; status: string; from: string; to: string; sort: string; dir: string; page: number; pageSize: number;
}

export async function listCandidates(q: CandidateQuery): Promise<CandidateListResponse> {
  const p = new URLSearchParams();
  if (q.search) p.set("search", q.search);
  if (q.status) p.set("status", q.status);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  p.set("sort", q.sort); p.set("dir", q.dir); p.set("page", String(q.page)); p.set("pageSize", String(q.pageSize));
  const res = await apiFetch("/api/v1/candidates?" + p.toString());
  if (!res.ok) throw new Error("Could not load candidates.");
  return res.json();
}

export async function getCandidate(id: number): Promise<CandidateDetail> {
  const res = await apiFetch(`/api/v1/candidates/${id}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 404 ? "This candidate was not found. It may have been deleted." : (data.message ?? "Could not load the candidate."));
  return data as CandidateDetail;
}

export async function updateCandidate(id: number, r: SaveCandidateRequest): Promise<void> {
  const res = await apiFetch(`/api/v1/candidates/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message ?? "Could not save the changes.", data.errors);
}

export async function deleteCandidate(id: number): Promise<void> {
  const res = await apiFetch(`/api/v1/candidates/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(res.status === 404 ? "This candidate was already deleted." : (data.message ?? "Could not delete the candidate."));
  }
}

/* ---------- reports ---------- */

export interface ReportFilters { from: string; to: string; status: string }
export interface MonthItem { month: string; applications: number; extracted: number; ocrRequired: number }
export interface CountItem { name: string; count: number }
export interface GradeCounts { a: number; b: number; c: number; s: number; f: number; w: number; notEntered: number }
export interface ActivityItem { user: string; count: number; firstAddedUtc: string; lastAddedUtc: string }
export interface ReportSummary {
  total: number; extracted: number; ocrRequired: number;
  monthly: MonthItem[]; religion: CountItem[]; ageBands: CountItem[];
  olResults: { english: GradeCounts; maths: GradeCounts; sinhala: GradeCounts; tamil: GradeCounts; science: GradeCounts };
  activity: ActivityItem[];
}
export interface RegisterRow {
  candidateId: number; fullName: string; nic: string | null; dateOfBirth: string | null; age: number | null; phone: string | null;
  location: string | null; religion: string | null; olEnglish: string | null; olMaths: string | null; olSinhala: string | null;
  olTamil: string | null; olScience: string | null; olSummary: string | null; alResults: string | null;
  parseStatus: string; createdAtUtc: string; createdBy: string | null;
}
export interface RegisterResponse { items: RegisterRow[]; total: number; page: number; pageSize: number }
export interface RegisterQuery extends ReportFilters { search: string; sort: string; dir: string; page: number; pageSize: number }

const filterParams = (f: ReportFilters) => {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.status) p.set("status", f.status);
  return p;
};

export async function fetchReportSummary(f: ReportFilters): Promise<ReportSummary> {
  const res = await apiFetch("/api/v1/reports/summary?" + filterParams(f).toString());
  if (!res.ok) throw new Error("Could not build the report.");
  return res.json();
}

export async function fetchRegister(q: RegisterQuery): Promise<RegisterResponse> {
  const p = filterParams(q);
  if (q.search) p.set("search", q.search);
  p.set("sort", q.sort); p.set("dir", q.dir); p.set("page", String(q.page)); p.set("pageSize", String(q.pageSize));
  const res = await apiFetch("/api/v1/reports/register?" + p.toString());
  if (!res.ok) throw new Error("Could not build the report.");
  return res.json();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The server builds the file (all matching rows, not just the visible page)
export async function downloadRegisterCsv(q: ReportFilters & { search: string; sort: string; dir: string }): Promise<void> {
  const p = filterParams(q);
  if (q.search) p.set("search", q.search);
  p.set("sort", q.sort); p.set("dir", q.dir);
  const res = await apiFetch("/api/v1/reports/register.csv?" + p.toString());
  if (!res.ok) throw new Error("Could not export the report.");
  const name = /filename=([^;]+)/i.exec(res.headers.get("Content-Disposition") ?? "")?.[1]?.replace(/"/g, "") ?? "candidate-register.csv";
  saveBlob(await res.blob(), name);
}
