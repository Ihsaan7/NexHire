// Dashboard.tsx — sample page using the new Job-Seeker visual system.
// Tailwind classes resolve from globals.css / tailwind.config.ts (HSL tokens).
// Component utility classes used here (.job-card, .pill, .btn, .kicker, .nums,
// .animate-card-in, .pulse-dot, ambient .orb / .grid-overlay / .noise-overlay)
// are defined in globals.css.
import { useState } from "react";

type Job = {
  id: string; title: string; company: string; location: string;
  salary: string; tags: string[]; score: number; posted: string; isNew?: boolean;
};

const JOBS: Job[] = [
  { id: "1", title: "Senior Frontend Engineer", company: "Systems Limited", location: "Lahore · Hybrid", salary: "PKR 450k – 650k / mo", tags: ["React", "TypeScript", "Next.js"], score: 96, posted: "2h ago", isNew: true },
  { id: "2", title: "Product Designer", company: "NayaPay", location: "Karachi · On-site", salary: "PKR 380k – 520k / mo", tags: ["Figma", "Fintech"], score: 92, posted: "5h ago", isNew: true },
  { id: "3", title: "Data Analyst", company: "Bazaar", location: "Remote", salary: "PKR 300k – 420k / mo", tags: ["SQL", "Python"], score: 89, posted: "1d ago" },
  { id: "4", title: "Backend Engineer (Node)", company: "Abhi", location: "Karachi · Hybrid", salary: "PKR 500k – 700k / mo", tags: ["Node", "AWS", "Postgres"], score: 87, posted: "1d ago" },
  { id: "5", title: "Growth Marketer", company: "Sastaticket.pk", location: "Islamabad", salary: "PKR 250k – 360k / mo", tags: ["SEO", "Paid Ads"], score: 84, posted: "2d ago" },
  { id: "6", title: "Mobile Engineer (Flutter)", company: "Bykea", location: "Karachi", salary: "PKR 400k – 560k / mo", tags: ["Flutter", "Dart"], score: 81, posted: "3d ago" },
];

const FILTERS = ["All jobs", "≥90% fit", "Remote", "Karachi", "Lahore", "Full-time", "Fintech", "Posted today"];
const TABS = ["Dashboard", "Side Income", "Tracker", "CV"];
const NAV = [
  { key: "home", label: "Home" }, { key: "gigs", label: "Gigs" },
  { key: "search", label: "Search" }, { key: "tracker", label: "Tracker" }, { key: "cv", label: "CV" },
];

const C = 2 * Math.PI * 18; // ring circumference

function MatchRing({ score }: { score: number }) {
  return (
    <div className="relative grid h-[46px] w-[46px] place-items-center">
      <svg width={46} height={46} viewBox="0 0 46 46" className="-rotate-90">
        <circle cx={23} cy={23} r={18} fill="none" strokeWidth={3} className="stroke-border" />
        <circle cx={23} cy={23} r={18} fill="none" strokeWidth={3} strokeLinecap="round"
          className="stroke-primary animate-ring" strokeDasharray={C}
          strokeDashoffset={C * (1 - score / 100)} style={{ ["--ring-circ" as string]: `${C}` }} />
      </svg>
      <span className="nums absolute font-mono text-xs font-medium">{score}</span>
    </div>
  );
}

