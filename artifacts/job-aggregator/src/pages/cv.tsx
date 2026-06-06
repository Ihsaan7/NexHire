import { useGetProfile, useUploadCv, useGetCvSuggestions, getGetCvSuggestionsQueryKey } from "@workspace/api-client-react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function CV() {
  const { toast } = useToast();
  const { data: profile, isLoading: loadingProfile, refetch: refetchProfile } = useGetProfile();
  const { data: suggestions, isLoading: loadingSuggestions } = useGetCvSuggestions({
    query: { enabled: !!profile?.cvText, queryKey: getGetCvSuggestionsQueryKey() }
  });
  const uploadCv = useUploadCv();
  
  const [isDragging, setIsDragging] = useState(false);

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
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (file.type !== "application/pdf" && !file.type.includes("word")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or DOCX file.",
        variant: "destructive"
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    
    uploadCv.mutate({ data: formData as any }, {
      onSuccess: () => {
        toast({ title: "CV uploaded successfully", description: "Your data has been extracted." });
        refetchProfile();
      },
      onError: () => {
        toast({ title: "Upload failed", description: "Something went wrong.", variant: "destructive" });
      }
    });
  };

  if (loadingProfile) {
    return <div className="p-8"><Skeleton className="h-64 w-full bg-muted rounded-none" /></div>;
  }

  const hasCV = !!profile?.cvText;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto h-full overflow-y-auto">
      <header className="mb-10">
        <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-2">Curriculum Vitae</h1>
        <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
          Data Source • Knowledge Base
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Upload Area */}
          <div 
            className={`border-2 border-dashed p-10 flex flex-col items-center justify-center text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card/20'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uploadCv.isPending ? (
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="font-mono text-sm">Extracting text & generating embeddings...</p>
              </div>
            ) : (
              <>
                <Upload className={`w-10 h-10 mb-4 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                <h3 className="font-serif text-xl mb-2">{hasCV ? 'Update your CV' : 'Upload your CV'}</h3>
                <p className="text-muted-foreground font-mono text-sm mb-6 max-w-sm">
                  Drag and drop your PDF or DOCX here, or click to browse. This data powers all AI matching.
                </p>
                <div className="relative">
                  <Input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} accept=".pdf,.doc,.docx" />
                  <Button variant="outline" className="rounded-none font-mono uppercase text-xs tracking-wider pointer-events-none">
                    Select File
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Extracted Text View */}
          {hasCV && (
            <div className="border border-border bg-card/30 p-6">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h3 className="font-mono uppercase text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Extracted Knowledge
                </h3>
                {profile.cvUpdatedAt && (
                  <span className="text-xs text-muted-foreground font-mono">
                    Last updated: {format(new Date(profile.cvUpdatedAt), 'PP')}
                  </span>
                )}
              </div>
              <div className="prose prose-invert prose-sm max-w-none font-mono whitespace-pre-wrap h-96 overflow-y-auto pr-4 custom-scrollbar text-muted-foreground/80">
                {profile.cvText}
              </div>
            </div>
          )}
        </div>

        {/* AI Suggestions Sidebar */}
        <div className="space-y-6">
          <div className="border border-border bg-card/50 p-6 sticky top-6">
            <h3 className="font-serif text-xl mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Review
            </h3>

            {!hasCV ? (
              <div className="text-center py-8 opacity-50">
                <AlertTriangle className="w-8 h-8 mx-auto mb-3" />
                <p className="font-mono text-xs uppercase">No CV data available</p>
              </div>
            ) : loadingSuggestions ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full rounded-none" />
                <Skeleton className="h-16 w-full rounded-none" />
                <Skeleton className="h-16 w-full rounded-none" />
              </div>
            ) : suggestions?.suggestions?.length ? (
              <ul className="space-y-4">
                {suggestions.suggestions.map((suggestion, i) => (
                  <motion.li 
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-3 text-sm border-b border-border/50 pb-4 last:border-0 last:pb-0"
                  >
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{suggestion}</span>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground font-mono">Your CV looks solid. Keep it updated as you gain experience.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline Input component since we might have not exported it in cv.tsx
function Input({ className, ...props }: any) {
  return <input className={className} {...props} />;
}