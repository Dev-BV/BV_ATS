import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Bell, Briefcase, ChevronDown, CircleHelp, House, LogOut, Settings, Users } from "lucide-react";

/* Bellvantage logo mark: three people */
export function Logo({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="9.5" r="6.2" fill="#6cb8ff" />
      <circle cx="9.5" cy="21" r="6" fill="#2f6df6" />
      <circle cx="38.5" cy="21" r="6" fill="#9bd0ff" />
      <path d="M3.5 41c0-8 4-12.5 10-12.5" stroke="#2f6df6" strokeWidth="5" strokeLinecap="round" />
      <path d="M44.5 41c0-8-4-12.5-10-12.5" stroke="#9bd0ff" strokeWidth="5" strokeLinecap="round" />
      <path d="M13 43c1.5-8 5-12 11-12s9.5 4 11 12" stroke="#6cb8ff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/* City skyline illustration for the sidebar footer (deterministic, generated) */
export function Skyline() {
  const items = useMemo(() => {
    let s = 11;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const out: ReactElement[] = [];
    let x = -4;
    while (x < 232) {
      const w = 16 + Math.floor(r() * 24);
      const h = 70 + Math.floor(r() * 170);
      const y = 300 - h;
      out.push(<rect key={"b" + x} x={x} y={y} width={w} height={h} fill={`rgb(${18 + Math.floor(r() * 14)},${52 + Math.floor(r() * 24)},${128 + Math.floor(r() * 30)})`} opacity=".9" />);
      for (let wy = y + 7; wy < 292; wy += 9)
        for (let wx = x + 3; wx < x + w - 3; wx += 6)
          if (r() < 0.3) out.push(<rect key={`w${x}-${wy}-${wx}`} x={wx} y={wy} width="2.4" height="3.4" fill="#9cc8ff" opacity={0.35 + r() * 0.4} />);
      x += w + (r() < 0.35 ? 3 : 0);
    }
    return out;
  }, []);
  return (
    <svg className="skyline" viewBox="0 0 224 300" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a2159" stopOpacity="1" />
          <stop offset="0.55" stopColor="#0a2159" stopOpacity="0" />
        </linearGradient>
      </defs>
      {items}
      <rect width="224" height="300" fill="url(#fade)" />
    </svg>
  );
}

const NAV = [
  [House, "Dashboard", "/"], [Users, "Candidates", "/candidates"], [Briefcase, "Recruitment", null],
  [BarChart3, "Reports", "/reports"], [Settings, "Settings", null], [CircleHelp, "Help", null],
] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = pathname.startsWith("/candidates") ? "Candidates" : pathname.startsWith("/reports") ? "Reports" : "Dashboard";
  return (
    <aside className="side">
      <div className="brand" onClick={() => navigate("/")}>
        <Logo />
        <div><b>Bellvantage</b><small>People. Progress. Together.</small></div>
      </div>
      <nav>
        {NAV.map(([Icon, label, to]) => (
          <button key={label} className={"nav" + (label === active ? " on" : "")} disabled={!to} onClick={() => to && navigate(to)}>
            <Icon size={21} strokeWidth={label === active ? 2.4 : 2} /> <span>{label}</span>
            {label === "Recruitment" && <ChevronDown size={17} className="chev" />}
          </button>
        ))}
      </nav>
      <Skyline />
      <div className="ver">ATS v1.0.0</div>
    </aside>
  );
}

export function ConfirmDialog(p: {
  title: string; message: string; confirmLabel: string; busy?: boolean; error?: string; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !p.busy) p.onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.busy]);
  return (
    <div className="veil" onClick={() => !p.busy && p.onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{p.title}</h3>
        <p>{p.message}</p>
        {p.error && <div className="alert err">{p.error}</div>}
        <div className="dactions">
          <button className="btn ghost" disabled={p.busy} onClick={p.onCancel}>Cancel</button>
          <button className="btn danger" disabled={p.busy} onClick={p.onConfirm}>{p.busy ? "Deleting…" : p.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";

export function Topbar({ title, subtitle, crumbs, user, onLogout }:
  { title: string; subtitle: string; crumbs?: string[]; user: { displayName: string }; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="top">
      <div>
        {crumbs && <div className="crumbs">{crumbs.map((c, i) => <span key={c}>{i > 0 && " › "}{c}</span>)}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="user">
        <span className="bell"><Bell size={24} /></span>
        <button className="userbtn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
          <span className="av">{initials(user.displayName)}</span>
          <b>{user.displayName}</b>
          <ChevronDown size={16} />
        </button>
        {open && (
          <>
            <div className="menuveil" onClick={() => setOpen(false)} />
            <div className="usermenu" role="menu">
              <button role="menuitem" onClick={() => { setOpen(false); onLogout(); }}><LogOut size={16} /> Sign out</button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
