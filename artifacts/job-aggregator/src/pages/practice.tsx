import { useState, useRef, useEffect } from "react";
import {
  getGetLatestPracticeSessionQueryKey,
  getGetPracticeHistorySessionQueryKey,
  getListPracticeHistoryQueryKey,
  useGetPracticeHistorySession,
  useStartPracticeSession,
  useSendPracticeMessage,
  useGetLatestPracticeSession,
  useListPracticeHistory,
  useAbandonPracticeSession,
  type PracticeMessageInput,
  type PracticeQuestionGenerationLabel,
  type PracticeQuestionSource,
  type PracticeSession,
  type PracticeStartInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  FileText, Briefcase, MessageSquare, RefreshCw, Send,
  Star, ChevronRight, RotateCcw, CheckCircle2, Trophy,
  History, ArrowLeft,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Mode = "cv" | "job" | "custom";
type ChatMessage = {
  role: "ai" | "user";
  content: string;
  feedback?: string;
  score?: number;
  generationLabel?: PracticeQuestionGenerationLabel;
  sources?: PracticeQuestionSource[];
};

function safeQuestionSources(sources: PracticeQuestionSource[]) {
  return sources.filter((source) => {
    try {
      const url = new URL(source.url);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        Boolean(source.site.trim())
      );
    } catch {
      return false;
    }
  });
}

