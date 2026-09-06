import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, DollarSign, ShieldCheck, AlertTriangle, TrendingUp, SlidersHorizontal, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  useListGigs,
  useTriggerGigSync,
  type ListGigsSort,
} from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { getApiErrorMessage } from "@/lib/api-error";

const TASK_TYPES = [
  { id: "data-entry", label: "Data Entry" },
  { id: "annotation", label: "Annotation" },
  { id: "writing", label: "Writing" },
  { id: "VA", label: "Virtual Assistant" },
  { id: "transcription", label: "Transcription" },
  { id: "admin", label: "Admin" },
  { id: "content-moderation", label: "Content Moderation" },
  { id: "customer-support", label: "Customer Support" },
  { id: "research", label: "Research" },
  { id: "other", label: "Other" },
];

const PAY_MODELS = [
  { id: "per-task", label: "Per Task" },
  { id: "hourly", label: "Hourly" },
  { id: "monthly", label: "Monthly" },
  { id: "project", label: "Project" },
];

const DIFFICULTY = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
];

const SORT_OPTIONS = [
  { id: "value", label: "Best Value 🇵🇰" },
  { id: "newest", label: "Newest" },
  { id: "pay", label: "Highest Pay" },
  { id: "legit", label: "Most Legit" },
];

function LegitBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 80 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : score >= 60 ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
    : "bg-red-500/20 text-red-400 border-red-500/30";
  const icon = score >= 80 ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />;
  return (
    <span className={`inline-flex items-center gap-1 border font-mono text-[10px] px-1.5 py-0.5 ${color}`}>
      {icon} {score}
    </span>
  );
}

function ValueBadge({ indicator }: { indicator: "high" | "good" | "low" | null }) {
  if (!indicator) return null;
  const map = {
    high: { label: "🔥 High Value", cls: "text-orange-400" },
    good: { label: "👍 Good Value", cls: "text-emerald-400" },
    low: { label: "— Low Value", cls: "text-muted-foreground" },
  };
  const { label, cls } = map[indicator];
  return <span className={`font-mono text-[10px] ${cls}`}>{label}</span>;
}

function PayDisplay({ gig }: { gig: any }) {
  if (!gig.estPayUSD) return <span className="text-muted-foreground font-mono text-xs">Pay TBD</span>;
  const model = gig.payModel;
  const suffix = model === "hourly" ? "/hr" : model === "monthly" ? "/mo" : model === "per-task" ? "/task" : "";
  return (
    <span className="font-mono text-xs text-primary font-semibold">
      ${gig.estPayUSD}{suffix} USD
    </span>
  );
}

