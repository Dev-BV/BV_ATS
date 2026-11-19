import { useRef, useState, type DragEvent } from "react";
import { Check, FolderOpen, Info, Plus, UploadCloud } from "lucide-react";
import { extractCv, type CvExtractResponse } from "../api";

const MAX = 5 * 1024 * 1024;

export default function UploadCv({ onExtracted }: { onExtracted: (d: CvExtractResponse, file: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  const handle = async (file?: File) => {
    if (!file) return;
    setError("");
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".docx"].includes(ext)) return setError("Only PDF or DOCX files are allowed.");
    if (file.size > MAX) return setError("File is too large (max 5 MB).");

    setFileName(file.name);
    setBusy(true);
    setProgress(10);
    // The API gives no real progress, so ease the bar towards 90% while we wait
    const t = setInterval(() => setProgress((p) => Math.min(90, p + (90 - p) * 0.15)), 200);
    try {
      const data = await extractCv(file);
      setProgress(100);
      onExtracted(data, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach the server.");
      setProgress(0);
      setFileName("");
    } finally {
      clearInterval(t);
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); };
  const step = !fileName ? 0 : busy ? 1 : 2;
  const done = (b: boolean) => (b ? <span className="ck on"><Check size={15} strokeWidth={3} /></span> : <span className="ck"><Plus size={15} strokeWidth={3} /></span>);

  return (
    <div className="upload">
      <div className="uleft">
        <div className={"drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)} onDrop={drop}>
          <UploadCloud size={72} strokeWidth={1.6} color="#1f56d8" />
          <h2>Drag &amp; Drop your CV here</h2>
          <p>or</p>
          <button className="btn" disabled={busy} onClick={() => input.current?.click()}><FolderOpen size={18} /> Browse Files</button>
          <input ref={input} type="file" accept=".pdf,.docx" hidden onChange={(e) => handle(e.target.files?.[0])} />
          <small>Supported formats: PDF, DOCX &nbsp;|&nbsp; Max size: 5 MB</small>
        </div>
        {error && <div className="alert err">{error}</div>}

        <div className="stepper">
          {["Upload", "Extract", "Review"].map((s, i) => (
            <div key={s} className={"stp" + (i <= step ? " on" : "")}>
              {i > 0 && <i className={i <= step ? "on" : ""} />}
              <span>{i + 1}</span><em>{s}</em>
            </div>
          ))}
        </div>
      </div>

      <aside className="proc">
        <header>Extraction Process</header>
        <ul>
          <li className={fileName ? "" : "dim"}>{done(!!fileName)}<div><b>File Uploaded</b>{fileName && <small>{fileName}</small>}</div></li>
          <li className={busy ? "" : "dim"}>{done(busy || step === 2)}
            <div><b>Extracting Information…</b>
              {busy && <div className="pbar"><div style={{ width: progress + "%" }} /><em>{Math.round(progress)}%</em></div>}</div>
          </li>
          <li className="dim">{done(false)}<div><b>Review Data</b></div></li>
          <li className="dim">{done(false)}<div><b>Ready for Review</b></div></li>
        </ul>
      </aside>

      {busy && <div className="banner"><Info size={22} fill="#1f56d8" color="#fff" /> Please wait while we extract the information from your CV. This may take a few seconds.</div>}
    </div>
  );
}
