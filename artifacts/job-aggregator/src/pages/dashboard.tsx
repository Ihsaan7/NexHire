import { useGetProfile, useGetJobStats, useListJobs, useGetMatchedJobs } from "@workspace/api-client-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, ArrowRight, FileWarning, TrendingUp, FolderSearch } from "lucide-react";
import { JobCard } from "@/components/job-card";

const BROWSE_CATEGORIES = [
  { sector: "private-tech", label: "Technology", sub: "Software, AI, Cloud, QA" },
  { sector: "government", label: "Government", sub: "FPSC, NTS, Provincial" },
  { sector: "private-banking", label: "Banking & Finance", sub: "Ops, Audit, Fintech" },
  { sector: "private-engineering", label: "Engineering", sub: "Civil, Electrical, Energy" },
  { sector: "private-healthcare", label: "Healthcare", sub: "Medical, Nursing, Pharma" },
  { sector: "private-sales-marketing", label: "Sales & Marketing", sub: "Digital, BD, Content" },
  { sector: "ngo-nonprofit", label: "NGO / Non-profit", sub: "Programs, Field, Fundraising" },
  { sector: "internships-fresh", label: "Internships", sub: "Fresh grad, Trainee, Entry" },
];

export default function Dashboard() {
  const { data: profile, isLoading: loadingProfile } = useGetProfile();
  const { data: stats, isLoading: loadingStats } = useGetJobStats();
  const { data: matchedData, isLoading: loadingMatched } = useGetMatchedJobs({ limit: 4 });
  const { data: recentJobs, isLoading: loadingRecent } = useListJobs({ limit: 4 });

  const hasCV = !!profile?.cvText;

  if (loadingProfile || loadingStats || loadingMatched || loadingRecent) {
    return (
      <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-48 mb-8 bg-muted rounded-none" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 bg-muted rounded-none" />
          <Skeleton className="h-32 bg-muted rounded-none" />
          <Skeleton className="h-32 bg-muted rounded-none" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-40 bg-muted rounded-none" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-40 bg-muted rounded-none" />
            <Skeleton className="h-40 bg-muted rounded-none" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 space-y-12 max-w-7xl mx-auto pb-20">
      
      <header>
        <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-2">Dashboard</h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          NexHire Status: Online • {stats?.total || 0} Open Positions
        </p>
      </header>

      {/* Stats Bar */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-none border-border bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-xs uppercase text-muted-foreground">Total Jobs Tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-primary" /> +{stats?.recentCount || 0} this week
            </p>
          </CardContent>
        </Card>
        
        <Card className="rounded-none border-border bg-card/50 backdrop-blur md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-xs uppercase text-muted-foreground">Top Sectors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats?.bySector?.slice(0, 5).map(s => (
                <div key={s.sector} className="px-3 py-1 bg-secondary/50 border border-border flex items-center gap-2">
                  <span className="text-sm font-medium">{s.sector.replace('private-', '').replace('-', ' ')}</span>
                  <span className="font-mono text-xs text-primary">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* AI Matches */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-serif flex items-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            AI Matched Opportunities
          </h2>
          {hasCV && (
            <Link href="/jobs?matched=true">
              <Button variant="ghost" className="font-mono uppercase text-xs rounded-none">
                View all matches <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          )}
        </div>

        {!hasCV ? (
          <div className="border border-dashed border-primary/50 bg-primary/5 p-8 text-center">
            <FileWarning className="w-10 h-10 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-serif mb-2">Intelligence Requires Data</h3>
            <p className="text-muted-foreground font-mono text-sm max-w-md mx-auto mb-6">
              Upload your CV to unlock personalized AI matching, skill gap analysis, and application suggestions.
            </p>
            <Link href="/cv">
              <Button className="rounded-none uppercase font-mono text-xs tracking-wider">
                Upload CV Now
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {matchedData?.jobs?.length ? (
              matchedData.jobs.map((mj, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={mj.job.id}
                >
                  <JobCard job={mj.job} matchScore={mj.matchScore} />
                </motion.div>
              ))
            ) : (
              <p className="text-muted-foreground font-mono text-sm col-span-2 py-8 text-center border border-border">
                No strict matches found. Try relaxing your preferences or upload a newer CV.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Browse by Category */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-serif flex items-center gap-2">
            <FolderSearch className="w-5 h-5 text-primary" />
            Browse by Category
          </h2>
          <Link href="/jobs">
            <Button variant="ghost" className="font-mono uppercase text-xs rounded-none">
              All Categories <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BROWSE_CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.sector}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link href={`/jobs?sector=${cat.sector}`}>
                <div className="border border-border bg-card/50 p-4 hover:border-primary/60 hover:bg-card transition-colors cursor-pointer group">
                  <div className="font-serif text-sm mb-1 group-hover:text-primary transition-colors">
                    {cat.label}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground leading-tight">
                    {cat.sub}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Recent Jobs */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-serif">Recent Additions</h2>
          <Link href="/jobs">
            <Button variant="ghost" className="font-mono uppercase text-xs rounded-none">
              Browse All <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recentJobs?.jobs?.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </section>
      
    </div>
  );
}