function GigCard({ gig }: { gig: any }) {
  const [showFlags, setShowFlags] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border bg-card/40 hover:border-primary/40 hover:bg-card/70 transition-all p-5 flex flex-col gap-3 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {gig.title}
          </h3>
          {gig.company && (
            <p className="font-mono text-xs text-muted-foreground mt-0.5 truncate">{gig.company}</p>
          )}
        </div>
        <LegitBadge score={gig.legitScore} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {gig.taskType && (
          <Badge variant="secondary" className="rounded-none font-mono text-[10px] uppercase">
            {gig.taskType.replace(/-/g, " ")}
          </Badge>
        )}
        {gig.payModel && (
          <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">
            {gig.payModel}
          </Badge>
        )}
        {gig.difficulty && (
          <Badge
            variant="outline"
            className={`rounded-none font-mono text-[10px] uppercase ${gig.difficulty === "easy" ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}`}
          >
            {gig.difficulty}
          </Badge>
        )}
        <span className="font-mono text-[10px] text-muted-foreground uppercase border border-border px-1.5 py-0.5">
          {gig.source}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <PayDisplay gig={gig} />
          {gig.estMonthlyPKR !== null && (
            <span className="font-mono text-[11px] text-muted-foreground">
              ~Rs {gig.estMonthlyPKR.toLocaleString("en-PK")}{gig.isRecurring ? "/mo est." : " one-off est."}
            </span>
          )}
        </div>
        <ValueBadge indicator={gig.valueIndicator} />
      </div>

      {gig.redFlags?.length > 0 && (
        <button
          onClick={() => setShowFlags((v) => !v)}
          className="flex items-center gap-1 font-mono text-[10px] text-amber-400/80 hover:text-amber-400 transition-colors text-left"
        >
          <AlertTriangle className="w-3 h-3" />
          {gig.redFlags.length} red flag{gig.redFlags.length !== 1 ? "s" : ""}
          {showFlags ? " ▴" : " ▾"}
        </button>
      )}
      {showFlags && gig.redFlags?.length > 0 && (
        <ul className="space-y-0.5 pl-3 border-l border-amber-500/30">
          {gig.redFlags.map((f: string, i: number) => (
            <li key={i} className="font-mono text-[10px] text-amber-400/70">{f}</li>
          ))}
        </ul>
      )}

      <div className="pt-2 border-t border-border/50 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">
          {gig.postedDate ? formatDistanceToNow(new Date(gig.postedDate), { addSuffix: true }) : "Recently"}
        </span>
        {gig.applyUrl && (
          <a
            href={gig.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-primary border border-primary/50 px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            Open <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

export default function Gigs() {
  const [taskType, setTaskType] = useState("all");
  const [payModel, setPayModel] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [sort, setSort] = useState<ListGigsSort>("value");
  const [showLowTrust, setShowLowTrust] = useState(false);
  const [page, setPage] = useState(1);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const syncGigs = useTriggerGigSync();
  const syncing = syncGigs.isPending;

  const triggerSync = () => {
    setSyncMsg(null);
    syncGigs.mutate(undefined, {
      onSuccess: () => {
        setSyncMsg("Sync started — gigs will appear in ~2 min. Refresh the page then.");
      },
      onError: (error) => {
        setSyncMsg(`Sync failed. ${getApiErrorMessage(error, "Try again.")}`);
      },
    });
  };

  const { data, isLoading, refetch } = useListGigs({
    taskType: taskType !== "all" ? taskType : undefined,
    payModel: payModel !== "all" ? payModel : undefined,
    difficulty: difficulty !== "all" ? difficulty : undefined,
    sort,
    showLowTrust: showLowTrust ? "true" : undefined,
    page,
    limit: 24,
  });

  const gigs = data?.gigs ?? [];
  const total = data?.total ?? 0;
  const usdToPkr = data?.usdToPkr ?? 278;
  const hasFilters = taskType !== "all" || payModel !== "all" || difficulty !== "all";

  const clearFilters = () => {
    setTaskType("all");
    setPayModel("all");
    setDifficulty("all");
    setPage(1);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-serif text-3xl mb-1">Side Income</h1>
            <p className="font-mono text-sm text-muted-foreground">
              Low-barrier gigs + USD-paying remote work. Independent of your CV.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground border border-border px-2 py-1">
              1 USD ≈ Rs {usdToPkr.toFixed(0)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {total} gigs
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={triggerSync}
              disabled={syncing}
              className="rounded-none font-mono text-xs uppercase h-8 gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync Gigs"}
            </Button>
          </div>
        </div>

        {syncMsg && (
          <p className="font-mono text-xs text-primary/80 mt-2 border border-primary/20 px-3 py-2 bg-primary/5">
            {syncMsg}
          </p>
        )}

        <p className="font-mono text-[11px] text-muted-foreground/60 mt-3 italic">
          Pay estimates are AI-generated approximations, not guarantees.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Sidebar filters */}
        <aside className="space-y-5">
          <div>
            <p className="font-mono text-xs uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3 h-3" /> Filters
            </p>
            <div className="space-y-3">
              <div>
                <Label className="font-mono text-[10px] uppercase text-muted-foreground mb-1.5 block">Sort by</Label>
                <Select value={sort} onValueChange={(v) => { setSort(v as ListGigsSort); setPage(1); }}>
                  <SelectTrigger className="rounded-none h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="font-mono text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="font-mono text-[10px] uppercase text-muted-foreground mb-1.5 block">Task Type</Label>
                <Select value={taskType} onValueChange={(v) => { setTaskType(v); setPage(1); }}>
                  <SelectTrigger className="rounded-none h-8 text-xs font-mono">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="font-mono text-xs">All types</SelectItem>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="font-mono text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="font-mono text-[10px] uppercase text-muted-foreground mb-1.5 block">Pay Model</Label>
                <Select value={payModel} onValueChange={(v) => { setPayModel(v); setPage(1); }}>
                  <SelectTrigger className="rounded-none h-8 text-xs font-mono">
                    <SelectValue placeholder="All models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="font-mono text-xs">All models</SelectItem>
                    {PAY_MODELS.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="font-mono text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="font-mono text-[10px] uppercase text-muted-foreground mb-1.5 block">Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => { setDifficulty(v); setPage(1); }}>
                  <SelectTrigger className="rounded-none h-8 text-xs font-mono">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="font-mono text-xs">Any difficulty</SelectItem>
                    {DIFFICULTY.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="font-mono text-xs">{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Label className="font-mono text-[10px] uppercase text-muted-foreground cursor-pointer flex items-center gap-1.5">
                  {showLowTrust ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Show low-trust
                </Label>
                <Switch
                  checked={showLowTrust}
                  onCheckedChange={(v) => { setShowLowTrust(v); setPage(1); }}
                  className="scale-75"
                />
              </div>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="w-full rounded-none font-mono text-xs uppercase h-7"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>

          <div className="border border-border/50 p-3 space-y-1.5">
            <p className="font-mono text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> How Value is Calculated
            </p>
            <p className="font-mono text-[10px] text-muted-foreground/70 leading-relaxed">
              Monthly PKR = pay × hours × rate.<br />
              Value Score = monthly PKR ÷ effort.<br />
              Easy = 1× effort, Medium = 1.6×.
            </p>
          </div>
        </aside>

        {/* Gig grid */}
        <div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border border-border bg-card/20 h-48 animate-pulse" />
              ))}
            </div>
          ) : gigs.length === 0 ? (
            <div className="border border-border p-12 text-center">
              <DollarSign className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-serif text-lg mb-1">No gigs yet</p>
              <p className="font-mono text-xs text-muted-foreground mb-4">
                Trigger a sync to populate gigs, or clear filters.
              </p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="rounded-none font-mono text-xs">
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {gigs.map((gig: any, i: number) => (
                  <GigCard key={gig.id} gig={gig} />
                ))}
              </div>

              {/* Pagination */}
              {total > 24 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                  <span className="font-mono text-xs text-muted-foreground">
                    Page {page} · {total} gigs total
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-none font-mono text-xs"
                    >
                      ← Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * 24 >= total}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-none font-mono text-xs"
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
