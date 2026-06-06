import { Job } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AnimatedScore } from "./animated-score";

export function JobCard({ job, matchScore }: { job: Job; matchScore?: number | null }) {
  const displayScore = matchScore ?? job.matchScore;
  const isUrgent = job.deadline && new Date(job.deadline).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;

  return (
    <Link href={`/jobs/${job.id}`}>
      <Card className="rounded-none border-border bg-card/40 hover:bg-card hover:border-primary/50 transition-all cursor-pointer group h-full flex flex-col relative overflow-hidden">
        {isUrgent && (
          <div className="absolute top-0 right-0 bg-destructive text-destructive-foreground font-mono text-[10px] uppercase px-2 py-0.5">
            Closing Soon
          </div>
        )}
        <CardContent className="p-5 flex-1 flex flex-col">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h3 className="text-xl font-serif leading-tight group-hover:text-primary transition-colors">{job.title}</h3>
              <div className="flex items-center gap-2 mt-2 text-muted-foreground font-mono text-xs">
                <Building2 className="w-3 h-3" />
                <span className="truncate">{job.company || 'Confidential'}</span>
              </div>
            </div>
            {displayScore !== undefined && displayScore !== null && (
              <div className="shrink-0 flex flex-col items-center">
                <AnimatedScore score={displayScore} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {job.sector && (
              <Badge variant="secondary" className="rounded-none font-mono text-[10px] uppercase">
                {job.sector.replace('private-', '')}
              </Badge>
            )}
            {job.experienceLevel && (
              <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase">
                {job.experienceLevel}
              </Badge>
            )}
          </div>

          <div className="mt-auto pt-4 flex items-center justify-between text-xs font-mono text-muted-foreground border-t border-border/50">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location || 'Remote'}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {job.postedDate ? formatDistanceToNow(new Date(job.postedDate), { addSuffix: true }) : 'Recently'}</span>
            </div>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}