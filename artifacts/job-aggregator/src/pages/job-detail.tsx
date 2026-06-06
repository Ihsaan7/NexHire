import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetJob, getGetJobQueryKey, 
  useAnalyzeJobMatch, getAnalyzeJobMatchQueryKey,
  useSaveJob, useListSavedJobs, useDeleteSavedJob
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, MapPin, Clock, BriefcaseIcon, DollarSign, BookmarkPlus, CheckCircle2, ChevronRight, Zap, BookmarkMinus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AnimatedScore } from "@/components/animated-score";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function JobDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: job, isLoading: loadingJob } = useGetJob(id!, {
    query: { enabled: !!id, queryKey: getGetJobQueryKey(id!) }
  });

  const [analyzeMatch, setAnalyzeMatch] = useState(false);
  const { data: matchAnalysis, isLoading: loadingAnalysis } = useAnalyzeJobMatch(id!, {
    query: { enabled: !!id && analyzeMatch, queryKey: getAnalyzeJobMatchQueryKey(id!) }
  });

  const { data: savedJobs } = useListSavedJobs();
  const saveJobMutation = useSaveJob();
  const deleteSavedJobMutation = useDeleteSavedJob();

  const savedJobRecord = useMemo(() => {
    return savedJobs?.find((sj) => sj.jobId === id);
  }, [savedJobs, id]);

  const isSaved = !!savedJobRecord;

  const handleToggleSave = () => {
    if (isSaved) {
      deleteSavedJobMutation.mutate({ id: savedJobRecord.id }, {
        onSuccess: () => {
          toast({ title: "Removed from tracker", description: "Job removed successfully." });
          queryClient.invalidateQueries({ queryKey: ['/api/jobs/saved'] as any });
        }
      });
    } else {
      saveJobMutation.mutate({ data: { jobId: id!, status: 'saved' } }, {
        onSuccess: () => {
          toast({ title: "Saved to tracker", description: "Job added to your pipeline." });
          queryClient.invalidateQueries({ queryKey: ['/api/jobs/saved'] as any });
        }
      });
    }
  };

  if (loadingJob) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <Skeleton className="h-8 w-24 bg-muted rounded-none" />
        <Skeleton className="h-16 w-3/4 bg-muted rounded-none" />
        <div className="flex gap-4">
          <Skeleton className="h-8 w-32 bg-muted rounded-none" />
          <Skeleton className="h-8 w-32 bg-muted rounded-none" />
        </div>
        <Skeleton className="h-64 w-full bg-muted rounded-none" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8 text-center font-mono">
        Job not found. <Link href="/jobs" className="text-primary underline">Return to jobs</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 border-r border-border">
        <div className="max-w-3xl mx-auto">
          <Link href="/jobs">
            <Button variant="ghost" className="mb-6 font-mono text-xs uppercase tracking-wider pl-0 hover:bg-transparent hover:text-primary">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Terminal
            </Button>
          </Link>

          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-serif leading-tight mb-4">{job.title}</h1>
            <div className="flex flex-wrap items-center gap-6 text-sm font-mono text-muted-foreground">
              <span className="flex items-center gap-2"><Building2 className="w-4 h-4" /> {job.company || 'Confidential'}</span>
              <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {job.location || 'Remote'}</span>
              <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> {job.postedDate ? formatDistanceToNow(new Date(job.postedDate), { addSuffix: true }) : 'Recently'}</span>
              {job.jobType && <span className="flex items-center gap-2"><BriefcaseIcon className="w-4 h-4" /> {job.jobType}</span>}
              {job.salaryRange && <span className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> {job.salaryRange}</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 py-6 border-y border-border mb-8">
            <Button className="rounded-none font-mono uppercase text-sm tracking-wider px-8" asChild>
              <a href={job.applyUrl || "#"} target="_blank" rel="noreferrer">
                Open Application <ChevronRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
            <Button 
              variant="outline" 
              className={`rounded-none font-mono uppercase text-sm tracking-wider px-6 transition-colors ${isSaved ? 'bg-primary/10 border-primary text-primary' : ''}`}
              onClick={handleToggleSave}
              disabled={saveJobMutation.isPending || deleteSavedJobMutation.isPending}
            >
              {isSaved ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <BookmarkPlus className="w-4 h-4 mr-2" />}
              {isSaved ? 'Saved to Tracker' : 'Save Job'}
            </Button>
            
            {!analyzeMatch && (
              <Button 
                variant="secondary" 
                className="rounded-none font-mono uppercase text-sm tracking-wider ml-auto border border-border"
                onClick={() => setAnalyzeMatch(true)}
              >
                <Zap className="w-4 h-4 mr-2 text-primary" /> Run AI Match
              </Button>
            )}
          </div>

          <div className="prose prose-invert prose-p:font-sans prose-headings:font-serif max-w-none">
            {job.description ? (
              <div dangerouslySetInnerHTML={{__html: job.description}} />
            ) : (
              <p>No description provided.</p>
            )}

            {job.requirements && (
              <>
                <h3 className="text-2xl font-serif mt-8 mb-4">Requirements</h3>
                <div dangerouslySetInnerHTML={{__html: job.requirements}} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar - AI Analysis */}
      <AnimatePresence>
        {analyzeMatch && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "350px", opacity: 1 }}
            className="w-full md:w-[350px] bg-card/30 border-l border-border p-6 flex-shrink-0 overflow-y-auto hidden md:block"
          >
            <div className="sticky top-0">
              <h3 className="font-serif text-xl mb-6 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Intelligence Brief
              </h3>

              {loadingAnalysis ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-16 h-16 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : matchAnalysis ? (
                <div className="space-y-8">
                  <div className="flex items-center gap-4 border border-border p-4 bg-background">
                    <AnimatedScore score={matchAnalysis.matchScore} />
                    <div>
                      <div className="font-serif text-lg">Match Score</div>
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">Based on your CV</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-mono text-xs uppercase text-green-500 mb-3">Key Strengths</h4>
                    <ul className="space-y-2">
                      {matchAnalysis.strengths?.map((s, i) => (
                        <li key={i} className="text-sm border-l-2 border-green-500 pl-3 py-1 bg-green-500/5">{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-mono text-xs uppercase text-destructive mb-3">Identified Gaps</h4>
                    <ul className="space-y-2">
                      {matchAnalysis.gaps?.map((g, i) => (
                        <li key={i} className="text-sm border-l-2 border-destructive pl-3 py-1 bg-destructive/5">{g}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-mono text-xs uppercase text-primary mb-3">Tactical Advice</h4>
                    <ul className="space-y-2">
                      {matchAnalysis.suggestions?.map((s, i) => (
                        <li key={i} className="text-sm border-l-2 border-primary pl-3 py-1 bg-primary/5">{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground font-mono">Analysis failed. Ensure your CV is uploaded.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}