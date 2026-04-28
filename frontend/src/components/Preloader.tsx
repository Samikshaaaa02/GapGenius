import * as React from "react";
import { Sparkles } from "lucide-react";

interface Props {
  onComplete: () => void;
  durationMs?: number;
}

const STEPS = [
  "Booting GapGenius engine…",
  "Connecting to Opera PMS…",
  "Loading 1,200 room-nights (40 × 30)…",
  "Indexing fragmentation patterns…",
  "Calibrating OptaPlanner constraints…",
  "Ready. Welcome back, manager.",
];

/**
 * GapGenius preloader: animated "lego brick" rearrangement.
 * Bricks shuffle and snap into a neat row, evoking the AI re-stitching
 * fragmented inventory back into contiguous, sellable nights.
 */
export function Preloader({ onComplete, durationMs = 2600 }: Props) {
  const [progress, setProgress] = React.useState(0);
  const [stepIdx, setStepIdx] = React.useState(0);

  React.useEffect(() => {
    const tick = 40;
    let elapsed = 0;
    const id = window.setInterval(() => {
      elapsed += tick;
      const p = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(p);
      setStepIdx(Math.min(STEPS.length - 1, Math.floor((p / 100) * STEPS.length)));
      if (elapsed >= durationMs) {
        window.clearInterval(id);
        window.setTimeout(onComplete, 220);
      }
    }, tick);
    return () => window.clearInterval(id);
  }, [durationMs, onComplete]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background bg-grid-fade">
      <div className="flex w-[min(460px,92vw)] flex-col items-center gap-8">
        {/* Lego scene */}
        <div className="relative h-32 w-full">
          {/* baseplate glow */}
          <div className="absolute bottom-2 left-1/2 h-1.5 w-56 -translate-x-1/2 rounded-full bg-primary/20 blur-md" />

          {/* Front row of "fragmented" bricks shuffling into place */}
          <div className="absolute inset-0 flex items-end justify-center gap-2 pb-4">
            <Brick className="bg-rose/80 animate-brick-a" studs={2} />
            <Brick className="bg-amber animate-brick-b animate-brick-glow" studs={3} />
            <Brick className="bg-emerald/80 animate-brick-rise" studs={2} />
            <Brick className="bg-primary/80 animate-brick-a" studs={4} delay="0.4s" />
            <Brick className="bg-amber/90 animate-brick-b animate-brick-glow" studs={2} delay="0.2s" />
            <Brick className="bg-emerald/90 animate-brick-rise" studs={3} delay="0.6s" />
          </div>

          {/* Floating sparkle */}
          <Sparkles className="absolute right-8 top-2 h-4 w-4 animate-pulse text-primary" />
          <Sparkles
            className="absolute left-8 top-6 h-3 w-3 animate-pulse text-primary/70"
            style={{ animationDelay: "0.6s" }}
          />
        </div>

        {/* Title */}
        <div className="text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary/80">
            GapGenius
          </div>
          <h1 className="mt-1 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            Re-stitching your inventory
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Rearranging 1,200 room-nights into contiguous, sellable blocks
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-card ring-1 ring-border">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60"
              style={{ width: `${progress}%`, transition: "width 80ms linear" }}
            />
            <div className="animate-scan-bar absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
            <span className="truncate">{STEPS[stepIdx]}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A stylised lego brick with studs on top. */
function Brick({
  className = "",
  studs = 2,
  delay,
}: {
  className?: string;
  studs?: number;
  delay?: string;
}) {
  const width = studs * 16 + 8;
  return (
    <div
      className={`relative flex items-end rounded-[3px] shadow-[0_4px_0_-1px_color-mix(in_oklab,black_50%,transparent),inset_0_-2px_0_color-mix(in_oklab,black_25%,transparent)] ${className}`}
      style={{
        width,
        height: 22,
        animationDelay: delay,
      }}
    >
      {/* studs */}
      <div className="absolute -top-1.5 left-1 right-1 flex justify-between">
        {Array.from({ length: studs }).map((_, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-white/30 shadow-[inset_0_-1px_0_color-mix(in_oklab,black_30%,transparent)]"
          />
        ))}
      </div>
    </div>
  );
}
