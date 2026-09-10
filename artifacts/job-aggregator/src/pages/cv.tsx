import {
  useGetProfile,
  useGetLatestCvAudit,
  getGetLatestCvAuditQueryKey,
  useUploadCv,
  useGetCvSuggestions,
  getGetCvSuggestionsQueryKey,
  useAuditCv,
  useRefineCv,
  type CvAuditResult,
  type CvRefineResult,
} from "@workspace/api-client-react";
import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Sparkles,
  ShieldAlert, RefreshCw, Copy, Check, ChevronDown, ChevronUp,
  Zap, Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
type AuditIssue = {
  category: string;
  severity: "high" | "medium" | "low";
  problem: string;
  correction: string;
};
// ── Severity badge ─────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: AuditIssue["severity"] }) {
  const map = {
    high:   "bg-red-500/15 text-red-400 border-red-500/30",
    medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    low:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  return (
    <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${map[severity]}`}>
      {severity}
    </span>
  );
}

// ── Score ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 34; const circ = 2 * Math.PI * r;
  const color = score >= 70 ? "stroke-green-400" : score >= 50 ? "stroke-yellow-400" : "stroke-red-400";
  return (
    <div className="relative grid place-items-center w-20 h-20">
      <svg width={80} height={80} viewBox="0 0 80 80" className="-rotate-90">
        <circle cx={40} cy={40} r={r} fill="none" strokeWidth={5} className="stroke-border" />
        <circle cx={40} cy={40} r={r} fill="none" strokeWidth={5} strokeLinecap="round"
          className={color}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono text-xl font-bold">{score}</div>
        <div className="font-mono text-[9px] text-muted-foreground uppercase">/100</div>
      </div>
    </div>
  );
}

function formatAuditAge(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? formatDistanceToNow(date, { addSuffix: true })
    : "recently";
}

// ── Collapsible issue card ──────────────────────────────────────────────────────
function IssueCard({ issue, index }: { issue: AuditIssue; index: number }) {
  const [open, setOpen] = useState(index < 3);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="border border-border bg-card/40"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SeverityBadge severity={issue.severity} />
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {issue.category}
            </span>
          </div>
          <p className="text-sm font-medium leading-snug">{issue.problem}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 ml-7 border-t border-border/50 pt-3">
              <p className="font-mono text-xs text-muted-foreground mb-1 uppercase tracking-wider">Fix</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{issue.correction}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function CV() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: loadingProfile, refetch: refetchProfile } = useGetProfile();
  const {
    data: latestAudit,
    isLoading: loadingLatestAudit,
    refetch: refetchLatestAudit,
  } = useGetLatestCvAudit({
    query: {
      enabled: !!profile?.cvText,
      queryKey: [
        ...getGetLatestCvAuditQueryKey(),
        profile?.userId ?? null,
        profile?.cvUpdatedAt ?? null,
      ],
    },
  });
  const { data: suggestions, isLoading: loadingSuggestions } = useGetCvSuggestions({
    query: { enabled: !!profile?.cvText, queryKey: getGetCvSuggestionsQueryKey() },
  });
  const uploadCv = useUploadCv();

  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Audit state ──
  const [audit, setAudit] = useState<CvAuditResult | null>(null);
  const [auditGeneratedAt, setAuditGeneratedAt] = useState<string | null>(null);

  // ── Refine state ──
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [refined, setRefined] = useState<CvRefineResult | null>(null);

  useEffect(() => {
    if (latestAudit?.audit) {
      setAudit(latestAudit.audit.auditResult);
      setAuditGeneratedAt(latestAudit.audit.createdAt);
    } else if (!loadingLatestAudit) {
      setAudit(profile?.cvAudit ?? null);
      setAuditGeneratedAt(profile?.cvAudit?.generatedAt ?? null);
    }
  }, [latestAudit, loadingLatestAudit, profile?.cvAudit]);

  useEffect(() => {
    setRefined(profile?.cvRefinement ?? null);
    if (profile?.cvRefinement) {
      setJobTitle(profile.cvRefinement.jobTitle ?? "");
      setJobDescription(profile.cvRefinement.jobDescription);
    }
  }, [profile?.cvRefinement]);

  const auditCv = useAuditCv({
    mutation: {
      onSuccess: async (data) => {
        setAudit(data);
        const savedAudit = await refetchLatestAudit();
        setAuditGeneratedAt(
          savedAudit.data?.audit?.createdAt ?? new Date().toISOString(),
        );
        await refetchProfile();
      },
      onError: (error) => {
        toast({ title: "Audit failed", description: getApiErrorMessage(error, "Try again."), variant: "destructive" });
      },
    },
  });
  const refineCv = useRefineCv({
    mutation: {
      onSuccess: (data) => {
        setRefined(data);
        // Refresh the profile so the saved job context and rewritten CV are
        // available after navigation or an authenticated reload.
        refetchProfile();
      },
      onError: (error) => {
        toast({ title: "Refine failed", description: getApiErrorMessage(error, "Try again."), variant: "destructive" });
      },
    },
  });
  const auditing = auditCv.isPending;
  const refining = refineCv.isPending;

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  }, []);
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const processFile = (file: File) => {
    if (file.type !== "application/pdf" && !file.type.includes("word")) {
      toast({ title: "Invalid file type", description: "Please upload a PDF or DOCX file.", variant: "destructive" });
      return;
    }
    uploadCv.mutate({ data: { file } }, {
      onSuccess: async () => {
        // The API removes audit/refinement results for a replacement CV.
        // Clear the current view immediately while the profile rehydrates.
        setAudit(null);
        setAuditGeneratedAt(null);
        queryClient.removeQueries({
          queryKey: getGetLatestCvAuditQueryKey(),
        });
        setRefined(null);
        setJobTitle("");
        setJobDescription("");
        toast({ title: "CV uploaded successfully", description: "Your data has been extracted." });
        await refetchProfile();
      },
      onError: (error) => toast({
        title: "Upload failed",
        description: getApiErrorMessage(error, "Something went wrong."),
        variant: "destructive",
      }),
    });
  };

  const runAudit = () => {
    setAudit(null);
    auditCv.mutate();
  };

  const runRefine = () => {
    if (!jobDescription.trim()) {
      toast({ title: "Job description required", description: "Paste the job description below.", variant: "destructive" });
      return;
    }
    setRefined(null);
    refineCv.mutate({ data: { jobTitle, jobDescription } });
  };

  const copyRefined = () => {
    if (refined?.refinedCv) {
      navigator.clipboard.writeText(refined.refinedCv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loadingProfile) {
    return <div className="p-8"><Skeleton className="h-64 w-full bg-muted rounded-none" /></div>;
  }

  const hasCV = !!profile?.cvText;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-2">CV Studio</h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          Upload · Audit · Refine for any job
        </p>
      </header>

      <Tabs defaultValue="mycv" className="w-full">
        <TabsList className="w-full mb-8 bg-card border border-border rounded-none grid grid-cols-3 h-auto p-1 gap-1">
          <TabsTrigger value="mycv" className="rounded-none font-mono text-xs uppercase tracking-wider py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            My CV
          </TabsTrigger>
          <TabsTrigger value="audit" className="rounded-none font-mono text-xs uppercase tracking-wider py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            PK Audit
          </TabsTrigger>
          <TabsTrigger value="refine" className="rounded-none font-mono text-xs uppercase tracking-wider py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Refine for Job
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: My CV ── */}
        <TabsContent value="mycv">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div
                className={`border-2 border-dashed p-10 flex flex-col items-center justify-center text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border bg-card/20"}`}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              >
                {uploadCv.isPending ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="font-mono text-sm">Extracting text & generating embeddings…</p>
                  </div>
                ) : (
                  <>
                    <Upload className={`w-10 h-10 mb-4 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                    <h3 className="font-serif text-xl mb-2">{hasCV ? "Update your CV" : "Upload your CV"}</h3>
                    <p className="text-muted-foreground font-mono text-sm mb-6 max-w-sm">
                      Drag and drop your PDF or DOCX here, or click to browse.
                    </p>
                    <div className="relative">
                      <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} accept=".pdf,.doc,.docx" />
                      <Button variant="outline" className="rounded-none font-mono uppercase text-xs tracking-wider pointer-events-none">
                        Select File
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {hasCV && (
                <div className="border border-border bg-card/30 p-6">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                    <h3 className="font-mono uppercase text-sm font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" /> Extracted Text
                    </h3>
                    {profile.cvUpdatedAt && (
                      <span className="text-xs text-muted-foreground font-mono">
                        Updated {format(new Date(profile.cvUpdatedAt), "PP")}
                      </span>
                    )}
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none font-mono whitespace-pre-wrap h-96 overflow-y-auto pr-4 text-muted-foreground/80 text-xs">
                    {profile.cvText}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="border border-border bg-card/50 p-6 sticky top-6">
                <h3 className="font-serif text-xl mb-6 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> AI Tips
                </h3>
                {!hasCV ? (
                  <div className="text-center py-8 opacity-50">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-3" />
                    <p className="font-mono text-xs uppercase">Upload a CV first</p>
                  </div>
                ) : loadingSuggestions ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full rounded-none" />
                    <Skeleton className="h-16 w-full rounded-none" />
                    <Skeleton className="h-16 w-full rounded-none" />
                  </div>
                ) : suggestions?.suggestions?.length ? (
                  <ul className="space-y-4">
                    {suggestions.suggestions.map((s, i) => (
                      <motion.li key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                        className="flex gap-3 text-sm border-b border-border/50 pb-4 last:border-0 last:pb-0">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{s}</span>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground font-mono">Your CV looks solid. Keep it updated.</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 2: PK Audit ── */}
        <TabsContent value="audit">
          {!hasCV ? (
            <div className="text-center py-20 border border-dashed border-border">
              <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
              <p className="font-serif text-xl mb-2">No CV uploaded</p>
              <p className="font-mono text-sm text-muted-foreground">Go to the "My CV" tab and upload your CV first.</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex items-start justify-between flex-wrap gap-4 border border-border bg-card/40 p-6">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1">Pakistan CV Audit</p>
                  <h2 className="font-serif text-2xl mb-2">AI checks your CV against local standards</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Identifies issues specific to Pakistani HR expectations — contact format, WhatsApp number, city, ATS keywords, and more.
                  </p>
                </div>
                <Button onClick={runAudit} disabled={auditing} className="rounded-none font-mono uppercase text-xs tracking-wider gap-2 shrink-0">
                  {auditing ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analysing…</>
                  ) : audit ? (
                    <><RefreshCw className="w-3.5 h-3.5" /> Re-analyse</>
                  ) : (
                    <><Zap className="w-3.5 h-3.5" /> Run Audit</>
                  )}
                </Button>
              </div>

              {auditing && (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-none" />)}
                </div>
              )}

              {audit && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  {/* Score + summary row */}
                  <div className="flex items-center gap-6 border border-border bg-card/40 p-6 flex-wrap">
                    <ScoreRing score={audit.score} />
                    <div className="flex-1">
                      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1">Overall Score</p>
                      <p className="font-serif text-lg mb-3">
                        {audit.score >= 70 ? "Good CV — a few tweaks needed" : audit.score >= 50 ? "Needs improvement before applying" : "Significant issues found — address before sending"}
                      </p>
                      {audit.strengths.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {audit.strengths.map((s, i) => (
                            <span key={i} className="flex items-center gap-1 font-mono text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1">
                              <Star className="w-2.5 h-2.5" /> {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {auditGeneratedAt && (
                      <p className="w-full border-t border-border/50 pt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        Last audited: {formatAuditAge(auditGeneratedAt)}
                      </p>
                    )}
                  </div>

                  {/* Issues grouped by severity */}
                  {(["high", "medium", "low"] as const).map((sev) => {
                    const group = audit.issues.filter((i) => i.severity === sev);
                    if (!group.length) return null;
                    return (
                      <div key={sev}>
                        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full inline-block ${sev === "high" ? "bg-red-400" : sev === "medium" ? "bg-yellow-400" : "bg-blue-400"}`} />
                          {sev} priority · {group.length} {group.length === 1 ? "issue" : "issues"}
                        </p>
                        <div className="space-y-2">
                          {group.map((issue, i) => <IssueCard key={i} issue={issue} index={i} />)}
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Refine for Job ── */}
        <TabsContent value="refine">
          {!hasCV ? (
            <div className="text-center py-20 border border-dashed border-border">
              <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
              <p className="font-serif text-xl mb-2">No CV uploaded</p>
              <p className="font-mono text-sm text-muted-foreground">Go to the "My CV" tab and upload your CV first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Input panel */}
              <div className="space-y-5">
                <div className="border border-border bg-card/40 p-6">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1">Refine for Job</p>
                  <h2 className="font-serif text-2xl mb-2">AI rewrites your CV for a specific role</h2>
                  <p className="text-sm text-muted-foreground">
                    Paste a job description below. The AI will rewrite your CV to highlight relevant experience and add ATS keywords — without changing any facts.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">
                      Job Title <span className="text-muted-foreground/50">(optional)</span>
                    </label>
                    <input
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior Backend Engineer"
                      className="w-full bg-card border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">
                      Job Description <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste the full job description here…"
                      rows={12}
                      className="w-full bg-card border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50 resize-none"
                    />
                  </div>
                  <Button onClick={runRefine} disabled={refining || !jobDescription.trim()} className="w-full rounded-none font-mono uppercase text-xs tracking-wider gap-2">
                    {refining ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Rewriting CV…</> : <><Sparkles className="w-3.5 h-3.5" /> Refine My CV</>}
                  </Button>
                </div>
              </div>

              {/* Output panel */}
              <div className="space-y-5">
                {refining && (
                  <div className="border border-border bg-card/40 p-6 space-y-3">
                    <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Rewriting…</p>
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-full rounded-none" />)}
                  </div>
                )}

                {refined && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    {/* Changes made */}
                    <div className="border border-border bg-card/40 p-5">
                      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">Changes Made</p>
                      <ul className="space-y-2">
                        {refined.changes.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Refined CV */}
                    <div className="border border-border bg-card/40">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Refined CV</p>
                        <Button variant="ghost" size="sm" onClick={copyRefined} className="rounded-none font-mono text-xs gap-1.5 h-7">
                          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                        </Button>
                      </div>
                      <div className="p-4 font-mono text-xs text-muted-foreground/80 whitespace-pre-wrap max-h-[480px] overflow-y-auto leading-relaxed">
                        {refined.refinedCv}
                      </div>
                    </div>
                  </motion.div>
                )}

                {!refining && !refined && (
                  <div className="border border-dashed border-border flex flex-col items-center justify-center py-20 text-center">
                    <Sparkles className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Refined CV will appear here</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
