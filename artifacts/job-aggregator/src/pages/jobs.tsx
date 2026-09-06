import { useState } from "react";
import { useListJobs, useGetProfile, type ListJobsPostedWithin } from "@workspace/api-client-react";
import { JobCard } from "@/components/job-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Search, SlidersHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";

const SECTORS = [
  { id: "government", label: "Government" },
  { id: "private-tech", label: "Technology" },
  { id: "private-banking", label: "Banking & Finance" },
  { id: "private-engineering", label: "Engineering" },
  { id: "private-healthcare", label: "Healthcare" },
  { id: "private-education", label: "Education" },
  { id: "private-sales-marketing", label: "Sales & Marketing" },
  { id: "private-media-creative", label: "Media & Creative" },
  { id: "private-operations-admin", label: "Operations & Admin" },
  { id: "ngo-nonprofit", label: "NGO / Non-profit" },
  { id: "remote-international", label: "Remote / International" },
  { id: "internships-fresh", label: "Internships / Fresh" },
];

const CATEGORIES: Record<string, string[]> = {
  "government": [
    "Government / Public Sector",
    "Government — Administration",
    "Government — IT & Tech",
    "Government — Finance",
    "Government — Engineering",
  ],
  "private-tech": [
    "Software Development",
    "Data & AI",
    "DevOps & Cloud",
    "IT & Networking",
    "Design & UX",
    "Product Management",
  ],
  "private-banking": [
    "Finance & Banking",
  ],
  "private-engineering": [
    "Engineering",
    "Construction & Architecture",
  ],
  "private-healthcare": [
    "Healthcare & Medical",
  ],
  "private-education": [
    "Education & Teaching",
  ],
  "private-sales-marketing": [
    "Marketing & Digital",
    "Sales & Business Dev",
    "Writing & Content",
  ],
  "private-media-creative": [
    "Writing & Content",
  ],
  "private-operations-admin": [
    "HR & Recruitment",
    "Customer Support / BPO",
    "Logistics & Supply Chain",
    "Project Management",
    "Legal & Compliance",
  ],
  "ngo-nonprofit": [],
  "remote-international": [
    "Software Development",
    "Data & AI",
    "Marketing & Digital",
    "Writing & Content",
  ],
  "internships-fresh": [],
};

const LOCATIONS = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Remote",
];

const JOB_TYPES = [
  { id: "full-time", label: "Full-time" },
  { id: "part-time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
];

const POSTED_WITHIN_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

const EXPERIENCE_LEVELS = [
  { id: "fresh", label: "Fresh" },
  { id: "1-3", label: "1–3 Years" },
  { id: "3-5", label: "3–5 Years" },
  { id: "5+", label: "5+ Years" },
  { id: "senior", label: "Senior" },
];

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [location, setLocation] = useState<string>("all");
  const [jobType, setJobType] = useState<string>("all");
  const [experienceLevel, setExperienceLevel] = useState<string>("all");
  const [postedWithin, setPostedWithin] = useState<ListJobsPostedWithin | "all">("all");
  const [minMatchScore, setMinMatchScore] = useState<number>(0);

  const activeSector = sector === "all" ? "" : sector;
  const categoryOptions = activeSector && CATEGORIES[activeSector] ? CATEGORIES[activeSector] : [];

  const { data: profile } = useGetProfile();
  const hasCV = !!profile?.cvText;

  const { data, isLoading } = useListJobs({
    search: search || undefined,
    sector: activeSector || undefined,
    category: category !== "all" ? category : undefined,
    location: location !== "all" ? location : undefined,
    jobType: jobType !== "all" ? jobType : undefined,
    experienceLevel: experienceLevel !== "all" ? experienceLevel : undefined,
    postedWithin: postedWithin !== "all" ? postedWithin : undefined,
    minMatchScore: minMatchScore > 0 ? minMatchScore : undefined,
  });

  const hasFilters =
    !!search ||
    sector !== "all" ||
    category !== "all" ||
    location !== "all" ||
    jobType !== "all" ||
    experienceLevel !== "all" ||
    postedWithin !== "all" ||
    minMatchScore > 0;

  const clearFilters = () => {
    setSearch("");
    setSector("all");
    setCategory("all");
    setLocation("all");
    setJobType("all");
    setExperienceLevel("all");
    setPostedWithin("all");
    setMinMatchScore(0);
  };

  const handleSectorChange = (val: string) => {
    setSector(val);
    setCategory("all");
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Filters Sidebar */}
      <div className="w-full md:w-64 border-r border-border bg-card/30 p-5 flex-shrink-0 md:sticky md:top-0 md:overflow-y-auto md:h-full">
        <div className="flex items-center gap-2 mb-5">
          <SlidersHorizontal className="w-4 h-4" />
          <h2 className="font-serif text-lg">Filters</h2>
        </div>

        <div className="space-y-5">
          {/* Search */}
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Title, keywords..."
                className="pl-9 rounded-none font-mono text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>

          {/* Sector */}
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">
              Sector
            </label>
            <Select value={sector} onValueChange={handleSectorChange}>
              <SelectTrigger
                className="rounded-none font-mono text-xs"
                data-testid="select-sector"
              >
                <SelectValue placeholder="All Sectors" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">All Sectors</SelectItem>
                {SECTORS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category — shows only when a sector is selected */}
          {categoryOptions.length > 0 && (
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground">
                Category
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger
                  className="rounded-none font-mono text-xs"
                  data-testid="select-category"
                >
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Location */}
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">
              Location
            </label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger
                className="rounded-none font-mono text-xs"
                data-testid="select-location"
              >
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">All Locations</SelectItem>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Type */}
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">
              Job Type
            </label>
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger
                className="rounded-none font-mono text-xs"
                data-testid="select-job-type"
              >
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">All Types</SelectItem>
                {JOB_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Experience Level */}
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">
              Experience
            </label>
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger
                className="rounded-none font-mono text-xs"
                data-testid="select-experience"
              >
                <SelectValue placeholder="Any Level" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">Any Level</SelectItem>
                {EXPERIENCE_LEVELS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Posted Within */}
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">
              Posted Within
            </label>
            <Select
              value={postedWithin}
              onValueChange={(value) => setPostedWithin(value as ListJobsPostedWithin | "all")}
            >
              <SelectTrigger
                className="rounded-none font-mono text-xs"
                data-testid="select-posted-within"
              >
                <SelectValue placeholder="Any Time" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">Any Time</SelectItem>
                {POSTED_WITHIN_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Min Match Score (only if CV uploaded) */}
          {hasCV && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="font-mono text-xs uppercase text-muted-foreground">
                  Min Match Score
                </label>
                <span className="font-mono text-xs text-primary">
                  {minMatchScore > 0 ? `${minMatchScore}%` : "Off"}
                </span>
              </div>
              <Slider
                value={[minMatchScore]}
                onValueChange={([val]) => setMinMatchScore(val)}
                min={0}
                max={90}
                step={10}
                className="w-full"
                data-testid="slider-min-match-score"
              />
            </div>
          )}

          {hasFilters && (
            <Button
              variant="outline"
              className="w-full rounded-none font-mono text-xs uppercase"
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              Clear All Filters
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-serif">Open Positions</h1>
            <p className="text-muted-foreground font-mono text-xs uppercase mt-1">
              {isLoading
                ? "Scanning terminal..."
                : `${data?.total || 0} results`}
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
            <p className="text-muted-foreground font-mono text-sm">
              No jobs match your filters.
            </p>
            {hasFilters && (
              <Button
                variant="ghost"
                className="mt-3 font-mono text-xs uppercase"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data?.jobs?.map((job, i) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
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
