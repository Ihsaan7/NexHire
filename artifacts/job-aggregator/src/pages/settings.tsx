import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";
import { Save } from "lucide-react";

const SECTORS = [
  "government", "private-tech", "private-banking", "private-engineering", 
  "private-healthcare", "private-education", "private-sales-marketing", 
  "private-media-creative", "private-operations-admin", "ngo-nonprofit", 
  "remote-international", "internships-fresh"
];

export default function Settings() {
  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [experience, setExperience] = useState<string>("");
  const [minScore, setMinScore] = useState<number[]>([50]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  useEffect(() => {
    if (profile?.preferences) {
      setExperience(profile.preferences.experienceLevel || "");
      setMinScore([profile.preferences.minMatchScore || 50]);
      setSelectedSectors(profile.preferences.sectors || []);
    }
  }, [profile]);

  const toggleSector = (sector: string) => {
    setSelectedSectors(prev => 
      prev.includes(sector) 
        ? prev.filter(s => s !== sector)
        : [...prev, sector]
    );
  };

  const handleSave = () => {
    updateProfile.mutate({
      data: {
        preferences: {
          experienceLevel: experience || undefined,
          minMatchScore: minScore[0],
          sectors: selectedSectors
        }
      }
    }, {
      onSuccess: () => {
        toast({ title: "Preferences saved", description: "Your terminal has been updated." });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: getApiErrorMessage(error, "Failed to save preferences."),
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-64 max-w-2xl bg-muted rounded-none" /></div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto h-full overflow-y-auto">
      <header className="mb-10">
        <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-2">Terminal Settings</h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          Configure Match Engine
        </p>
      </header>

      <div className="space-y-10">
        {/* Sectors */}
        <section>
          <h3 className="font-mono text-sm uppercase tracking-wider mb-4 border-b border-border pb-2">Target Sectors</h3>
          <div className="flex flex-wrap gap-3">
            {SECTORS.map(sector => {
              const isSelected = selectedSectors.includes(sector);
              return (
                <button
                  key={sector}
                  onClick={() => toggleSector(sector)}
                  className={`px-4 py-2 font-mono text-xs uppercase transition-colors border ${
                    isSelected 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : 'bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {sector.replace('private-', '').replace('-', ' ')}
                </button>
              );
            })}
          </div>
        </section>

        {/* Experience */}
        <section>
          <h3 className="font-mono text-sm uppercase tracking-wider mb-4 border-b border-border pb-2">Experience Level</h3>
          <Select value={experience} onValueChange={setExperience}>
            <SelectTrigger className="w-full md:w-72 rounded-none font-mono">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent className="rounded-none font-mono">
              <SelectItem value="entry">Entry Level</SelectItem>
              <SelectItem value="mid">Mid Level</SelectItem>
              <SelectItem value="senior">Senior Level</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
            </SelectContent>
          </Select>
        </section>

        {/* Min Score */}
        <section>
          <h3 className="font-mono text-sm uppercase tracking-wider mb-4 border-b border-border pb-2 flex justify-between">
            <span>Minimum Match Threshold</span>
            <span className="text-primary">{minScore[0]}%</span>
          </h3>
          <div className="w-full md:w-96 pt-4">
            <Slider
              value={minScore}
              onValueChange={setMinScore}
              max={100}
              min={0}
              step={5}
              className="[&_[role=slider]]:rounded-none [&_[role=slider]]:border-primary [&_[role=slider]]:bg-primary"
            />
            <p className="text-xs text-muted-foreground font-mono mt-4">
              Jobs with an AI match score below this threshold will be filtered out of your strict match results.
            </p>
          </div>
        </section>

        <div className="pt-8">
          <Button 
            onClick={handleSave} 
            disabled={updateProfile.isPending}
            className="rounded-none font-mono uppercase tracking-wider px-8"
          >
            {updateProfile.isPending ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Configuration</>}
          </Button>
        </div>
      </div>
    </div>
  );
}