function QuestionResearch({
  generationLabel,
  sources,
}: {
  generationLabel: PracticeQuestionGenerationLabel;
  sources: PracticeQuestionSource[];
}) {
  const safeSources = safeQuestionSources(sources);
  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {generationLabel}
      </p>
      {safeSources.map((source) => (
        <p key={source.url} className="text-[11px] text-muted-foreground">
          Source:{" "}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {source.site} — {source.url}
          </a>
        </p>
      ))}
    </div>
  );
}

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
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Setup state
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [topic, setTopic] = useState("");

  // Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionContext, setSessionContext] = useState<{ mode: Mode; jobTitle?: string; jobDescription?: string; topic?: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [currentQuestionGenerationLabel, setCurrentQuestionGenerationLabel] =
    useState<PracticeQuestionGenerationLabel>("AI-generated");
  const [currentQuestionSources, setCurrentQuestionSources] = useState<
    PracticeQuestionSource[]
  >([]);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState("");
  const [avgScore, setAvgScore] = useState(0);
  const [unfinishedSession, setUnfinishedSession] =
    useState<PracticeSession | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistorySessionId, setSelectedHistorySessionId] =
    useState<string | null>(null);

  const startPractice = useStartPracticeSession();
  const sendPractice = useSendPracticeMessage();
  const abandonPractice = useAbandonPracticeSession();
  const {
    data: practiceHistory,
    isLoading: historyLoading,
    refetch: refetchPracticeHistory,
  } = useListPracticeHistory();
  const {
    data: historySession,
    isLoading: historySessionLoading,
  } = useGetPracticeHistorySession(selectedHistorySessionId ?? "", {
    query: {
      enabled: Boolean(selectedHistorySessionId),
      queryKey: getGetPracticeHistorySessionQueryKey(
        selectedHistorySessionId ?? "",
      ),
    },
  });
  const {
    data: persistedSession,
    refetch: refetchPersistedSession,
    isFetchedAfterMount: hasFetchedPersistedSession,
  } = useGetLatestPracticeSession();
  const starting = startPractice.isPending;
  const submitting = sendPractice.isPending;
  const startingFresh = abandonPractice.isPending || startPractice.isPending;

  const restoreSession = (session: PracticeSession) => {
    setSessionId(session.sessionId);
    setSelectedMode(session.mode);
    setJobTitle(session.jobTitle ?? "");
    setJobDescription(session.jobDescription ?? "");
    setTopic(session.topic ?? "");
    setSessionContext({
      mode: session.mode,
      jobTitle: session.jobTitle ?? undefined,
      jobDescription: session.jobDescription ?? undefined,
      topic: session.topic ?? undefined,
    });
    let restoredQuestionIndex = 0;
    setMessages(session.messages.map((message, messageIndex) => {
      const question =
        message.role === "ai" && messageIndex > 0
          ? session.questions[restoredQuestionIndex++]
          : undefined;
      return {
        role: message.role,
        content: message.content,
        feedback: message.feedback ?? undefined,
        score: message.score ?? undefined,
        generationLabel: question?.generationLabel,
        sources: question?.sources,
      };
    }));
    setCurrentQuestion(session.currentQuestion);
    const currentQuestionRecord =
      session.questions[session.questionNumber - 1];
    setCurrentQuestionGenerationLabel(
      currentQuestionRecord?.generationLabel ?? "AI-generated",
    );
    setCurrentQuestionSources(currentQuestionRecord?.sources ?? []);
    setQuestionNumber(session.questionNumber);
    setIsComplete(session.isComplete);
    setSummary(session.summary);
    setAvgScore(session.totalScore);
    const pendingQuestion = session.questions[session.questionNumber - 1];
    setUserAnswer(
      pendingQuestion?.userAnswer && !pendingQuestion.aiFeedback
        ? pendingQuestion.userAnswer
        : "",
    );
    setUnfinishedSession(null);
    setSessionActive(true);
  };

  useEffect(() => {
    if (
      !hasFetchedPersistedSession ||
      !persistedSession ||
      sessionActive ||
      startingFresh
    ) {
      return;
    }
    if (persistedSession.status === "incomplete") {
      setUnfinishedSession(persistedSession);
      return;
    }
    restoreSession(persistedSession);
  }, [
    hasFetchedPersistedSession,
    persistedSession,
    sessionActive,
    startingFresh,
  ]);

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
      setSessionId(data.sessionId);
      setSessionContext({ mode: selectedMode, jobTitle, jobDescription, topic });
      setMessages([{ role: "ai", content: data.intro }]);
      setCurrentQuestion(data.firstQuestion);
      setCurrentQuestionGenerationLabel(data.generationLabel);
      setCurrentQuestionSources(data.sources);
      setQuestionNumber(1);
      setSessionActive(true);
      void queryClient.invalidateQueries({
        queryKey: getGetLatestPracticeSessionQueryKey(),
      });
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

  const resumeSession = () => {
    if (!unfinishedSession) return;
    restoreSession(unfinishedSession);
  };

  const startFreshSession = async () => {
    if (!unfinishedSession) return;
    const previousSession = unfinishedSession;

    try {
      await abandonPractice.mutateAsync({
        sessionId: previousSession.sessionId,
      });
    } catch (error) {
      toast({
        title: "Could not close the old session",
        description: getApiErrorMessage(error, "Try again."),
        variant: "destructive",
      });
      return;
    }

    setUnfinishedSession(null);
    queryClient.removeQueries({
      queryKey: getGetLatestPracticeSessionQueryKey(),
    });
    setSelectedMode(previousSession.mode);
    setJobTitle(previousSession.jobTitle ?? "");
    setJobDescription(previousSession.jobDescription ?? "");
    setTopic(previousSession.topic ?? "");

    const body: PracticeStartInput = { mode: previousSession.mode };
    if (previousSession.mode === "job") {
      body.jobTitle = previousSession.jobTitle ?? "";
      body.jobDescription = previousSession.jobDescription ?? "";
    }
    if (previousSession.mode === "custom") {
      body.topic = previousSession.topic ?? "";
    }

    try {
      const data = await startPractice.mutateAsync({ data: body });
      setSessionId(data.sessionId);
      setSessionContext({
        mode: previousSession.mode,
        jobTitle: previousSession.jobTitle ?? undefined,
        jobDescription: previousSession.jobDescription ?? undefined,
        topic: previousSession.topic ?? undefined,
      });
      setMessages([{ role: "ai", content: data.intro }]);
      setCurrentQuestion(data.firstQuestion);
      setCurrentQuestionGenerationLabel(data.generationLabel);
      setCurrentQuestionSources(data.sources);
      setQuestionNumber(1);
      setUserAnswer("");
      setIsComplete(false);
      setSummary("");
      setAvgScore(0);
      setSessionActive(true);
      await queryClient.invalidateQueries({
        queryKey: getGetLatestPracticeSessionQueryKey(),
      });
    } catch (error) {
      toast({
        title: "Could not start a fresh session",
        description: getApiErrorMessage(
          error,
          "Your old session was closed. Review the setup and try again.",
        ),
        variant: "destructive",
      });
    }
  };

  const submitAnswer = async () => {
    if (!userAnswer.trim() || !sessionContext) return;
    if (!sessionId) {
      toast({ title: "Practice session unavailable", description: "Start a new session and try again.", variant: "destructive" });
      return;
    }
    const answer = userAnswer.trim();
    setUserAnswer("");
    // Add user answer to messages
    const updatedMessages: ChatMessage[] = [
      ...messages,
      {
        role: "ai",
        content: currentQuestion,
        generationLabel: currentQuestionGenerationLabel,
        sources: currentQuestionSources,
      },
      { role: "user", content: answer },
    ];
    setMessages(updatedMessages);
    setCurrentQuestion("");

    const body: PracticeMessageInput = {
      sessionId,
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
        void queryClient.invalidateQueries({
          queryKey: getListPracticeHistoryQueryKey(),
        });
      } else {
        setMessages(withFeedback);
        setCurrentQuestion(data.nextQuestion || "");
        setCurrentQuestionGenerationLabel(
          data.nextQuestionGenerationLabel ?? "AI-generated",
        );
        setCurrentQuestionSources(data.nextQuestionSources);
        setQuestionNumber(data.questionNumber);
      }
      },
      onError: async (error) => {
        const restored = (await refetchPersistedSession()).data;
        if (restored) {
          let restoredQuestionIndex = 0;
          setMessages(restored.messages.map((message, messageIndex) => {
            const question =
              message.role === "ai" && messageIndex > 0
                ? restored.questions[restoredQuestionIndex++]
                : undefined;
            return {
              role: message.role,
              content: message.content,
              feedback: message.feedback ?? undefined,
              score: message.score ?? undefined,
              generationLabel: question?.generationLabel,
              sources: question?.sources,
            };
          }));
          setCurrentQuestion(restored.currentQuestion);
          const currentQuestionRecord =
            restored.questions[restored.questionNumber - 1];
          setCurrentQuestionGenerationLabel(
            currentQuestionRecord?.generationLabel ?? "AI-generated",
          );
          setCurrentQuestionSources(currentQuestionRecord?.sources ?? []);
          setQuestionNumber(restored.questionNumber);
          setIsComplete(restored.isComplete);
          setSummary(restored.summary);
          setAvgScore(restored.totalScore);
          const pendingQuestion =
            restored.questions[restored.questionNumber - 1];
          setUserAnswer(
            pendingQuestion?.userAnswer && !pendingQuestion.aiFeedback
              ? pendingQuestion.userAnswer
              : "",
          );
        }
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
    setCurrentQuestionGenerationLabel("AI-generated");
    setCurrentQuestionSources([]);
    setQuestionNumber(0);
    setUserAnswer("");
    setIsComplete(false);
    setSummary("");
    setAvgScore(0);
    setSessionContext(null);
  };

  const openHistory = () => {
    setShowHistory(true);
    void refetchPracticeHistory();
  };

  if (showHistory) {
    return (
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Interview Practice
            </p>
            <h1 className="text-4xl md:text-5xl font-serif tracking-tight">
              Practice History
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setShowHistory(false);
              setSelectedHistorySessionId(null);
            }}
            className="rounded-none font-mono uppercase text-xs tracking-wider gap-2 self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to practice
          </Button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <section className="border border-border bg-card/40">
            <div className="border-b border-border p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Completed sessions
              </p>
            </div>
            {historyLoading ? (
              <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading history…
              </div>
            ) : practiceHistory?.length ? (
              <div>
                {practiceHistory.map((session) => (
                  <button
                    key={session.sessionId}
                    onClick={() =>
                      setSelectedHistorySessionId(session.sessionId)
                    }
                    className={`w-full text-left p-4 border-b border-border last:border-b-0 transition-colors ${
                      selectedHistorySessionId === session.sessionId
                        ? "bg-primary/10"
                        : "hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-serif text-lg truncate">
                          {session.topic}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                          {session.mode} · {session.questionCount} questions
                        </p>
                      </div>
                      <span className="font-mono text-lg font-bold">
                        {session.totalScore}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(session.completedAt))}
                    </p>
                    {session.scoreImprovement !== null && (
                      <p className="text-xs text-green-400 mt-2">
                        Improved by {session.scoreImprovement} points from your
                        previous {session.topic} session.
                      </p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                Complete a practice session to see it here.
              </p>
            )}
          </section>

          <section className="border border-border bg-card/40 min-h-[360px]">
            {!selectedHistorySessionId ? (
              <div className="p-8 h-full flex items-center justify-center text-center">
                <div>
                  <History className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                  <p className="font-serif text-xl mb-1">
                    Select a completed session
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Review every question, answer, feedback note, and score.
                  </p>
                </div>
              </div>
            ) : historySessionLoading ? (
              <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading session…
              </div>
            ) : historySession ? (
              <div>
                <div className="border-b border-border p-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-serif text-2xl">
                      {historySession.mode === "job"
                        ? historySession.jobTitle || "Specific job"
                        : historySession.mode === "custom"
                          ? historySession.topic || "Custom practice"
                          : "My CV"}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(historySession.updatedAt))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-3xl font-bold">
                      {historySession.totalScore}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Average /10
                    </p>
                  </div>
                </div>
                <div className="border-b border-border p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                      Strong
                    </p>
                    <p className="text-sm text-green-400">
                      {historySession.skillBreakdown.strong.length
                        ? historySession.skillBreakdown.strong.join(" · ")
                        : "None recorded"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                      Needs work
                    </p>
                    <p className="text-sm text-yellow-400">
                      {historySession.skillBreakdown.needsWork.length
                        ? historySession.skillBreakdown.needsWork.join(" · ")
                        : "None recorded"}
                    </p>
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  {historySession.questions
                    .filter((question) => question.userAnswer)
                    .map((question, index) => (
                      <article
                        key={`${index}-${question.question}`}
                        className="border-b border-border/60 pb-5 last:border-0 last:pb-0"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                          Question {index + 1}
                          {question.category
                            ? ` · ${question.category}`
                            : " · Not categorized"}
                        </p>
                        <p className="font-serif text-lg mb-3">
                          {question.question}
                        </p>
                        <div className="bg-background/60 border border-border p-4 mb-3">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                            Your answer
                          </p>
                          <p className="text-sm">{question.userAnswer}</p>
                        </div>
                        {question.aiFeedback && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {question.aiFeedback}
                          </p>
                        )}
                        <QuestionResearch
                          generationLabel={question.generationLabel}
                          sources={question.sources}
                        />
                        {question.score !== null &&
                          question.score !== undefined && (
                            <ScoreBar score={question.score} />
                          )}
                      </article>
                    ))}
                </div>
              </div>
            ) : (
              <p className="p-8 text-sm text-muted-foreground">
                This session could not be loaded.
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ── Mode selection screen ──────────────────────────────────────────────────
  if (!sessionActive) {
    return (
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-2">Interview Practice</h1>
            <p className="text-muted-foreground font-mono uppercase text-xs tracking-widest">
              Mock interviews · Skill tests · AI-powered feedback
            </p>
          </div>
          <Button
            variant="outline"
            onClick={openHistory}
            className="rounded-none font-mono uppercase text-xs tracking-wider gap-2 self-start sm:self-auto"
          >
            <History className="w-3.5 h-3.5" /> History
          </Button>
        </header>

        {unfinishedSession && (
          <div className="border border-primary/40 bg-primary/10 p-5 mb-8">
            <p className="font-serif text-lg mb-1">
              You have an unfinished practice session from{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(unfinishedSession.startedAt))}
              . Resume it?
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Your saved questions, answers, feedback, and scores will be
              restored.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={resumeSession}
                disabled={startingFresh}
                className="rounded-none font-mono uppercase text-xs tracking-wider"
              >
                Resume
              </Button>
              <Button
                variant="outline"
                onClick={startFreshSession}
                disabled={startingFresh}
                className="rounded-none font-mono uppercase text-xs tracking-wider gap-2"
              >
                {startingFresh && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                Start fresh
              </Button>
            </div>
          </div>
        )}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button onClick={resetSession} variant="outline" className="rounded-none font-mono uppercase text-xs tracking-wider gap-2">
              <RotateCcw className="w-3.5 h-3.5" /> Start Another Session
            </Button>
            <Button onClick={openHistory} variant="outline" className="rounded-none font-mono uppercase text-xs tracking-wider gap-2">
              <History className="w-3.5 h-3.5" /> View History
            </Button>
          </div>
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
                <div className="border border-border bg-card/60 px-4 py-3 text-sm leading-relaxed">
                  {msg.content}
                  {msg.generationLabel && (
                    <QuestionResearch
                      generationLabel={msg.generationLabel}
                      sources={msg.sources ?? []}
                    />
                  )}
                </div>
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
            <div className="border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed">
              {currentQuestion}
              <QuestionResearch
                generationLabel={currentQuestionGenerationLabel}
                sources={currentQuestionSources}
              />
            </div>
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
