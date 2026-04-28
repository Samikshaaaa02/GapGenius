import * as React from "react";
import * as ReactDOM from "react-dom";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInventory } from "@/context/InventoryContext";
import { usePersona } from "@/context/PersonaContext";
import { MiniHeatmap } from "@/components/MiniHeatmap";
import { KpiRow } from "@/components/KpiCards";
import { TotalSavedCounter } from "@/components/TotalSavedCounter";
import { HotelSelector, HOTELS } from "@/components/HotelSelector";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { MonthKey, RoomNight, UploadBooking, UploadOrphanGap } from "@/data/mockInventory";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Bot,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Upload,
  ScanSearch,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  analyzeBookings,
  getAIRecommendations,
  type OrphanGap,
  type RebundleOpportunity,
  type CapacityScore,
  type AIRecommendation,
} from "@/api/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · GapGenius" },
      {
        name: "description",
        content:
          "Carousel-based fragmentation heatmap, KPI cards and an integrated AI Copilot for hotel revenue managers.",
      },
      { property: "og:title", content: "GapGenius · Hotel Revenue Intelligence" },
      {
        property: "og:description",
        content:
          "VS Code-style workspace where AI surfaces fragmented availability and recovers revenue with 1-click fixes.",
      },
    ],
  }),
  component: DashboardPage,
});

const MONTH_ORDER: MonthKey[] = ["previous", "current", "next"];


interface MLState {
  running: boolean;
  gaps: OrphanGap[];
  opportunities: RebundleOpportunity[];
  score: CapacityScore | null;
  ran: boolean;
}

interface AIState {
  running: boolean;
  recommendations: AIRecommendation[];
  summary: string;
  open: boolean;
}

