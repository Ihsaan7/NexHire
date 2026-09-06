import { useState } from "react";
import { useListSavedJobs, useUpdateSavedJob, useDeleteSavedJob, getListSavedJobsQueryKey } from "@workspace/api-client-react";
import type { SavedJobStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Building2, Calendar, MoreHorizontal, Trash2, StickyNote, X, Check } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";

const COLUMNS: { id: SavedJobStatus; label: string; color: string }[] = [
  { id: "saved", label: "Saved", color: "bg-zinc-500" },
  { id: "applied", label: "Applied", color: "bg-blue-500" },
  { id: "interview", label: "Interview", color: "bg-amber-500" },
  { id: "offer", label: "Offer", color: "bg-green-500" },
  { id: "rejected", label: "Rejected", color: "bg-destructive" },
];

function TrackerCard({ savedJob }: { savedJob: any }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(savedJob.notes ?? "");
  const updateStatus = useUpdateSavedJob();
  const deleteJob = useDeleteSavedJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListSavedJobsQueryKey() });

  const handleUpdateStatus = (status: SavedJobStatus) => {
    updateStatus.mutate({ id: savedJob.id, data: { status } }, {
      onSuccess: invalidate,
      onError: (error) => toast({
        title: "Could not update status",
        description: getApiErrorMessage(error, "Try again."),
        variant: "destructive",
      }),
    });
  };

  const handleSaveNotes = () => {
    updateStatus.mutate({ id: savedJob.id, data: { notes: notesValue } }, {
      onSuccess: () => {
        setEditingNotes(false);
        invalidate();
        toast({ title: "Notes saved" });
      },
      onError: (error) => toast({
        title: "Could not save notes",
        description: getApiErrorMessage(error, "Try again."),
        variant: "destructive",
      }),
    });
  };

  const handleDelete = () => {
    deleteJob.mutate({ id: savedJob.id }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Removed from tracker" });
      },
      onError: (error) => toast({
        title: "Could not remove job",
        description: getApiErrorMessage(error, "Try again."),
        variant: "destructive",
      }),
    });
  };

  return (
    <Card
      data-testid={`card-tracker-${savedJob.id}`}
      className="rounded-none border-border bg-background hover:border-primary/50 transition-colors"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-start gap-2">
          <Link href={`/jobs/${savedJob.jobId}`}>
            <h4 className="font-serif text-sm hover:text-primary cursor-pointer leading-tight">
              {savedJob.job?.title || "Unknown Role"}
            </h4>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-transparent -mr-2 -mt-2 flex-shrink-0"
                data-testid={`button-tracker-menu-${savedJob.id}`}
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-none font-mono text-xs">
              <DropdownMenuLabel>Move to...</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.filter((c) => c.id !== savedJob.status).map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => handleUpdateStatus(c.id)}
                  data-testid={`item-status-${c.id}`}
                >
                  {c.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDelete}
                data-testid={`item-delete-${savedJob.id}`}
              >
                <Trash2 className="w-3 h-3 mr-2" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="text-xs font-mono text-muted-foreground space-y-1">
          <div className="flex items-center gap-1">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{savedJob.job?.company || "Confidential"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span>
              {formatDistanceToNow(new Date(savedJob.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Notes section */}
        {editingNotes ? (
          <div className="space-y-2">
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Add notes..."
              className="text-xs font-mono rounded-none resize-none h-20 bg-background border-border"
              data-testid={`textarea-notes-${savedJob.id}`}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-6 px-3 rounded-none font-mono text-xs"
                onClick={handleSaveNotes}
                disabled={updateStatus.isPending}
                data-testid={`button-save-notes-${savedJob.id}`}
              >
                <Check className="w-3 h-3 mr-1" /> Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-3 rounded-none font-mono text-xs"
                onClick={() => {
                  setEditingNotes(false);
                  setNotesValue(savedJob.notes ?? "");
                }}
              >
                <X className="w-3 h-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            className="text-left w-full"
            onClick={() => setEditingNotes(true)}
            data-testid={`button-edit-notes-${savedJob.id}`}
          >
            {savedJob.notes ? (
              <p className="text-xs text-muted-foreground font-mono border-l-2 border-primary/30 pl-2 py-0.5 hover:border-primary transition-colors line-clamp-2">
                {savedJob.notes}
              </p>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/50 font-mono hover:text-muted-foreground transition-colors">
                <StickyNote className="w-3 h-3" /> Add notes
              </span>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export default function Tracker() {
  const { data: savedJobs, isLoading } = useListSavedJobs();

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-64 w-full bg-muted rounded-none" />
      </div>
    );
  }

  const jobsByStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = (savedJobs || []).filter((j: any) => j.status === col.id);
      return acc;
    },
    {} as Record<SavedJobStatus, any[]>,
  );

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="mb-8 flex-shrink-0">
        <h1 className="text-3xl md:text-4xl font-serif tracking-tight mb-2">
          Application Tracker
        </h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          Pipeline Management — {savedJobs?.length || 0} total
        </p>
      </header>

      {(!savedJobs || savedJobs.length === 0) && (
        <div className="flex-1 border border-dashed border-border flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="font-mono text-sm text-muted-foreground">Your tracker is empty.</p>
            <Link href="/jobs">
              <Button variant="outline" className="rounded-none font-mono text-xs uppercase mt-2">
                Browse Jobs
              </Button>
            </Link>
          </div>
        </div>
      )}

      {savedJobs && savedJobs.length > 0 && (
        <div className="flex-1 flex gap-6 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="w-72 flex-shrink-0 flex flex-col bg-card/20 border border-border"
              data-testid={`column-${col.id}`}
            >
              <div className="p-3 border-b border-border flex justify-between items-center bg-card/50">
                <h3 className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.color}`} />
                  {col.label}
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {jobsByStatus[col.id]?.length || 0}
                </span>
              </div>

              <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {jobsByStatus[col.id]?.map((savedJob) => (
                  <TrackerCard key={savedJob.id} savedJob={savedJob} />
                ))}
                {jobsByStatus[col.id]?.length === 0 && (
                  <div className="h-20 border border-dashed border-border flex items-center justify-center text-muted-foreground/40 font-mono text-xs uppercase">
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
