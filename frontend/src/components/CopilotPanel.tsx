import * as React from "react";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Lightbulb,
  Wand2,
  Check,
  TrendingUp,
  History,
  MessageSquareX,
  X,
  Eye,
  Sparkles,
  Plug2,
  Moon,
  CalendarRange,
  Send,
  ThumbsDown,
  Zap,
} from "lucide-react";
import { sendChat, type ChatMessage, type AIRecommendation } from "@/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useInventory } from "@/context/InventoryContext";
import { usePersona } from "@/context/PersonaContext";
import type { RoomNight, ScenarioKind, Signal, MonthKey } from "@/data/mockInventory";
import { AiChecklist } from "@/components/AiChecklist";
import { ActivityHistory } from "@/components/ActivityHistory";
import { toast } from "sonner";

const SCENARIOS: {
  kind: ScenarioKind;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}[] = [
  {
    kind: "channel",
    title: "Channel Partner Blockage",
    subtitle: "Inventory held by OTAs past release window",
    icon: Plug2,
    tone: "text-amber",
  },
  {
    kind: "shoulder",
    title: "Shoulder Nights",
    subtitle: "Tue/Wed/Sun mispriced or closed for sale",
    icon: CalendarRange,
    tone: "text-amber",
  },
  {
    kind: "orphan",
    title: "Orphaned Nights",
    subtitle: "Single-night gaps locked by min-stay rules",
    icon: Moon,
    tone: "text-amber",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  selectedCell: RoomNight | null;
  onClearCell: () => void;
  aiRecommendations?: AIRecommendation[];
  onClearRecommendations?: () => void;
}

export function CopilotPanel({ open, onClose, selectedCell, onClearCell, aiRecommendations = [], onClearRecommendations }: Props) {
  const { active, activeState, fixScenario, applyFix, state } = useInventory();
  const { can, persona } = usePersona();
  const canFix = can("applyManualFix");

  const [explainKind, setExplainKind] = React.useState<ScenarioKind | null>(null);
  const [fixedKind, setFixedKind] = React.useState<ScenarioKind | null>(null);

  // AI recommendation fix state
  const [fixProgress, setFixProgress] = React.useState<Record<string, number>>({});
  const [fixDone, setFixDone] = React.useState<Set<string>>(new Set());
  const [rejected, setRejected] = React.useState<Set<string>>(new Set());

  // Refs so the setInterval callback always has the latest values
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const applyFixRef = React.useRef(applyFix);
  applyFixRef.current = applyFix;

  const MONTH_KEYS: MonthKey[] = ["previous", "current", "next"];

  const handleFixRec = (rec: AIRecommendation) => {
    if (fixDone.has(rec.recommendation_id) || fixProgress[rec.recommendation_id] !== undefined) return;
    setFixProgress((p) => ({ ...p, [rec.recommendation_id]: 0 }));
    const DURATION = 1800;
    const INTERVAL = 30;
    let elapsed = 0;
    const timer = window.setInterval(() => {
      elapsed += INTERVAL;
      const pct = Math.min(100, Math.round((elapsed / DURATION) * 100));
      setFixProgress((p) => ({ ...p, [rec.recommendation_id]: pct }));
      if (pct >= 100) {
        clearInterval(timer);
        const roomNums = rec.affected_rooms
          .map((r) => { const d = r.replace(/\D/g, ""); return d ? parseInt(d) : NaN; })
          .filter((n) => !isNaN(n));
        console.log("[GG:fix] applying fix for rooms:", roomNums, "rec:", rec.recommendation_id);
        let fixed = 0;
        MONTH_KEYS.forEach((monthKey) => {
          const cells = stateRef.current[monthKey].inventory.filter(
            (c) => c.status === "fragmented" && roomNums.includes(c.roomNumber)
          );
          console.log(`[GG:fix] month=${monthKey} fragmented cells for rooms:`, cells.length, cells.map(c => `${c.roomNumber}@${c.date}`));
          cells.forEach((c) => { applyFixRef.current(c.id, monthKey); fixed++; });
        });
        console.log("[GG:fix] total cells fixed:", fixed);
        setFixDone((s) => new Set(s).add(rec.recommendation_id));
        toast.success(`Applied: ${rec.headline.slice(0, 50)}`, {
          description: `+$${rec.estimated_revenue_lift.toLocaleString(undefined, { maximumFractionDigits: 0 })} recovered`,
        });
      }
    }, INTERVAL);
  };

  const handleRejectRec = (id: string) => {
    setRejected((s) => new Set(s).add(id));
  };

  // Chat state
  const [chatInput, setChatInput] = React.useState("");
  const [chatHistory, setChatHistory] = React.useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    setChatHistory((h) => [...h, userMsg]);
    setChatLoading(true);
    try {
      const leakage = active.totalLeakage - activeState.recovered;
      const orphanCount =
        activeState.inventory.filter((c) => c.status === "fragmented").length;
      const res = await sendChat(msg, [...chatHistory, userMsg], {
        total_leakage: leakage,
        orphan_count: orphanCount,
        property_name: active.longLabel,
      });
      setChatHistory((h) => [...h, { role: "assistant", content: res.message }]);
    } catch {
      setChatHistory((h) => [
        ...h,
        { role: "assistant", content: "Backend unavailable — start the GapGenius server on port 8000." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Compute remaining leakage per scenario based on what's already been fixed
  const scenarioRemaining: Record<ScenarioKind, { amount: number; count: number }> =
    React.useMemo(() => {
      const result = {
        channel: { amount: 0, count: 0 },
        shoulder: { amount: 0, count: 0 },
        orphan: { amount: 0, count: 0 },
      } as Record<ScenarioKind, { amount: number; count: number }>;
      activeState.inventory.forEach((c) => {
        if (c.status === "fragmented" && c.scenario) {
          result[c.scenario].amount += c.lostRevenue;
          result[c.scenario].count += 1;
        }
      });
      return result;
    }, [activeState.inventory]);

  const handleFixScenario = (kind: ScenarioKind) => {
    if (!canFix) {
      toast.error("Read-only access", {
        description: `${persona.name} can view but not apply fixes.`,
      });
      return;
    }
    const before = scenarioRemaining[kind].amount;
    fixScenario(kind);
    setFixedKind(kind);
    const labelMap: Record<ScenarioKind, string> = {
      channel: "Channel blockage cleared",
      shoulder: "Shoulder nights re-opened",
      orphan: "Orphan nights stitched",
    };
    setTimeout(() => {
      toast.success(labelMap[kind], { description: `+$${before.toLocaleString()} recovered` });
    }, 500);
  };

  const handleApplyCell = () => {
    if (!selectedCell || !canFix) return;
    applyFix(selectedCell.id);
    toast.success(`Fix applied · +$${selectedCell.lostRevenue}`, {
      description: `Room ${selectedCell.roomNumber} · ${selectedCell.date}`,
    });
    onClearCell();
  };

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground transition-[width] duration-300",
        open ? "w-[350px]" : "w-0 overflow-hidden",
      )}
      aria-hidden={!open}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
            <Bot className="h-3.5 w-3.5" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald shadow-[0_0_6px_var(--emerald)]" />
          </div>
          <div className="leading-tight">
            <div className="text-xs font-semibold">GapGenius Copilot</div>
            <div className="text-[10px] text-muted-foreground">Context · {active.label}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close copilot"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Live AI Checklist — visible only while a run is in progress */}
        {activeState.optimizationRunning && (
          <AiChecklist
            running={activeState.optimizationRunning}
            done={false}
            totalMs={Math.max(
              1400,
              activeState.inventory.filter((c) => c.safeFix).length * 50 + 400,
            )}
            recovered={activeState.recovered}
          />
        )}

        {/* Persistent activity history — every run stays in chat-style log */}
        <ActivityHistory entries={activeState.activity} />

        {/* Context summary */}
        <div className="border-b border-border bg-card/40 px-3 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Current context
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-foreground/85">
            Scanning <span className="font-semibold">{active.longLabel}</span> across 40 rooms × 30
            days. I detected{" "}
            <span className="font-semibold text-amber">
              ${(active.totalLeakage - activeState.recovered).toLocaleString()}
            </span>{" "}
            in recoverable revenue across{" "}
            {scenarioRemaining.channel.count +
              scenarioRemaining.shoulder.count +
              scenarioRemaining.orphan.count}{" "}
            fragmented cells.
          </p>
        </div>

        {/* If a cell is selected, show its detail at the top */}
        {selectedCell && (
          <CellDetail
            cell={selectedCell}
            canFix={canFix}
            onApply={handleApplyCell}
            onClose={onClearCell}
          />
        )}

        {/* AI Revenue Suggestions */}
        {aiRecommendations.length > 0 && (
          <div className="border-b border-border px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                AI Revenue Suggestions
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                  {aiRecommendations.filter((r) => !rejected.has(r.recommendation_id)).length}
                </span>
              </div>
              <button
                onClick={onClearRecommendations}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            </div>
            <ul className="space-y-2">
              {aiRecommendations.map((rec) => {
                const isDone = fixDone.has(rec.recommendation_id);
                const isRejected = rejected.has(rec.recommendation_id);
                const progress = fixProgress[rec.recommendation_id];
                const isFixing = progress !== undefined && !isDone;
                if (isRejected) return null;
                return (
                  <li
                    key={rec.recommendation_id}
                    className={cn(
                      "rounded-lg border bg-card/50 transition-all",
                      isDone ? "border-emerald/40 bg-emerald/5" : "border-border",
                    )}
                  >
                    <div className="p-2.5">
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          isDone ? "bg-emerald/15 text-emerald" : "bg-primary/10 text-primary",
                        )}>
                          {isDone ? <Check className="h-3 w-3" /> : <Sparkles className="h-2.5 w-2.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[11px] font-semibold leading-snug", isDone && "line-through opacity-60")}>
                            {rec.headline}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {rec.affected_dates} · <span className="text-emerald-400 font-medium">+${rec.estimated_revenue_lift.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </p>
                          {!isDone && (
                            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{rec.action}</p>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      {isFixing && (
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Applying fix…</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-75"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Fix / Reject buttons */}
                      {!isDone && !isFixing && (
                        <div className="mt-2 flex gap-1.5">
                          <Button
                            size="sm"
                            className="h-6 flex-1 bg-primary px-2 text-[10px] text-primary-foreground hover:bg-primary/90"
                            onClick={() => handleFixRec(rec)}
                          >
                            <Zap className="mr-1 h-2.5 w-2.5" />
                            Fix
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] text-muted-foreground"
                            onClick={() => handleRejectRec(rec.recommendation_id)}
                          >
                            <ThumbsDown className="mr-1 h-2.5 w-2.5" />
                            Reject
                          </Button>
                        </div>
                      )}

                      {isDone && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-emerald">
                          <Check className="h-3 w-3" />
                          Applied successfully
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Scenarios */}
        <div className="px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-amber" />
            Detected Issues
          </div>
          <ul className="space-y-2">
            {SCENARIOS.map((s) => {
              const meta = scenarioRemaining[s.kind];
              const Icon = s.icon;
              const isExplained = explainKind === s.kind;
              const cleared = meta.count === 0;
              return (
                <li
                  key={s.kind}
                  className={cn(
                    "rounded-lg border bg-card/50 transition-colors",
                    cleared
                      ? "border-emerald/40 bg-emerald/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <div className="flex items-start gap-2.5 p-2.5">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1",
                        cleared
                          ? "bg-emerald/15 text-emerald ring-emerald/30"
                          : "bg-amber/15 text-amber ring-amber/30",
                      )}
                    >
                      {cleared ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-[12px] font-semibold">{s.title}</h4>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] font-semibold tabular-nums",
                            cleared ? "text-emerald" : "text-amber",
                          )}
                        >
                          {cleared ? "Cleared" : `$${meta.amount.toLocaleString()}`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{s.subtitle}</p>
                      {!cleared && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {meta.count} affected cell{meta.count === 1 ? "" : "s"}
                        </div>
                      )}

                      {!cleared && (
                        <div className="mt-2 flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 flex-1 px-2 text-[11px]"
                            onClick={() => setExplainKind(isExplained ? null : s.kind)}
                          >
                            <Lightbulb className="mr-1 h-3 w-3" />
                            {isExplained ? "Hide" : "Recommend"}
                          </Button>
                          <Button
                            size="sm"
                            className={cn(
                              "h-7 flex-1 bg-primary px-2 text-[11px] text-primary-foreground hover:bg-primary/90",
                              !canFix && "opacity-60",
                            )}
                            onClick={() => handleFixScenario(s.kind)}
                            title={!canFix ? "Requires Property Manager" : undefined}
                          >
                            <Wand2 className="mr-1 h-3 w-3" />
                            Fix Yourself
                          </Button>
                        </div>
                      )}

                      {isExplained && !cleared && (
                        <ScenarioExplanation kind={s.kind} amount={meta.amount} />
                      )}

                      {fixedKind === s.kind && (
                        <FixResult kind={s.kind} amount={meta.amount} onDismiss={() => setFixedKind(null)} />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {!canFix && (
          <div className="mx-3 mb-3 rounded-md border border-border bg-muted/30 p-2.5 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium">
              <Eye className="h-3 w-3 text-muted-foreground" />
              Read-only · {persona.title.split(" · ")[0]}
            </div>
            <p className="mt-0.5 text-muted-foreground">
              Recommendations are visible. Escalate to a Property Manager to apply fixes.
            </p>
          </div>
        )}

        {/* Chat message history */}
        {chatHistory.length > 0 && (
          <div className="border-t border-border px-3 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              Chat
            </div>
            <div className="space-y-2">
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg p-2 text-[11px] leading-snug",
                    msg.role === "user"
                      ? "ml-4 bg-primary/10 text-foreground ring-1 ring-primary/20"
                      : "mr-4 bg-card/60 text-foreground/85 ring-1 ring-border",
                  )}
                >
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="mr-4 rounded-lg bg-card/60 p-2 text-[11px] text-muted-foreground ring-1 ring-border">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Composer — wired to backend chat endpoint */}
      <div className="border-t border-border bg-card/40 p-2.5">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendChat();
              }
            }}
            placeholder="Ask the Copilot…"
            disabled={chatLoading}
            className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim() || chatLoading}
            className="flex h-5 w-5 items-center justify-center rounded text-primary disabled:opacity-30"
            aria-label="Send"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function ScenarioExplanation({ kind, amount }: { kind: ScenarioKind; amount: number }) {
  const signals = getRecommendationSignals(kind, amount);
  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-primary/90">
        3 Signals · why I recommend this
      </div>
      {signals.map((s, i) => (
        <SignalLine key={i} signal={s} index={i + 1} />
      ))}
    </div>
  );
}

function SignalLine({ signal, index }: { signal: Signal; index: number }) {
  const Icon =
    signal.icon === "inquiries"
      ? MessageSquareX
      : signal.icon === "competitor"
        ? TrendingUp
        : History;
  return (
    <div className="flex gap-2">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
        <Icon className="h-2.5 w-2.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[11px] font-medium">
          <span className="text-muted-foreground">#{index}</span>
          {signal.title}
        </div>
        <div className="text-[10px] leading-snug text-muted-foreground">{signal.detail}</div>
      </div>
    </div>
  );
}

function getRecommendationSignals(kind: ScenarioKind, amount: number): Signal[] {
  if (kind === "channel") {
    return [
      {
        icon: "inquiries",
        title: "Booking pace",
        detail: "12 direct inquiries declined while OTA inventory remained held past 48h release",
      },
      {
        icon: "competitor",
        title: "Competitor rates",
        detail: "Comp set running $34/night above your rate — pull inventory back from OTAs",
      },
      {
        icon: "history",
        title: "Historical data",
        detail: `Last 90 days: channel re-pulls recovered $${Math.round(amount * 1.1).toLocaleString()} on average`,
      },
    ];
  }
  if (kind === "shoulder") {
    return [
      {
        icon: "inquiries",
        title: "Booking pace",
        detail: "Tue/Wed/Sun pace +24% vs forecast — current rate floor too high",
      },
      {
        icon: "competitor",
        title: "Competitor rates",
        detail: "Comp set discounted shoulder dates 12% — you're closed for sale",
      },
      {
        icon: "history",
        title: "Historical data",
        detail: "Shoulder Tuesdays sold out 4 of last 5 weeks at -8% rate adjustment",
      },
    ];
  }
  return [
    {
      icon: "inquiries",
      title: "Booking pace",
      detail: "27 one-night requests declined this month due to min-stay rules",
    },
    {
      icon: "competitor",
      title: "Reassignable inventory",
      detail: "Adjacent rooms available — guest shuffles average +$310 recovered",
    },
    {
      icon: "history",
      title: "Historical data",
      detail: "Lowering min-stay to 1 on orphan nights fills 87% within 24h",
    },
  ];
}

function FixResult({ kind, amount, onDismiss }: { kind: ScenarioKind; amount: number; onDismiss: () => void }) {
  const labelMap: Record<ScenarioKind, string> = {
    channel: "Channel blockage cleared",
    shoulder: "Shoulder nights re-opened",
    orphan: "Orphan nights stitched",
  };
  
  const details: Record<ScenarioKind, string> = {
    channel: "Inventory retrieved from all OTA partners and returned to direct channel",
    shoulder: "Rate restrictions lifted and inventory opened for Tue/Wed/Sun bookings",
    orphan: "Min-stay rules adjusted; rooms reassigned to adjacent units where available",
  };

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-emerald/30 bg-emerald/5 p-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-emerald/90">
          ✓ Fix Applied
        </div>
        <button
          onClick={onDismiss}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-emerald">{labelMap[kind]}</div>
        <div className="text-[10px] leading-snug text-muted-foreground">{details[kind]}</div>
        <div className="text-[10px] font-semibold text-emerald pt-1">
          +${amount.toLocaleString()} recovered
        </div>
      </div>
    </div>
  );
}

function CellDetail({
  cell,
  canFix,
  onApply,
  onClose,
}: {
  cell: RoomNight;
  canFix: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-border bg-amber/5 px-3 py-3">
      <div className="flex items-start justify-between">
        <div>
          <Badge className="bg-amber/15 text-amber hover:bg-amber/20">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Cell selected
          </Badge>
          <div className="mt-1.5 text-[12px] font-semibold">
            Room {cell.roomNumber} · {cell.weekday}, {cell.date}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {cell.roomType} · ${cell.rate}/night · min-stay {cell.minStay}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 rounded-md border border-amber/30 bg-amber/10 p-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-amber/90">
          Revenue impact
        </div>
        <div className="text-lg font-semibold tabular-nums text-amber">${cell.lostRevenue}</div>
      </div>

      <div className="mt-2 space-y-1">
        {cell.signals.map((s, i) => (
          <SignalLine key={i} signal={s} index={i + 1} />
        ))}
      </div>

      <Button
        onClick={onApply}
        disabled={!canFix}
        size="sm"
        className="mt-2.5 w-full bg-primary text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        <Check className="mr-1 h-3 w-3" />
        {cell.actionLabel} · 1-click fix
        <ChevronRight className="ml-auto h-3 w-3" />
      </Button>
    </div>
  );
}
