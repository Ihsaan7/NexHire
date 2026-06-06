import { useState } from "react";
import { useListJobs, Job } from "@workspace/api-client-react";
import { JobCard } from "@/components/job-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";

const SECTORS = [
  "government", "private-tech", "private-banking", "private-engineering", 
  "private-healthcare", "private-education", "private-sales-marketing", 
  "private-media-creative", "private-operations-admin", "ngo-nonprofit", 
  "remote-international", "internships-fresh"
];

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState<string>("");
  const [experienceLevel, setExperienceLevel] = useState<string>("");

  const { data, isLoading } = useListJobs({
    search: search || undefined,
    sector: sector || undefined,
    experienceLevel: experienceLevel || undefined,
  });

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Filters Sidebar */}
      <div className="w-full md:w-64 border-r border-border bg-card/30 p-6 flex-shrink-0 sticky top-0 overflow-y-auto">
        <div className="flex items-center gap-2 mb-6">
          <SlidersHorizontal className="w-4 h-4" />
          <h2 className="font-serif text-lg">Filters</h2>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Job title, keywords..." 
                className="pl-9 rounded-none font-mono text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-muted-foreground">Sector</label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="rounded-none font-mono text-sm">
                <SelectValue placeholder="All Sectors" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value=" ">All Sectors</SelectItem>
                {SECTORS.map(s => (
                  <SelectItem key={s} value={s}>{s.replace('private-', '').replace('-', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-muted-foreground">Experience</label>
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger className="rounded-none font-mono text-sm">
                <SelectValue placeholder="Any Experience" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value=" ">Any Experience</SelectItem>
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="mid">Mid Level</SelectItem>
                <SelectItem value="senior">Senior Level</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(search || sector || experienceLevel) && (
            <Button 
              variant="outline" 
              className="w-full rounded-none font-mono text-xs uppercase"
              onClick={() => {
                setSearch("");
                setSector("");
                setExperienceLevel("");
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-serif">Open Positions</h1>
            <p className="text-muted-foreground font-mono text-xs uppercase mt-2">
              {isLoading ? "Scanning terminal..." : `${data?.total || 0} results found`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-none bg-muted" />
            ))}
          </div>
        ) : data?.jobs?.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-border bg-card/20">
            <p className="text-muted-foreground font-mono text-sm">No jobs match your current filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data?.jobs?.map((job, i) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <JobCard job={job} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}