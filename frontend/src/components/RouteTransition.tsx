import * as React from "react";
import { Sparkles } from "lucide-react";

/**
 * Route-change transition: lego bricks fly in to spell out "GapGenius",
 * filling the gap to portray the brand. Lasts ~1.1s on every navigation
 * after the initial boot Preloader.
 */
export function RouteTransition({ triggerKey }: { triggerKey: number }) {
  const [visible, setVisible] = React.useState(() => triggerKey > 0);

  React.useEffect(() => {
    if (triggerKey === 0) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(t);
  }, [triggerKey]);

  if (!visible) return null;

  return (
    <div
      key={triggerKey}
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-background/85 backdrop-blur-sm animate-route-fade"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.3em] text-primary/80">
          <Sparkles className="mr-1 inline h-3 w-3" />
          GapGenius
        </div>
        <BrickWord word="GapGenius" />
        <div className="text-[11px] text-muted-foreground">Re-stitching the workspace…</div>
      </div>
    </div>
  );
}

/**
 * Render the word as a row of "lego studded" letter tiles that fly in from
 * scattered positions and snap into place — visualising bricks filling the gap.
 */
function BrickWord({ word }: { word: string }) {
  const letters = word.split("");
  return (
    <div className="flex items-end gap-1.5">
      {letters.map((ch, i) => {
        const palette = ["bg-primary/85", "bg-amber/85", "bg-emerald/85", "bg-rose/80"];
        const color = palette[i % palette.length];
        return (
          <div
            key={i}
            className={`relative flex h-12 w-9 items-center justify-center rounded-[5px] text-base font-bold text-foreground shadow-[0_4px_0_-1px_color-mix(in_oklab,black_55%,transparent),inset_0_-2px_0_color-mix(in_oklab,black_25%,transparent)] animate-brick-snap ${color}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {/* studs */}
            <div className="absolute -top-1 left-1 right-1 flex justify-between">
              <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
            </div>
            <span className="drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">{ch}</span>
          </div>
        );
      })}
    </div>
  );
}
