import CountUp from "react-countup";
import { useInventory } from "@/context/InventoryContext";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersona } from "@/context/PersonaContext";

const BARS = Array.from({ length: 14 }, (_, i) => 30 + ((i * 19 + 7) % 70));

export function TotalSavedCounter() {
  const { totalRecoveredAcrossMonths, reset, months } = useInventory();
  const { can } = usePersona();
  const showReset = totalRecoveredAcrossMonths > 0 && can("runOptimization");

  const totalLeakage =
    months.previous.totalLeakage +
    months.current.totalLeakage +
    months.next.totalLeakage;

  const revenueAfter = Math.max(0, totalLeakage - totalRecoveredAcrossMonths);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/60 to-card p-4">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/20 blur-3xl" />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary/90">
          <Sparkles className="h-3 w-3" />
          Total Saved · AI Recovery
        </div>
        {showReset && (
          <Button variant="ghost" size="sm" onClick={() => reset()} className="shrink-0 text-xs">
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      {/* Value + bar graph side by side */}
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            $<CountUp end={totalRecoveredAcrossMonths} duration={2.0} separator="," preserveValue useEasing />
          </div>
        </div>

        <div className="flex h-10 items-end gap-[2px] opacity-60">
          {BARS.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className="w-[3px] rounded-sm bg-primary opacity-70"
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="relative mt-auto grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-[11px]">
        <div>
          <div className="text-muted-foreground">Before AI Recovery</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-amber">
            ${totalLeakage.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">After AI Recovery</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald">
            ${revenueAfter.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
