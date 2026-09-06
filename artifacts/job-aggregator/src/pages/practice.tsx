import { useState, useRef, useEffect } from "react";
import {
  useStartPracticeSession,
  useSendPracticeMessage,
  type PracticeMessageInput,
  type PracticeStartInput,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  FileText, Briefcase, MessageSquare, RefreshCw, Send,
  Star, ChevronRight, RotateCcw, CheckCircle2, Trophy,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Mode = "cv" | "job" | "custom";
type ChatMessage = { role: "ai" | "user"; content: string; feedback?: string; score?: number };

const MODES = [
  {
    id: "cv" as Mode,
    icon: FileText,
    title: "Based on My CV",
    description: "AI reads your uploaded CV and crafts questions tailored to your background, skills, and experience.",
    badge: "Personalised",
  },
  {
    id: "job" as Mode,
    icon: Briefcase,
    title: "For a Specific Job",
    description: "Paste a job description and the AI focuses all questions on that role's requirements.",
    badge: "Job-targeted",
  },
  {
    id: "custom" as Mode,
    icon: MessageSquare,
    title: "Custom Topic",
    description: "Just tell the AI what role or skill you want to practice — no job description needed.",
    badge: "Flexible",
  },
];

// ── Score bar ──────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const color = score >= 8 ? "bg-green-400" : score >= 5 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${score * 10}%` }} transition={{ duration: 0.6, ease: "easeOut" }} className={`h-full ${color} rounded-full`} />
      </div>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{score}/10</span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function Practice() {
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Setup state
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [topic, setTopic] = useState("");

  // Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionContext, setSessionContext] = useState<{ mode: Mode; jobTitle?: string; jobDescription?: string; topic?: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [questionNumber, setQuestionNumber] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState("");
  const [avgScore, setAvgScore] = useState(0);

  const startPractice = useStartPracticeSession();
  const sendPractice = useSendPracticeMessage();
  const starting = startPractice.isPending;
  const submitting = sendPractice.isPending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentQuestion]);

  const startSession = async () => {
    if (!selectedMode) return;
    if (selectedMode === "job" && !jobDescription.trim()) {
      toast({ title: "Job description required", variant: "destructive" }); return;
    }
    if (selectedMode === "custom" && !topic.trim()) {
      toast({ title: "Please enter a topic", variant: "destructive" }); return;
    }

    const body: PracticeStartInput = { mode: selectedMode };
    if (selectedMode === "job") {
      body.jobTitle = jobTitle;
      body.jobDescription = jobDescription;
    }
    if (selectedMode === "custom") body.topic = topic;

    startPractice.mutate({ data: body }, {
      onSuccess: (data) => {
      setSessionContext({ mode: selectedMode, jobTitle, jobDescription, topic });
      setMessages([{ role: "ai", content: data.intro }]);
      setCurrentQuestion(data.firstQuestion);
      setQuestionNumber(1);
      setSessionActive(true);
      },
      onError: (error) => {
        toast({
          title: "Failed to start session",
          description: getApiErrorMessage(error, "Try again."),
          variant: "destructive",
        });
      },
    });
  };

  const submitAnswer = async () => {
    if (!userAnswer.trim() || !sessionContext) return;
    const answer = userAnswer.trim();
    setUserAnswer("");
    // Add user answer to messages
    const updatedMessages: ChatMessage[] = [
      ...messages,
      { role: "ai", content: currentQuestion },
      { role: "user", content: answer },
    ];
    setMessages(updatedMessages);
    setCurrentQuestion("");

    const body: PracticeMessageInput = {
      mode: sessionContext.mode,
      jobTitle: sessionContext.jobTitle,
      jobDescription: sessionContext.jobDescription,
      topic: sessionContext.topic,
      history: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
      answer,
      questionNumber,
    };

      // Add feedback to the last user message
    sendPractice.mutate({ data: body }, {
      onSuccess: (data) => {
      const withFeedback: ChatMessage[] = updatedMessages.map((m, i) =>
        i === updatedMessages.length - 1 ? { ...m, feedback: data.feedback, score: data.score } : m
      );

      if (data.isComplete) {
        setMessages(withFeedback);
        setIsComplete(true);
        setSummary(data.summary || "");
        const scores = withFeedback.filter((m) => m.role === "user" && m.score !== undefined).map((m) => m.score!);
        setAvgScore(scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0);
      } else {
        setMessages(withFeedback);
        setCurrentQuestion(data.nextQuestion || "");
        setQuestionNumber(data.questionNumber);
      }
      },
      onError: (error) => {
        toast({
          title: "Error getting response",
          description: getApiErrorMessage(error, "Try again."),
          variant: "destructive",
        });
      },
    });
  };

  const resetSession = () => {
    setSessionActive(false);
    setMessages([]);
    setCurrentQuestion("");
    setQuestionNumber(0);
    setUserAnswer("");
    setIsComplete(false);
    setSummary("");
    setAvgScore(0);
    setSessionContext(null);
  };

  // ── Mode selection screen ──────────────────────────────────────────────────
  if (!sessionActive) {
    return (
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <header className="mb-10">
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-2">Interview Practice</h1>
          <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
            Mock interviews · Skill tests · AI-powered feedback
          </p>
        </header>

        {/* Mode cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const isSelected = selectedMode === mode.id;
            return (
              <motion.button
                key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                whileTap={{ scale: 0.98 }}
                className={`text-left border p-6 transition-all cursor-pointer ${isSelected ? "border-primary bg-primary/10" : "border-border bg-card/40 hover:border-muted-foreground/50"}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2 border ${isSelected ? "border-primary/50 bg-primary/20" : "border-border bg-secondary"}`}>
                    <Icon className={`w-5 h-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${isSelected ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                    {mode.badge}
                  </span>
                </div>
                <h3 className="font-serif text-lg mb-2">{mode.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{mode.description}</p>
                {isSelected && (
                  <div className="mt-4 flex items-center gap-1 font-mono text-xs text-primary">
                    Selected <ChevronRight className="w-3 h-3" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Mode-specific inputs */}
        <AnimatePresence mode="wait">
          {selectedMode && (
            <motion.div
              key={selectedMode}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="border border-border bg-card/40 p-6 space-y-4"
            >
              {selectedMode === "cv" && (
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">Setup</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    The AI will read your uploaded CV and generate 5 tailored interview questions covering your background, skills, and experience. Make sure you've uploaded your CV first.
                  </p>
                </div>
              )}

              {selectedMode === "job" && (
                <div className="space-y-3">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Job Details</p>
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Job title (e.g. Senior React Developer)"
                    className="w-full bg-background border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50"
                  />
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the job description here — the more detail, the better the questions…"
                    rows={6}
                    className="w-full bg-background border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50 resize-none"
                  />
                </div>
              )}

              {selectedMode === "custom" && (
                <div className="space-y-3">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">What do you want to practice?</p>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Backend engineering at a fintech startup, or Python data analysis, or product management…"
                    className="w-full bg-background border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50"
                  />
                </div>
              )}

              <Button onClick={startSession} disabled={starting} className="rounded-none font-mono uppercase text-xs tracking-wider gap-2 mt-2">
                {starting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Preparing session…</> : <>Start Practice <ChevronRight className="w-3.5 h-3.5" /></>}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Session complete screen ─────────────────────────────────────────────────
  if (isComplete) {
    const scoreColor = avgScore >= 7 ? "text-green-400" : avgScore >= 5 ? "text-yellow-400" : "text-red-400";
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="border border-border bg-card/40 p-8 text-center">
            <Trophy className={`w-12 h-12 mx-auto mb-4 ${scoreColor}`} />
            <h2 className="font-serif text-3xl mb-2">Session Complete</h2>
            <p className="text-muted-foreground font-mono text-sm mb-4">5 questions answered</p>
            <div className={`font-mono text-5xl font-bold mb-1 ${scoreColor}`}>{avgScore}</div>
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Average score /10</p>
          </div>

          <div className="border border-border bg-card/40 p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">AI Summary</p>
            <p className="text-sm leading-relaxed">{summary}</p>
          </div>

          {/* Q&A recap */}
          <div className="border border-border bg-card/40 p-6 space-y-4">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1">Session Recap</p>
            {messages.filter((m) => m.role === "user").map((m, i) => (
              <div key={i} className="border-b border-border/50 pb-4 last:border-0 last:pb-0">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Q{i + 1}</p>
                <p className="text-sm mb-2 text-foreground/80">{m.content}</p>
                {m.feedback && <p className="text-xs text-muted-foreground italic">{m.feedback}</p>}
                {m.score !== undefined && <ScoreBar score={m.score} />}
              </div>
            ))}
          </div>

          <Button onClick={resetSession} variant="outline" className="w-full rounded-none font-mono uppercase text-xs tracking-wider gap-2">
            <RotateCcw className="w-3.5 h-3.5" /> Start Another Session
          </Button>
        </motion.div>
      </div>
    );
  }

  // ── Active interview chat ──────────────────────────────────────────────────
  const scores = messages.filter((m) => m.score !== undefined).map((m) => m.score!);
  const runningAvg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex-none border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Mock Interview</p>
          <p className="font-serif text-lg">
            {sessionContext?.mode === "cv" && "Based on your CV"}
            {sessionContext?.mode === "job" && (sessionContext.jobTitle || "Job-specific")}
            {sessionContext?.mode === "custom" && sessionContext.topic}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-mono text-xs text-muted-foreground uppercase">Q</div>
            <div className="font-mono text-lg font-bold">{questionNumber}/5</div>
          </div>
          {runningAvg && (
            <div className="text-center">
              <div className="font-mono text-xs text-muted-foreground uppercase">Avg</div>
              <div className="font-mono text-lg font-bold">{runningAvg}</div>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={resetSession} className="rounded-none font-mono text-xs gap-1">
            <RotateCcw className="w-3 h-3" /> Exit
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            {msg.role === "ai" ? (
              <div className="flex gap-3 max-w-[88%]">
                <div className="w-7 h-7 shrink-0 flex items-center justify-center bg-primary/20 border border-primary/30 font-mono text-[10px] text-primary font-bold mt-0.5">AI</div>
                <div className="border border-border bg-card/60 px-4 py-3 text-sm leading-relaxed">{msg.content}</div>
              </div>
            ) : (
              <div className="flex gap-3 justify-end">
                <div className="max-w-[88%] space-y-2">
                  <div className="bg-primary/15 border border-primary/25 px-4 py-3 text-sm leading-relaxed">{msg.content}</div>
                  {msg.feedback && (
                    <div className="border border-border bg-card/40 px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Feedback</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{msg.feedback}</p>
                      {msg.score !== undefined && <ScoreBar score={msg.score} />}
                    </div>
                  )}
                </div>
                <div className="w-7 h-7 shrink-0 flex items-center justify-center bg-secondary border border-border font-mono text-[10px] font-bold mt-0.5">ME</div>
              </div>
            )}
          </motion.div>
        ))}

        {/* Current question */}
        {currentQuestion && !submitting && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 max-w-[88%]">
            <div className="w-7 h-7 shrink-0 flex items-center justify-center bg-primary/20 border border-primary/30 font-mono text-[10px] text-primary font-bold mt-0.5">AI</div>
            <div className="border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed">{currentQuestion}</div>
          </motion.div>
        )}

        {submitting && (
          <div className="flex gap-3">
            <div className="w-7 h-7 shrink-0 flex items-center justify-center bg-primary/20 border border-primary/30 font-mono text-[10px] text-primary font-bold">AI</div>
            <div className="border border-border bg-card/40 px-4 py-3 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
              <span className="font-mono text-xs text-muted-foreground">Evaluating your answer…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Answer input */}
      {!isComplete && (
        <div className="flex-none border-t border-border p-4">
          <div className="flex gap-3">
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnswer(); }}
              placeholder="Type your answer… (Ctrl+Enter to submit)"
              rows={3}
              disabled={submitting || !currentQuestion}
              className="flex-1 bg-card border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/50 resize-none disabled:opacity-40"
            />
            <Button
              onClick={submitAnswer}
              disabled={submitting || !userAnswer.trim() || !currentQuestion}
              className="rounded-none self-end gap-1.5 font-mono text-xs uppercase tracking-wider"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground/50 mt-1.5">
            Question {questionNumber} of 5 · Ctrl+Enter to submit
          </p>
        </div>
      )}
    </div>
  );
}