function DashboardPage() {
  const { active, activeState, reset, setActiveMonth, activeMonth, months, loadRealData } = useInventory();
  const { can, persona } = usePersona();

  const canRun = can("runOptimization");
  const readOnly = !canRun;

  const [hotelId, setHotelId] = React.useState<string>("downtown");
  const [api, setApi] = React.useState<CarouselApi | null>(null);

  const [ml, setMl] = React.useState<MLState>({
    running: false, gaps: [], opportunities: [], score: null, ran: false,
  });
  const [ai, setAi] = React.useState<AIState>({
    running: false, recommendations: [], summary: "", open: false,
  });

  const activeHotel = HOTELS.find((h) => h.id === hotelId) ?? HOTELS[0];

  // Sync carousel position with the active month in the InventoryContext
  React.useEffect(() => {
    if (!api) return;
    const idx = MONTH_ORDER.indexOf(activeMonth);
    if (idx >= 0 && api.selectedScrollSnap() !== idx) api.scrollTo(idx);
  }, [api, activeMonth]);

  // When user swipes/clicks carousel, update the active month
  React.useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const idx = api.selectedScrollSnap();
      const key = MONTH_ORDER[idx];
      if (key && key !== activeMonth) setActiveMonth(key);
    };
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, activeMonth, setActiveMonth]);

  // Selected cell broadcast for the Copilot panel mounted in __root.tsx
  const setSelectedCell = (cell: RoomNight) => {
    window.dispatchEvent(new CustomEvent("copilot:select-cell", { detail: cell }));
    window.dispatchEvent(new CustomEvent("copilot:open"));
  };

  const handleDetectGaps = async () => {
    if (!canRun) {
      toast.error("Read-only access", {
        description: `${persona.name} can view inventory but not run analysis.`,
      });
      return;
    }

    // Read bookings from localStorage
    let bookings: UploadBooking[] = [];
    try {
      const raw = localStorage.getItem("gg:upload-data");
      console.log("[GG:detect] gg:upload-data raw length:", raw?.length ?? 0);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.bookings)) bookings = parsed.bookings;
        console.log("[GG:detect] gg:upload-data bookings:", bookings.length, "orphanGaps:", parsed.orphanGaps?.length ?? 0);
      }
    } catch (e) { console.warn("[GG:detect] gg:upload-data parse error", e); }

    if (bookings.length === 0) {
      try {
        const raw = localStorage.getItem("gg:bookings");
        console.log("[GG:detect] gg:bookings fallback raw length:", raw?.length ?? 0);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved)) bookings = saved.map((b: Record<string, unknown>) => ({
            room_number: String(b.room_number ?? ""),
            room_type:   String(b.room_type   ?? ""),
            check_in:    String(b.check_in    ?? ""),
            check_out:   String(b.check_out   ?? ""),
            rate:        Number(b.rate        ?? 0),
            guest_name:  b.guest_name ? String(b.guest_name) : undefined,
            status:      String(b.status      ?? "confirmed"),
          }));
          console.log("[GG:detect] gg:bookings fallback bookings:", bookings.length);
        }
      } catch (e) { console.warn("[GG:detect] gg:bookings parse error", e); }
    }

    if (bookings.length === 0) {
      toast.error("No booking data", { description: "Upload a bookings CSV first." });
      return;
    }

    console.log("[GG:detect] Sending", bookings.length, "bookings to /api/analyze-bookings");
    console.log("[GG:detect] Sample booking[0]:", bookings[0]);
    setMl((s) => ({ ...s, running: true }));
    try {
      const result = await analyzeBookings(bookings, 2, activeHotel.name);
      console.log("[GG:detect] Response:", JSON.stringify(result).slice(0, 500));
      if (!result.success) throw new Error(result.error ?? "Analysis failed");

      // Convert backend OrphanGap list to UploadOrphanGap format for loadRealData
      const uploadGaps: UploadOrphanGap[] = result.orphan_gaps.map((g) => ({
        room_id:                g.room_id,
        start_date:             g.start_date,
        end_date:               g.end_date,
        gap_length_nights:      g.gap_length_nights,
        estimated_lost_revenue: g.estimated_lost_revenue,
      }));
      console.log("[GG:detect] Detected gaps:", result.orphan_gaps.length, "uploadGaps:", uploadGaps.length);

      // Reload heatmap with real orphan gaps highlighted
      loadRealData(bookings, uploadGaps);

      setMl({
        running: false,
        gaps: result.orphan_gaps,
        opportunities: result.opportunities,
        score: result.score_before ?? null,
        ran: true,
      });

      const gapCount = result.orphan_gaps.length;
      const lost = result.score_before?.estimated_lost_revenue ?? 0;
      toast.success(`${gapCount} orphan gap${gapCount === 1 ? "" : "s"} detected`, {
        description: `$${lost.toLocaleString(undefined, { maximumFractionDigits: 0 })} estimated at risk · click AI Suggestions for fixes`,
      });
    } catch (err) {
      console.error("[GG:detect] Error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("ML analysis failed", { description: msg });
      setMl((s) => ({ ...s, running: false }));
    }
  };

  const handleAISuggestions = async () => {
    console.log("[GG:ai] ml.ran:", ml.ran, "ml.gaps.length:", ml.gaps.length, "ml.score:", ml.score);
    if (!ml.ran || ml.gaps.length === 0) {
      toast.error("Run Detect Orphan Gaps first");
      return;
    }
    if (!ml.score) {
      console.error("[GG:ai] ml.score is null — cannot proceed");
      return;
    }

    console.log("[GG:ai] Sending to /api/ai-recommendations:");
    console.log("[GG:ai]   gaps:", ml.gaps.length, "| sample gap:", JSON.stringify(ml.gaps[0]));
    console.log("[GG:ai]   opportunities:", ml.opportunities.length);
    console.log("[GG:ai]   score_before:", ml.score);
    console.log("[GG:ai]   hotel_name:", activeHotel.name);

    setAi((s) => ({ ...s, running: true, open: true }));
    try {
      const result = await getAIRecommendations(
        ml.gaps,
        ml.opportunities,
        ml.score,
        activeHotel.name,
      );
      console.log("[GG:ai] Raw response success:", result.success);
      console.log("[GG:ai] recommendations count:", result.recommendations?.length);
      console.log("[GG:ai] executive_summary:", result.executive_summary?.slice(0, 120));
      if (result.error) console.error("[GG:ai] Backend error field:", result.error);
      if (!result.success) throw new Error(result.error ?? "AI failed");
      setAi({ running: false, recommendations: result.recommendations, summary: result.executive_summary, open: true });
    } catch (err) {
      console.error("[GG:ai] Caught error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("AI Suggestions failed", { description: msg });
      setAi((s) => ({ ...s, running: false }));
    }
  };

  const hasData = activeState.inventory.length > 0;

  return (
    <div className="flex w-full flex-col pb-10">
      {/* Workspace header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/30 px-5 py-3">
        <div className="flex items-center gap-3">
          <HotelSelector value={hotelId} onChange={setHotelId} />
          <div className="hidden h-9 w-px bg-border md:block" />
          <div className="hidden md:block">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Bot className="h-3 w-3 text-primary" />
              GapGenius
            </div>
            <h1 className="mt-0.5 text-base font-semibold">
              Workspace · {active.longLabel}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald shadow-[0_0_6px_var(--emerald)]" />
            {activeHotel.rooms} rooms · Connected
          </span>
          {readOnly && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
              <Eye className="h-3 w-3" />
              Read-only
            </span>
          )}
          {ml.ran && canRun && (
            <Button variant="ghost" size="sm" onClick={() => { reset(); setMl({ running: false, gaps: [], opportunities: [], score: null, ran: false }); }}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
          )}

          {/* Button 1: Detect Orphan Gaps (ML backend) */}
          <Button
            onClick={handleDetectGaps}
            disabled={ml.running || readOnly}
            size="sm"
            variant="outline"
            className={cn(
              "border-primary/40 text-primary hover:bg-primary/10",
              ml.ran && "border-emerald/60 text-emerald hover:bg-emerald/10",
            )}
          >
            {ml.ran
              ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              : <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
            }
            {ml.running ? "Detecting…" : ml.ran ? `${ml.gaps.length} Gaps Found` : "Detect Orphan Gaps"}
          </Button>

          {/* Button 2: AI Suggestions (LLM backend) */}
          <Button
            onClick={handleAISuggestions}
            disabled={!ml.ran || ai.running || readOnly}
            size="sm"
            className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[0_4px_20px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)] hover:from-primary hover:to-primary/80 disabled:opacity-40"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {ai.running ? "Thinking…" : "AI Suggestions"}
          </Button>
        </div>
      </header>

      {!hasData ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <CalendarDays className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <h2 className="text-base font-semibold">No booking data yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Upload a bookings CSV from the Bookings page to see the fragmentation heatmap, KPI cards, and AI recovery analysis.
            </p>
          </div>
          <Link to="/portfolio">
            <Button size="sm" className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Go to Bookings
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* ML result banner */}
          {ml.ran && ml.score && (
            <div className="mx-5 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-[12px]">
              <div className="flex items-center gap-1.5 font-medium text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Orphan Gap Analysis
              </div>
              <StatPill label="Gaps" value={String(ml.score.orphan_gap_nights)} />
              <StatPill label="Fragmentation" value={`${ml.score.fragmentation_rate}%`} />
              <StatPill label="At Risk" value={`$${ml.score.estimated_lost_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <StatPill label="Opportunities" value={String(ml.opportunities.length)} />
            </div>
          )}

          {/* Bento grid: KPIs + Total Saved */}
          <section className="grid grid-cols-1 gap-3 p-5 lg:grid-cols-4">
            <div className="lg:col-span-3">
              <KpiRow />
            </div>
            <div className="h-full">
              <TotalSavedCounter />
            </div>
          </section>

          {/* Heatmap Carousel */}
          <section className="flex flex-col gap-3 px-5 pb-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Fragmentation Heatmap</h2>
                <p className="text-[11px] text-muted-foreground">
                  30 days × 40 rooms · navigate months with the arrows · hover any cell for details
                </p>
              </div>
              <div className="flex items-center gap-3">
                <MonthDots
                  activeMonth={activeMonth}
                  onSelect={(k) => {
                    setActiveMonth(k);
                    api?.scrollTo(MONTH_ORDER.indexOf(k));
                  }}
                  months={months}
                />
                <Legend />
              </div>
            </div>

            {/* Active card centred at 78%, adjacent months peek ~11% each side */}
            <div className="relative mx-auto w-full flex items-center justify-center gap-6">
              {/* Left Arrow */}
              <button
                onClick={() => api?.scrollPrev()}
                disabled={!api?.canScrollPrev()}
                aria-label="Previous month"
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-card/90 text-primary shadow-lg backdrop-blur-sm transition-all",
                  "hover:scale-110 hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100",
                )}
              >
                <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
              </button>

              <Carousel
                setApi={setApi}
                opts={{
                  align: "center",
                  loop: false,
                  startIndex: MONTH_ORDER.indexOf(activeMonth),
                  containScroll: false,
                }}
                className="w-full flex-1"
              >
                <CarouselContent className="-ml-4">
                  {MONTH_ORDER.map((key) => (
                    <CarouselItem key={key} className="basis-[50%] pl-4">
                      <div
                        className="transition-all duration-300"
                        style={{
                          opacity:   key === activeMonth ? 1 : 0.4,
                          transform: key === activeMonth ? "scale(1)" : "scale(0.94)",
                          transformOrigin: "center top",
                          filter: key === activeMonth ? "none" : "blur(0.5px)",
                        }}
                      >
                        <MiniHeatmap
                          monthKey={key}
                          onCellSelect={setSelectedCell}
                          compact={false}
                          isActive={key === activeMonth}
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>

              {/* Right Arrow */}
              <button
                onClick={() => api?.scrollNext()}
                disabled={!api?.canScrollNext()}
                aria-label="Next month"
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-card/90 text-primary shadow-lg backdrop-blur-sm transition-all",
                  "hover:scale-110 hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100",
                )}
              >
                <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
              </button>
            </div>
          </section>
        </>
      )}

      {ai.open && ReactDOM.createPortal(
        <AIRecommendationsModal
          running={ai.running}
          recommendations={ai.recommendations}
          summary={ai.summary}
          score={ml.score}
          onCancel={() => setAi((s) => ({ ...s, open: false }))}
          onFixInCopilot={() => {
            setAi((s) => ({ ...s, open: false }));
            window.dispatchEvent(new CustomEvent("copilot:ai-recommendations", { detail: ai.recommendations }));
          }}
        />,
        document.body,
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  );
}

function AIRecommendationsModal({
  running,
  recommendations,
  summary,
  score,
  onCancel,
  onFixInCopilot,
}: {
  running: boolean;
  recommendations: AIRecommendation[];
  summary: string;
  score: CapacityScore | null;
  onCancel: () => void;
  onFixInCopilot: () => void;
}) {
  const totalLift = recommendations.reduce((s, r) => s + r.estimated_revenue_lift, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">AI Revenue Suggestions</h2>
            <p className="text-[11px] text-muted-foreground">
              {running ? "Analysing gaps…" : `${recommendations.length} suggestions · +$${totalLift.toLocaleString(undefined, { maximumFractionDigits: 0 })} potential recovery`}
            </p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {running ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Sparkles className="h-8 w-8 animate-pulse text-primary" />
              <p className="text-sm text-muted-foreground">Generating revenue recommendations…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Executive summary */}
              {summary && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Executive Summary</p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{summary}</p>
                </div>
              )}

              {/* Compact rec list */}
              {recommendations.map((rec, i) => (
                <div key={rec.recommendation_id} className="flex items-start gap-3 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold leading-snug">{rec.headline}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{rec.affected_dates} · {rec.affected_rooms.slice(0, 3).join(", ")}{rec.affected_rooms.length > 3 ? ` +${rec.affected_rooms.length - 3}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-emerald-400">
                    +${rec.estimated_revenue_lift.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {!running && (
          <div className="flex items-center gap-3 border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
              onClick={onFixInCopilot}
              disabled={recommendations.length === 0}
            >
              <Bot className="mr-1.5 h-3.5 w-3.5" />
              Fix in Copilot
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MonthDots({
  activeMonth,
  onSelect,
  months,
}: {
  activeMonth: MonthKey;
  onSelect: (k: MonthKey) => void;
  months: ReturnType<typeof useInventory>["months"];
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-1.5 py-1">
      {MONTH_ORDER.map((k) => {
        const active = k === activeMonth;
        return (
          <button
            key={k}
            onClick={() => onSelect(k)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {months[k].label}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  const items: { label: string; style: React.CSSProperties }[] = [
    { label: "Booked",     style: { background: "oklch(0.64 0.16 160)" } },
    { label: "Available",  style: { background: "transparent", border: "1px solid oklch(0.42 0.03 256)" } },
    { label: "Orphan Gap", style: { background: "oklch(0.81 0.19 78)" } },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={it.style} />
          {it.label}
        </div>
      ))}
    </div>
  );
}
