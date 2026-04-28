import * as React from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Scanning 1,200 room-nights for fragmentation patterns…",
  "Calculating revenue impact for 40-room inventory…",
  "Applying OptaPlanner constraints for guest shuffles…",
  "Executing 1-click fixes for Orphan Nights…",
  "Syncing recovered revenue to Opera PMS…",
];

interface Props {
  /** Whether the optimization animation is currently running. */
  running: boolean;
  /** Whether the optimization completed successfully. */
  done: boolean;
  /** Total duration of the cell-flip animation, in ms. */
  totalMs: number;
  /** Total recovered revenue (after run completes). */
  recovered?: number;
}

/**
 * Real-time AI optimization checklist synced with the cell-flip cascade.
 * Shows 5 steps that tick off in sequence as the heatmap animates.
 */
export function AiChecklist({ running, done, totalMs, recovered = 0 }: Props) {
  const [completedIdx, setCompletedIdx] = React.useState<number>(done ? STEPS.length : -1);

  React.useEffect(() => {
    if (!running) {
      if (done) setCompletedIdx(STEPS.length);
      return;
    }
    setCompletedIdx(-1);
    const stepDuration = Math.max(280, Math.floor(totalMs / STEPS.length));
    const timers: number[] = [];
    STEPS.forEach((_, i) => {
      timers.push(
        window.setTimeout(
          () => setCompletedIdx(i),
          stepDuration * (i + 1),
        ),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [running, done, totalMs]);

  const activeIdx = completedIdx + 1;

  return (
    <div className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-primary/90">
        <Sparkles className="h-3 w-3" />
        Live Solve · AI Optimization
      </div>
      <ol className="space-y-1.5">
        {STEPS.map((label, i) => {
          const isDone = i <= completedIdx;
          const isActive = !done && i === activeIdx && running;
          return (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors",
                isDone && "bg-emerald/10 text-foreground",
                isActive && "bg-primary/10 text-foreground",
                !isDone && !isActive && "text-muted-foreground/70",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  isDone && "border-emerald/50 bg-emerald/20 text-emerald",
                  isActive && "border-primary/50 bg-primary/15 text-primary",
                  !isDone && !isActive && "border-border bg-background/40",
                )}
              >
                {isDone ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : isActive ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              <span className="leading-snug">{label}</span>
            </li>
          );
        })}
      </ol>
      {done && (
        <div className="mt-2.5 flex items-center justify-between rounded-md border border-emerald/30 bg-emerald/10 px-2.5 py-1.5 text-[11px]">
          <span className="text-emerald">Optimization complete</span>
          <span className="tabular-nums font-semibold text-emerald">
            +${recovered.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
