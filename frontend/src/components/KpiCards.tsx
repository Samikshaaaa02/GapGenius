import * as React from "react";
import CountUp from "react-countup";
import { ArrowUpRight, BedDouble, DoorOpen, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInventory } from "@/context/InventoryContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RoomNight } from "@/data/mockInventory";

type Variant = "booked" | "available" | "blocked";

interface KpiCardProps {
  variant: Variant;
  value: number;
  total: number;
  leakage: number;
  recoveredPortion?: number;
  cells: RoomNight[];
}

const META: Record<
  Variant,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    ring: string;
    bar: string;
  }
> = {
  booked: {
    label: "Booked",
    icon: BedDouble,
    tone: "text-emerald",
    ring: "ring-emerald/30",
    bar: "bg-emerald",
  },
  available: {
    label: "Unbooked",
    icon: DoorOpen,
    tone: "text-rose",
    ring: "ring-rose/30",
    bar: "bg-rose",
  },
  blocked: {
    label: "Blocked",
    icon: Lock,
    tone: "text-amber",
    ring: "ring-amber/30",
    bar: "bg-amber",
  },
};

const ROOM_TYPE_ORDER: RoomNight["roomType"][] = [
  "Standard King",
  "Deluxe Queen",
  "Suite",
  "Executive",
];

export function KpiCard({
  variant,
  value,
  total,
  leakage,
  recoveredPortion = 0,
  cells,
}: KpiCardProps) {
  const meta = META[variant];
  const Icon = meta.icon;
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  const bars = React.useMemo(
    () => Array.from({ length: 14 }, (_, i) => 30 + ((i * 17 + variant.length * 5) % 70)),
    [variant],
  );

  const breakdown = React.useMemo(() => {
    const counts = new Map<RoomNight["roomType"], { count: number; revenue: number }>();
    ROOM_TYPE_ORDER.forEach((t) => counts.set(t, { count: 0, revenue: 0 }));
    cells.forEach((c) => {
      const rec = counts.get(c.roomType)!;
      rec.count += 1;
      rec.revenue += variant === "blocked" ? c.lostRevenue : c.rate;
    });
    return ROOM_TYPE_ORDER.map((t) => ({ type: t, ...counts.get(t)! }));
  }, [cells, variant]);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card/60 p-4 transition-all duration-200",
        "hover:bg-card hover:shadow-[0_8px_30px_-10px_color-mix(in_oklab,var(--primary)_30%,transparent)]",
        "focus-within:ring-2",
        meta.ring,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md bg-background/40 ring-1",
              meta.ring,
            )}
          >
            <Icon className={cn("h-4 w-4", meta.tone)} />
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {meta.label}
            </div>
            <div className="text-[10px] text-muted-foreground/70">Room-nights · {pct}%</div>
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex translate-y-1 items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] font-medium opacity-0 transition-all",
                "group-hover:translate-y-0 group-hover:opacity-100 hover:bg-background",
              )}
            >
              View Details
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-72 border-border bg-popover/95 p-0 backdrop-blur"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md bg-background/40 ring-1",
                  meta.ring,
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", meta.tone)} />
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider">
                  {meta.label} · By Room Type
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {value.toLocaleString()} room-nights total
                </div>
              </div>
            </div>
            <div className="divide-y divide-border/60">
              {breakdown.map((b) => {
                const share = value > 0 ? Math.round((b.count / value) * 100) : 0;
                return (
                  <div key={b.type} className="px-3 py-2">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium">{b.type}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {b.count.toLocaleString()}{" "}
                        <span className="text-muted-foreground/60">({share}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background/60">
                      <div
                        className={cn("h-full rounded-full", meta.bar)}
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {variant === "blocked" ? "Revenue at risk" : "Avg rate basis"}
                      </span>
                      <span className={cn("tabular-nums", variant === "blocked" && meta.tone)}>
                        ${b.revenue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {variant === "blocked" && recoveredPortion > 0 && (
              <div className="flex items-center justify-between border-t border-border bg-emerald/10 px-3 py-2 text-[11px]">
                <span className="text-emerald">Recovered so far</span>
                <span className="tabular-nums font-semibold text-emerald">
                  ${recoveredPortion.toLocaleString()}
                </span>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold tabular-nums tracking-tight">
            <CountUp end={value} duration={1.4} separator="," preserveValue />
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            of <span className="tabular-nums text-foreground/80">{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex h-10 items-end gap-[2px] opacity-60 transition-opacity group-hover:opacity-100">
          {bars.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className={cn("w-[3px] rounded-sm", meta.bar, "opacity-70")}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-[11px]">
        <div>
          <div className="text-muted-foreground">Revenue Leakage</div>
          <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", meta.tone)}>
            ${leakage.toLocaleString()}
          </div>
        </div>
        {variant === "blocked" && (
          <div>
            <div className="text-muted-foreground">Recovered</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald">
              ${recoveredPortion.toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function KpiRow() {
  const { active, activeState } = useInventory();
  const total = active.bookedCount + active.availableCount + active.blockedCount;
  const fixedCount = activeState.appliedFixes.size;
  const blockedNow = active.blockedCount - fixedCount;
  const availableNow = active.availableCount + fixedCount;

  const inv = activeState.inventory;
  const bookedCells = React.useMemo(() => inv.filter((c) => c.status === "booked"), [inv]);
  const availableCells = React.useMemo(() => inv.filter((c) => c.status === "available"), [inv]);
  const blockedCells = React.useMemo(() => inv.filter((c) => c.status === "fragmented"), [inv]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        variant="booked"
        value={active.bookedCount}
        total={total}
        leakage={0}
        cells={bookedCells}
      />
      <KpiCard
        variant="available"
        value={availableNow}
        total={total}
        leakage={0}
        cells={availableCells}
      />
      <KpiCard
        variant="blocked"
        value={blockedNow}
        total={total}
        leakage={active.totalLeakage - activeState.recovered}
        recoveredPortion={activeState.recovered}
        cells={blockedCells}
      />
    </div>
  );
}