function JobCard({ job, i }: { job: Job; i: number }) {
  return (
    <article className="job-card animate-card-in flex flex-col bg-card" style={{ animationDelay: `${i * 70}ms` }}>
      <div className="flex items-start justify-between p-[18px] pb-0">
        <div className="grid h-11 w-11 place-items-center rounded-md border border-border font-serif text-base font-semibold"
          style={{ background: "repeating-linear-gradient(45deg, hsl(var(--muted)) 0 6px, hsl(var(--surface)) 6px 12px)" }}>
          {job.company.replace(/[^A-Za-z ]/g, "").split(" ").slice(0, 2).map((w) => w[0]).join("")}
        </div>
        <MatchRing score={job.score} />
      </div>
      <div className="px-[18px] pt-3">
        {job.isNew && (
          <div className="mb-2 inline-flex items-center gap-1.5">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary-strong">New</span>
          </div>
        )}
        <h3 className="font-serif text-xl font-medium leading-tight tracking-tight">{job.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{job.company} · {job.location}</p>
        <p className="nums mt-3 font-mono text-[13px] font-medium tracking-tight">{job.salary}</p>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {job.tags.map((t) => (
            <span key={t} className="rounded-pill border border-border bg-surface px-2.5 py-0.5 text-[11.5px] text-muted-foreground">{t}</span>
          ))}
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between p-[18px] pt-4">
        <span className="font-mono text-[11px] text-muted-foreground/70">{job.posted}</span>
        <div className="flex gap-2">
          <button className="btn grid h-9 w-9 place-items-center rounded-pill border border-border text-muted-foreground">♡</button>
          <button className="btn btn-primary px-5 py-2 text-[13.5px]">Apply</button>
        </div>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const [dark, setDark] = useState(true);
  const [active, setActive] = useState<Record<string, boolean>>({ "≥90% fit": true });
  const [nav, setNav] = useState(0);
  const toggle = (f: string) => setActive((s) => ({ ...s, [f]: !s[f] }));

  return (
    <div className={dark ? "dark" : ""}>
      <div className="relative min-h-screen overflow-x-hidden bg-background pb-28 text-foreground">
        {/* Ambient layers (defined in globals.css) */}
        <div className="animated-bg"><span className="orb orb-1" /><span className="orb orb-2" /><span className="orb orb-3" /></div>
        <div className="grid-overlay" /><div className="noise-overlay" />

        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1180px] items-center gap-7 px-7 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-[30px] w-[30px] place-items-center rounded-md bg-primary font-serif text-lg font-semibold text-primary-foreground">R</div>
              <span className="font-serif text-xl font-medium tracking-tight">Rozgar</span>
              <span className="kicker rounded-pill border border-border px-1.5 py-0.5">PK</span>
            </div>
            <nav className="ml-2 flex gap-1">
              {TABS.map((t, i) => (
                <button key={t} className={`pill !rounded-pill ${i === 0 ? "bg-surface text-foreground" : "border-transparent bg-transparent"}`}>{t}</button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => setDark((d) => !d)} className="grid h-[38px] w-[38px] place-items-center rounded-pill border border-border bg-surface">{dark ? "☀" : "☾"}</button>
              <div className="grid h-[38px] w-[38px] place-items-center rounded-pill bg-primary-soft text-[13px] font-semibold text-primary-strong">AK</div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="relative z-[5] mx-auto max-w-[1180px] px-7 pt-10">
          <section className="mb-8 flex flex-wrap items-end justify-between gap-8">
            <div>
              <p className="kicker mb-3.5">Good morning, Ayesha</p>
              <h1 className="font-serif text-[clamp(34px,4.5vw,52px)] font-normal leading-[1.02] tracking-tight">
                <span className="font-medium text-primary">12</span> new matches today
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">Curated from 1,840 live listings across Pakistan, ranked by fit to your CV.</p>
            </div>
            <div className="flex items-center gap-5 border border-card-border bg-card px-5 py-4">
              {[["24", "Applied"], ["3", "Interviews"]].map(([n, l]) => (
                <div key={l} className="text-center">
                  <div className="nums font-serif text-3xl font-medium leading-none">{n}</div>
                  <div className="kicker mt-2">{l}</div>
                </div>
              ))}
              <div className="text-center">
                <div className="nums font-serif text-3xl font-medium leading-none text-primary">88<span className="text-base">%</span></div>
                <div className="kicker mt-2">Avg fit</div>
              </div>
            </div>
          </section>

          {/* Filter pills */}
          <div className="mb-7 flex gap-2 overflow-x-auto pb-1.5">
            {FILTERS.map((f) => (
              <button key={f} className="pill" data-active={!!active[f]} onClick={() => toggle(f)}>{f}</button>
            ))}
          </div>

          <div className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
            <span className="kicker">AI-matched for you</span>
            <span className="font-mono text-xs text-muted-foreground/70">{JOBS.length} roles</span>
          </div>

          {/* Dense job grid — hairline dividers */}
          <div className="grid gap-px border border-border bg-border [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
            {JOBS.map((job, i) => <JobCard key={job.id} job={job} i={i} />)}
          </div>
        </main>

        {/* Mobile bottom bar — floating pill with sliding indicator */}
        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 grid place-items-center px-4 pb-4">
          <div className="pointer-events-auto relative grid w-[min(440px,100%)] grid-cols-5 gap-0.5 rounded-pill border border-card-border bg-card/90 p-2 shadow-pop backdrop-blur-xl">
            <span className="absolute inset-y-2 left-2 w-[calc((100%-16px)/5)] rounded-pill bg-primary-soft transition-transform duration-[400ms] ease-out-expo"
              style={{ transform: `translateX(${nav * 100}%)` }} />
            {NAV.map((n, i) => (
              <button key={n.key} onClick={() => setNav(i)}
                className={`relative z-[1] flex flex-col items-center gap-1.5 py-2 ${nav === i ? "text-primary-strong" : "text-muted-foreground"}`}>
                <span className="grid h-4 w-5 place-items-center"><span className="h-3 w-3 rounded-sm border-2 border-current" /></span>
                <span className="font-mono text-[9.5px] uppercase tracking-wide">{n.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
