import { useMemo, useState } from "react";
import { Calendar, ChevronDown, CircleCheck, GraduationCap, Info, RotateCcw, Save, TriangleAlert, User, X } from "lucide-react";
import { ApiError, type SaveCandidateRequest } from "../api";

const RELIGIONS = ["Buddhism", "Catholic", "Christian", "Hindu", "Islam", "Other"];
const NIC_RX = /^(\d{9}[VX]|\d{12})$/;
const PERSONAL = ["fullName", "nic", "dateOfBirth", "phone", "location", "religion"];
type Tab = "personal" | "education" | "additional";
type Values = Record<"fullName" | "nic" | "dateOfBirth" | "phone" | "location" | "religion" | "olEnglish" | "olMaths" | "olSinhala" | "olTamil" | "olScience" | "olSummary" | "alResults" | "notes", string>;
type K = keyof Values;

export interface FormInitial {
  fullName: string | null; nic: string | null; dateOfBirth: string | null; phone: string | null; location: string | null; religion: string | null;
  olEnglish: string | null; olMaths: string | null; olSinhala: string | null; olTamil: string | null; olScience: string | null;
  olSummary: string | null; alResults: string | null; notes?: string | null;
}
export type FormOutput = Omit<SaveCandidateRequest, "dobSource" | "sourceFileName" | "requiresOcr">;

// 0771234567 / +94 77 123 4567 / 0094771234567  ->  0771234567 (null if not a Sri Lankan mobile)
function normMobile(s: string): string | null {
  let d = s.replace(/\D/g, "");
  if (d.startsWith("0094")) d = "0" + d.slice(4);
  else if (d.startsWith("94") && d.length === 11) d = "0" + d.slice(2);
  return /^07\d{8}$/.test(d) ? d : null;
}

