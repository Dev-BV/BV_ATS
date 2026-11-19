import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, FileText, Lock, Target, User, Users } from "lucide-react";
import { login, type AuthUser } from "../api";
import logo from "../assets/bellvantage-logo.png";
import office from "../assets/login-office.jpg";

const FEATURES = [
  { Icon: Users, title: "Smart CV Extraction", text: "Automatically extract key information from CVs with accuracy." },
  { Icon: Target, title: "Better Matching", text: "Find the best candidates with intelligent matching." },
  { Icon: FileText, title: "Efficient Hiring", text: "Simplify, organize and manage your recruitment process." },
];

export default function Login({ onSignedIn, notice }: { onSignedIn: (u: AuthUser) => void; notice?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");

  const userErr = tried && !username.trim() ? "Please enter your username." : "";
  const passErr = tried && !password ? "Please enter your password." : "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setError("");
    if (!username.trim() || !password) return;
    setBusy(true);
    try {
      onSignedIn(await login(username.trim(), password, remember));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setPassword("");
      setTried(false);   // don't flag the cleared password box on top of the real error
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="lhero">
        <div className="lphoto" style={{ backgroundImage: `url(${office})` }} />
        <div className="lhead"><span className="lbadge"><img src={logo} alt="Bellvantage" /></span></div>

        <div className="lcopy">
          <h1>Applicant Tracking System <span>(ATS)</span></h1>
          <p>Streamline your recruitment process and find the right talent, faster.</p>
          <ul>
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title}>
                <span className="fico"><Icon size={26} /></span>
                <div><b>{title}</b><small>{text}</small></div>
              </li>
            ))}
          </ul>
        </div>

        <div className="cards" aria-hidden>
          <div className="pc pc3"><i className="pav" /><b /><b /></div>
          <div className="pc pc2"><i className="pav" /><b /><b /></div>
          <div className="pc pc1">
            <i className="pav big"><User size={30} fill="#fff" color="#fff" /></i>
            <div className="pl"><b className="w60" /><b className="w90" /><b className="w50" /><b className="w80" /><b className="w70" /></div>
            <span className="pok"><Check size={20} strokeWidth={3.5} /></span>
          </div>
        </div>
      </section>

      <section className="lform">
        <form onSubmit={submit} noValidate>
          <img className="flogo" src={logo} alt="Bellvantage – aspirations delivered" />
          <h2>Welcome Back</h2>
          <p className="fsub">Sign in to access your ATS account</p>

          {notice && !error && <div className="lnote">{notice}</div>}

          <div className={"lfield" + (userErr ? " bad" : "")}>
            <User size={24} />
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username"
              autoFocus maxLength={100} aria-label="Username" aria-invalid={!!userErr} />
          </div>
          {userErr && <em className="lerr">{userErr}</em>}

          <div className={"lfield" + (passErr ? " bad" : "")}>
            <Lock size={24} />
            <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
              autoComplete="current-password" maxLength={200} aria-label="Password" aria-invalid={!!passErr} />
            <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={24} /> : <Eye size={24} />}
            </button>
          </div>
          {passErr && <em className="lerr">{passErr}</em>}

          <label className="lremember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="box"><Check size={16} strokeWidth={3.5} /></span>
            Remember me
          </label>

          {error && <div className="lfail" role="alert">{error}</div>}

          <button className="lbtn" type="submit" disabled={busy}>
            {busy ? "Signing in…" : <>Sign In <ArrowRight size={22} /></>}
          </button>
        </form>
        <div className="lver">Bellvantage ATS &nbsp;v1.0.0</div>
      </section>
    </div>
  );
}
