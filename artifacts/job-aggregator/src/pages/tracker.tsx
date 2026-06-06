import { useListSavedJobs, useUpdateSavedJob, SavedJobStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Building2, Calendar, MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

const COLUMNS: { id: SavedJobStatus; label: string; color: string }[] = [
  { id: 'saved', label: 'Saved', color: 'bg-zinc-500' },
  { id: 'applied', label: 'Applied', color: 'bg-blue-500' },
  { id: 'interview', label: 'Interview', color: 'bg-amber-500' },
  { id: 'offer', label: 'Offer', color: 'bg-green-500' },
  { id: 'rejected', label: 'Rejected', color: 'bg-destructive' },
];

export default function Tracker() {
  const { data: savedJobs, isLoading } = useListSavedJobs();
  const updateStatus = useUpdateSavedJob();
  const queryClient = useQueryClient();

  const handleUpdateStatus = (id: string, status: SavedJobStatus) => {
    updateStatus.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/jobs/saved'] as any });
      }
    });
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-64 w-full bg-muted rounded-none" /></div>;
  }

  const jobsByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = (savedJobs || []).filter((j: any) => j.status === col.id);
    return acc;
  }, {} as Record<SavedJobStatus, any[]>);

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="mb-8 flex-shrink-0">
        <h1 className="text-3xl md:text-4xl font-serif tracking-tight mb-2">Application Tracker</h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          Pipeline Management
        </p>
      </header>

      <div className="flex-1 flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
        {COLUMNS.map(col => (
          <div key={col.id} className="w-80 flex-shrink-0 flex flex-col bg-card/20 border border-border">
            <div className="p-3 border-b border-border flex justify-between items-center bg-card/50">
              <h3 className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.color}`} />
                {col.label}
              </h3>
              <span className="font-mono text-xs text-muted-foreground">{jobsByStatus[col.id]?.length || 0}</span>
            </div>
            
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {jobsByStatus[col.id]?.map(savedJob => (
                <Card key={savedJob.id} className="rounded-none border-border bg-background hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <Link href={`/jobs/${savedJob.jobId}`}>
                        <h4 className="font-serif text-sm hover:text-primary cursor-pointer leading-tight">
                          {savedJob.job?.title || 'Unknown Role'}
                        </h4>
                      </Link>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-transparent -mr-2 -mt-2">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-none font-mono text-xs">
                          <DropdownMenuLabel>Move to...</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {COLUMNS.filter(c => c.id !== col.id).map(c => (
                            <DropdownMenuItem 
                              key={c.id} 
                              onClick={() => handleUpdateStatus(savedJob.id, c.id)}
                            >
                              {c.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <div className="text-xs font-mono text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        <span className="truncate">{savedJob.job?.company || 'Confidential'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Saved {formatDistanceToNow(new Date(savedJob.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {jobsByStatus[col.id]?.length === 0 && (
                <div className="h-24 border border-dashed border-border flex items-center justify-center text-muted-foreground/50 font-mono text-xs uppercase">
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}