// Same rules as the API (CandidatesController) – the API re-checks everything.
function validate(f: Values): Partial<Record<K, string>> {
  const e: Partial<Record<K, string>> = {};
  const name = f.fullName.trim();
  if (!name) e.fullName = "Full name is required.";
  else if (name.length < 2) e.fullName = "Full name is too short.";
  else if (!/^[\p{L}\s.'-]+$/u.test(name)) e.fullName = "Full name can contain letters, spaces, . ' and - only.";

  if (!f.nic.trim()) e.nic = "NIC number is required.";
  else if (!NIC_RX.test(f.nic.trim())) e.nic = "Use 9 digits + V/X (e.g. 955123456V) or 12 digits.";

  if (!f.dateOfBirth) e.dateOfBirth = "Date of birth is required.";
  else {
    const d = new Date(f.dateOfBirth);
    if (isNaN(d.getTime()) || d.getFullYear() < 1930) e.dateOfBirth = "Date of birth is not valid.";
    else if (d > new Date()) e.dateOfBirth = "Date of birth cannot be in the future.";
  }

  if (!f.phone.trim()) e.phone = "Contact mobile number is required.";
  else if (!normMobile(f.phone)) e.phone = "Enter a valid mobile number, e.g. 0771234567 or +94771234567.";

  if (!f.location.trim()) e.location = "Location is required.";
  else if (f.location.trim().length < 5) e.location = "Location is too short.";

  if (!f.religion) e.religion = "Please select a religion.";

  (["olEnglish", "olMaths", "olSinhala", "olScience"] as K[]).forEach((k) => { if (!f[k]) e[k] = "Required"; });
  return e;
}

const tabOf = (k: string): Tab => (PERSONAL.includes(k) ? "personal" : k === "notes" ? "additional" : "education");

interface Props {
  initial: FormInitial;
  dobFromNic?: boolean;
  ocrWarning?: boolean;
  infoTitle: string;
  info: [string, string][];
  badge?: string;
  secondary: { label: string; icon: "reset" | "cancel"; onClick: () => void };
  primaryLabel: string;
  onSubmit: (v: FormOutput) => Promise<void>;   // throw (ApiError for field errors) to keep the form open
}

/** The candidate form shared by "review extracted CV" and "edit candidate". */
export default function CandidateForm(p: Props) {
  const d = p.initial;
  const [tab, setTab] = useState<Tab>("personal");
  const [f, setF] = useState<Values>({
    fullName: d.fullName ?? "", nic: d.nic ?? "", dateOfBirth: d.dateOfBirth ?? "", phone: d.phone ?? "",
    location: d.location ?? "", religion: d.religion ?? "",
    olEnglish: d.olEnglish ?? "", olMaths: d.olMaths ?? "", olSinhala: d.olSinhala ?? "", olTamil: d.olTamil ?? "", olScience: d.olScience ?? "",
    olSummary: d.olSummary ?? "", alResults: d.alResults ?? "", notes: d.notes ?? "",
  });
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrs, setServerErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [topErr, setTopErr] = useState("");

  const errs = useMemo(() => validate(f), [f]);
  const set = (k: K, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setServerErrs((s) => { const { [k]: _drop, ...rest } = s; return rest; });
  };
  const err = (k: K) => ((submitted || touched[k]) ? errs[k] : undefined) ?? serverErrs[k];
  const tabErrors = (t: Tab) => (submitted ? (Object.keys(errs) as K[]).filter((k) => tabOf(k) === t).length : 0) +
    Object.keys(serverErrs).filter((k) => tabOf(k) === t && !(k in errs)).length;

  const field = (label: string, k: K, o: { type?: string; req?: boolean; cls?: string; note?: string; filter?: (v: string) => string; max?: string; max_len?: number } = {}) => (
    <label className={o.cls}>
      <span>{label}{o.req && <em className="req"> *</em>}</span>
      <div className={"inp" + (err(k) ? " bad" : "")}>
        <input type={o.type ?? "text"} value={f[k]} max={o.max} maxLength={o.max_len} aria-invalid={!!err(k)}
          onChange={(e) => set(k, o.filter ? o.filter(e.target.value) : e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, [k]: true }))} />
        {o.type === "date" && <Calendar size={16} />}
      </div>
      {err(k) ? <em className="ferr">{err(k)}</em> : o.note && <small>{o.note}</small>}
    </label>
  );

  const grade = (label: string, k: K, req: boolean) => (
    <label key={k}>
      <span>{label}{req && <em className="req"> *</em>}</span>
      <div className={"inp" + (err(k) ? " bad" : "")}>
        <input value={f[k]} maxLength={1} placeholder="-" aria-invalid={!!err(k)}
          onChange={(e) => { const v = e.target.value.toUpperCase(); if (v === "" || /^[ABCSFW]$/.test(v)) set(k, v); }}
          onBlur={() => setTouched((t) => ({ ...t, [k]: true }))} />
      </div>
      {err(k) && <em className="ferr">{err(k)}</em>}
    </label>
  );

  const save = async () => {
    setSubmitted(true);
    setTopErr("");
    const bad = Object.keys(errs) as K[];
    if (bad.length > 0) {
      setTab(bad.some((k) => tabOf(k) === "personal") ? "personal" : tabOf(bad[0]));
      return setTopErr(`Please fix ${bad.length} highlighted field${bad.length > 1 ? "s" : ""} before saving.`);
    }
    const n = (v: string) => v.trim() || null;
    setSaving(true);
    try {
      await p.onSubmit({
        fullName: f.fullName.trim(), nic: f.nic.trim(), dateOfBirth: f.dateOfBirth, phone: normMobile(f.phone),
        location: f.location.trim(), religion: f.religion,
        olEnglish: f.olEnglish, olMaths: f.olMaths, olSinhala: f.olSinhala, olTamil: n(f.olTamil), olScience: f.olScience,
        olSummary: n(f.olSummary), alResults: n(f.alResults), notes: n(f.notes),
      });
    } catch (e) {
      if (e instanceof ApiError && e.errors) {
        setServerErrs(e.errors);
        const first = Object.keys(e.errors)[0];
        if (first) setTab(tabOf(first));
      }
      setTopErr(e instanceof Error ? e.message : "Could not save the candidate.");
      setSaving(false);
    }
  };

  const tabBtn = (t: Tab, icon: JSX.Element, label: string) => (
    <button className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
      {icon} {label}{tabErrors(t) > 0 && <i className="dot">{tabErrors(t)}</i>}
    </button>
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card review">
      {p.ocrWarning && <div className="alert err"><TriangleAlert size={18} /> No readable text found – this looks like a scanned CV (OCR needed). Please enter the details manually.</div>}
      <div className="rgrid">
        <aside>
          <div className="photo"><User size={50} fill="#8da6d6" color="#8da6d6" /></div>
          <h4>{p.infoTitle}</h4>
          <dl>
            {p.info.map(([k, v]) => <><dt key={k + "k"}>{k}</dt><dd key={k + "v"} title={v}>: {v}</dd></>)}
          </dl>
        </aside>

        <section>
          <div className="tabs">
            {tabBtn("personal", <User size={15} />, "Personal Details")}
            {tabBtn("education", <GraduationCap size={15} />, "Education & Results")}
            {tabBtn("additional", <Info size={15} />, "Additional Info")}
            {p.badge && <span className="pill ok done"><CircleCheck size={15} /> {p.badge}</span>}
          </div>

          {tab === "personal" && (
            <div className="fgrid">
              {field("Full Name", "fullName", { req: true, max_len: 200 })}
              {field("NIC", "nic", { req: true, max_len: 12, filter: (v) => v.toUpperCase().replace(/[^0-9VX]/g, "") })}
              {field("Date of Birth", "dateOfBirth", { type: "date", req: true, max: today, note: p.dobFromNic ? "Calculated from the NIC number" : undefined })}
              {field("Contact Mobile Number", "phone", { req: true, max_len: 16, filter: (v) => v.replace(/[^\d+\-\s]/g, "") })}
              {field("Location", "location", { req: true, cls: "full", max_len: 300 })}
              <label className="full"><span>Religion<em className="req"> *</em></span>
                <div className={"inp" + (err("religion") ? " bad" : "")}>
                  <select value={f.religion} aria-invalid={!!err("religion")} onChange={(e) => set("religion", e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, religion: true }))}>
                    <option value="">Select religion</option>
                    {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select><ChevronDown size={16} />
                </div>
                {err("religion") && <em className="ferr">{err("religion")}</em>}
              </label>
            </div>
          )}

          {tab === "education" && (
            <>
              <h5>GCE O/L Results</h5>
              <div className="g5">
                {grade("English", "olEnglish", true)}{grade("Maths", "olMaths", true)}{grade("Sinhala", "olSinhala", true)}
                {grade("Tamil", "olTamil", false)}{grade("Science", "olScience", true)}
              </div>
              <div className="g1">{field("O/L Summary (if the CV gives only totals)", "olSummary", { max_len: 50 })}</div>
              <h5>GCE A/L Results</h5>
              <div className="g1">{field("", "alResults", { max_len: 500 })}</div>
            </>
          )}

          {tab === "additional" && (
            <label className="full"><span>Notes</span><textarea rows={6} maxLength={1000} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
          )}
        </section>
      </div>

      {topErr && <div className="alert err"><TriangleAlert size={18} /> {topErr}</div>}
      <div className="actions">
        <button className="btn ghost" disabled={saving} onClick={p.secondary.onClick}>
          {p.secondary.icon === "reset" ? <RotateCcw size={16} /> : <X size={16} />} {p.secondary.label}
        </button>
        <button className="btn" disabled={saving} onClick={save}><Save size={16} /> {saving ? "Saving…" : p.primaryLabel}</button>
      </div>
    </div>
  );
}
