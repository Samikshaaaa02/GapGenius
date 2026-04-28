import { Check, Sparkles, History as HistoryIcon, Wand2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@/context/InventoryContext";

interface Props {
  entries: ActivityEntry[];
}

/**
 * Persistent chat-style log of every AI optimization or scenario fix the
 * manager has triggered this session. Entries are grouped by category
 * (Optimization runs vs. Scenario fixes) so "Fix Yourself" actions are
 * tagged under their parent issue, like the Recommend signal display.
 */
export function ActivityHistory({ entries }: Props) {
  if (entries.length === 0) return null;

  const optimizationEntries = entries.filter((e) => e.kind === "optimization");
  const scenarioEntries = entries.filter((e) => e.kind === "scenario");

  return (
    <div className="border-b border-border bg-card/40 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <HistoryIcon className="h-3 w-3 text-primary" />
        Activity history · {entries.length} run{entries.length === 1 ? "" : "s"}
      </div>

      {optimizationEntries.length > 0 && (
        <ActivityGroup
          label="AI Optimization"
          accent="primary"
          entries={optimizationEntries}
        />
      )}
      {scenarioEntries.length > 0 && (
        <ActivityGroup
          label="Scenario Fixes (Fix Yourself)"
          accent="emerald"
          entries={scenarioEntries}
          className={optimizationEntries.length > 0 ? "mt-3" : ""}
        />
      )}
    </div>
  );
}

function ActivityGroup({
  label,
  entries,
  accent,
  className = "",
}: {
  label: string;
  entries: ActivityEntry[];
  accent: "primary" | "emerald";
  className?: string;
}) {
  const totalRecovered = entries.reduce((s, e) => s + e.recovered, 0);
  return (
    <div className={className}>
      <div
        className={cn(
          "mb-1.5 flex items-center justify-between rounded-md border px-2 py-1",
          accent === "primary"
            ? "border-primary/30 bg-primary/10"
            : "border-emerald/30 bg-emerald/10",
        )}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
          {accent === "primary" ? (
            <Zap className="h-3 w-3 text-primary" />
          ) : (
            <Wand2 className="h-3 w-3 text-emerald" />
          )}
          <span className={accent === "primary" ? "text-primary" : "text-emerald"}>{label}</span>
          <span className="text-muted-foreground">· {entries.length}</span>
        </div>
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            accent === "primary" ? "text-primary" : "text-emerald",
          )}
        >
          +${totalRecovered.toLocaleString()}
        </span>
      </div>

      <ol className="space-y-2 border-l-2 border-border/50 pl-2">
        {entries.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-border/70 bg-background/50 p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1",
                    accent === "primary"
                      ? "bg-primary/15 text-primary ring-primary/30"
                      : "bg-emerald/15 text-emerald ring-emerald/30",
                  )}
                >
                  {accent === "primary" ? (
                    <Zap className="h-3 w-3" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold">{e.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.detail} ·{" "}
                    {new Date(e.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-emerald">
                +${e.recovered.toLocaleString()}
              </span>
            </div>

            <ol className="mt-2 space-y-1 border-l border-border/60 pl-2.5">
              {e.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-[10.5px] text-muted-foreground"
                >
                  <Check className="mt-[2px] h-2.5 w-2.5 shrink-0 text-emerald" strokeWidth={3} />
                  <span className="leading-snug">{s}</span>
                </li>
              ))}
            </ol>

            <div className="mt-1.5 flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-primary/70">
              <Sparkles className="h-2.5 w-2.5" />
              Synced to Opera PMS
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
