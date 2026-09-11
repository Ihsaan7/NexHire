import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetProfile, useUpdateProfile, useUploadCv } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";
import { isOnboardingComplete } from "@/lib/onboarding";
import { Upload, ChevronRight, FileText, X } from "lucide-react";

const SECTORS = [
  "government", "private-tech", "private-banking", "private-engineering", 
  "private-healthcare", "private-education", "private-sales-marketing", 
  "private-media-creative", "private-operations-admin", "ngo-nonprofit", 
  "remote-international", "internships-fresh"
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const uploadCv = useUploadCv();

  const [experience, setExperience] = useState<string>("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOnboardingComplete(profile)) {
      setLocation("/dashboard", { replace: true });
      return;
    }

    if (profile?.preferences) {
      if (profile.preferences.experienceLevel) {
        setExperience(profile.preferences.experienceLevel);
      }
      if (profile.preferences.sectors) {
        setSelectedSectors(profile.preferences.sectors);
      }
    }
  }, [profile, setLocation]);

  const toggleSector = (sector: string) => {
    setSelectedSectors(prev => 
      prev.includes(sector) 
        ? prev.filter(s => s !== sector)
        : [...prev, sector]
    );
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx");
    if (!isPdf && !isDocx) {
      toast({ 
        title: "Invalid file type", 
        description: "Please upload a PDF or DOCX file.", 
        variant: "destructive" 
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please choose a CV smaller than 10 MB.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
  };

  const handleContinue = async () => {
    if (!experience) {
      toast({ 
        title: "Experience Required", 
        description: "Please select your experience level.", 
        variant: "destructive" 
      });
      return;
    }
    if (selectedSectors.length === 0) {
      toast({ 
        title: "Sectors Required", 
        description: "Please select at least one target sector.", 
        variant: "destructive" 
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await updateProfile.mutateAsync({
        data: {
          preferences: {
            ...(profile?.preferences || {}),
            experienceLevel: experience,
            sectors: selectedSectors,
          }
        }
      });

      if (selectedFile) {
        await uploadCv.mutateAsync({
          data: {
            file: selectedFile
          }
        });
      }

      await refetchProfile();
      toast({
        title: "NexHire Initialised",
        description: "Your preferences have been saved."
      });
      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Setup Failed",
        description: getApiErrorMessage(error, "Something went wrong during setup."),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="grid-overlay" />
        <div className="noise-overlay" />
        <div className="w-full max-w-2xl p-8 md:p-12 space-y-6 z-10 bg-card/40 border border-border backdrop-blur-sm">
          <Skeleton className="h-10 w-2/3 mx-auto rounded-none bg-muted/50" />
          <Skeleton className="h-4 w-1/2 mx-auto rounded-none bg-muted/50 mb-10" />
          <Skeleton className="h-20 w-full rounded-none bg-muted/50" />
          <Skeleton className="h-32 w-full rounded-none bg-muted/50" />
          <Skeleton className="h-40 w-full rounded-none bg-muted/50" />
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-lg border border-destructive/30 bg-card/40 p-8 text-center">
          <h1 className="font-serif text-2xl mb-2">Unable to load your profile</h1>
          <p className="font-mono text-xs text-muted-foreground mb-6">
            Your setup has not been changed. Try loading it again.
          </p>
          <Button
            variant="outline"
            className="rounded-none font-mono uppercase text-xs"
            onClick={() => void refetchProfile()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="grid-overlay" />
      <div className="noise-overlay" />
      
      <div className="w-full max-w-2xl z-10 bg-card/40 border border-border p-8 md:p-12 backdrop-blur-sm my-8">
        <header className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-serif tracking-tight mb-2">Initialize NexHire</h1>
          <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
            Configure your career parameters
          </p>
        </header>
        
        <div className="space-y-10">
          {/* Experience */}
          <section>
            <h3 className="font-mono text-sm uppercase tracking-wider mb-4 border-b border-border pb-2">
              1. Experience Level <span className="text-primary">*</span>
            </h3>
            <Select value={experience} onValueChange={setExperience}>
              <SelectTrigger className="w-full bg-background/50 rounded-none font-mono">
                <SelectValue placeholder="Select your level" />
              </SelectTrigger>
              <SelectContent className="rounded-none font-mono">
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="mid">Mid Level</SelectItem>
                <SelectItem value="senior">Senior Level</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* Sectors */}
          <section>
            <h3 className="font-mono text-sm uppercase tracking-wider mb-4 border-b border-border pb-2 flex justify-between">
              <span>2. Target Sectors <span className="text-primary">*</span></span>
              <span className="text-muted-foreground text-xs">{selectedSectors.length} selected</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map(sector => {
                const isSelected = selectedSectors.includes(sector);
                return (
                  <button
                    type="button"
                    key={sector}
                    onClick={() => toggleSector(sector)}
                    className={`px-3 py-1.5 font-mono text-xs uppercase transition-colors border ${
                      isSelected 
                        ? 'bg-primary text-primary-foreground border-primary' 
                        : 'bg-background/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {sector.replace('private-', '').replace('-', ' ')}
                  </button>
                );
              })}
            </div>
          </section>

          {/* CV Upload */}
          <section>
            <h3 className="font-mono text-sm uppercase tracking-wider mb-4 border-b border-border pb-2 flex justify-between">
              <span>3. Upload CV</span>
              <span className="text-muted-foreground text-xs">Optional</span>
            </h3>
            
            {selectedFile ? (
              <div className="border border-primary/50 bg-primary/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-mono text-sm">{selectedFile.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedFile(null)} 
                  aria-label="Remove selected CV"
                  className="p-2 hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed p-8 flex flex-col items-center justify-center text-center transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-border bg-background/50"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className={`w-8 h-8 mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-muted-foreground font-mono text-xs mb-4 max-w-sm">
                  Drag & drop your PDF or DOCX here to optionally pre-load your profile data
                </p>
                <div className="relative">
                  <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    onChange={handleFileInput} 
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                  />
                  <Button variant="outline" size="sm" className="rounded-none font-mono uppercase text-[10px] tracking-wider pointer-events-none">
                    Browse Files
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Submit */}
          <div className="pt-6">
            <Button 
              onClick={handleContinue}
              disabled={isSubmitting || profileLoading}
              className="w-full rounded-none font-mono uppercase tracking-wider py-6"
            >
              {isSubmitting ? "Initialising..." : (
                <span className="flex items-center gap-2">
                  Enter NexHire <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
