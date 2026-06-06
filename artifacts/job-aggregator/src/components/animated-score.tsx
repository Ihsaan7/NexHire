import { useEffect, useState } from "react";

export function AnimatedScore({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1000; // 1 second

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Easing out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      setDisplayScore(Math.floor(easeProgress * score));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [score]);

  const getColor = (s: number) => {
    if (s >= 80) return "text-primary border-primary";
    if (s >= 60) return "text-amber-500 border-amber-500/50";
    return "text-muted-foreground border-border";
  };

  return (
    <div className={`w-12 h-12 flex flex-col items-center justify-center border rounded-full ${getColor(score)} bg-background shadow-sm`}>
      <span className="font-mono text-sm font-bold leading-none">{displayScore}</span>
      <span className="font-mono text-[8px] uppercase leading-none opacity-80">Match</span>
    </div>
  );
}