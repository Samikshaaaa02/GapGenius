import * as React from "react";
import { cn } from "@/lib/utils";
import { useInventory } from "@/context/InventoryContext";
import type { MonthKey, RoomNight } from "@/data/mockInventory";

interface Props {
  monthKey: MonthKey;
  onCellSelect?: (cell: RoomNight) => void;
  compact?: boolean;
  isActive?: boolean;
}

interface TooltipInfo {
  cell: RoomNight;
  x: number;
  y: number;
}

const CELL_GAP = 2;
const LABEL_W  = 28; // day-label column width
const INNER_P  = 12; // p-1.5 = 6px each side
const CARD_P   = 24; // p-3 = 12px each side

const C_BOOKED    = "oklch(0.64 0.16 160)";
const C_AVAILABLE = "oklch(0.24 0.028 256)";
const C_FRAG      = "oklch(0.81 0.19 78)";
const C_FRAG_GLOW = "oklch(0.81 0.19 78 / 55%)";

export function MiniHeatmap({ monthKey, onCellSelect, compact = false, isActive = true }: Props) {
  const { months, state, activeMonth, setActiveMonth } = useInventory();
  const month    = months[monthKey];
  const ms       = state[monthKey];
  const isCurrentActive = activeMonth === monthKey;

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [cellH,   setCellH]   = React.useState(12);
  const [tooltip, setTooltip] = React.useState<TooltipInfo | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [isTransposed, setIsTransposed] = React.useState(false);

  // Compute square cell side from card width ÷ room columns, max 16px
  React.useEffect(() => {
    if (!wrapRef.current) return;
    const calc = () => {
      if (!wrapRef.current) return;
      const avail = wrapRef.current.offsetWidth - CARD_P - LABEL_W - INNER_P - (39 * CELL_GAP);
      setCellH(Math.min(Math.max(Math.floor(avail / Math.max(1, month.roomNumbers.length)), 5), 16));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [month.roomNumbers.length]);

  React.useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 80);
    return () => window.clearTimeout(id);
  }, []);

  const cellMap = React.useMemo(() => {
    const m = new Map<string, RoomNight>();
    ms.inventory.forEach((c) => m.set(c.id, c));
    return m;
  }, [ms.inventory]);

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isActive) { setTooltip(null); return; }
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cid]");
      if (!el || !wrapRef.current) { setTooltip(null); return; }
      const cell = cellMap.get(el.dataset.cid!);
      if (!cell) return;
      const cr = el.getBoundingClientRect();
      const wr = wrapRef.current.getBoundingClientRect();
      setTooltip({ cell, x: cr.left - wr.left + cr.width / 2, y: cr.top - wr.top });
    },
    [cellMap, isActive],
  );

  const handleMouseLeave = React.useCallback(() => setTooltip(null), []);

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cid]");
      if (!el) return;
      const cell = cellMap.get(el.dataset.cid!);
      if (!cell || cell.status !== "fragmented") return;
      e.stopPropagation();
      onCellSelect?.(cell);
    },
    [cellMap, onCellSelect],
  );

  const fragCount = ms.inventory.filter((c) => c.status === "fragmented").length;
  const leakage   = month.totalLeakage - ms.recovered;

  // Room columns, each 1fr so grid fills full card width
  const colTemplate = `${LABEL_W}px repeat(${month.roomNumbers.length}, 1fr)`;
  // 30 day rows
  const maxGridH = compact ? 180 : month.days.length * (cellH + CELL_GAP) + 28;

  const ttipStyle = React.useMemo((): React.CSSProperties => {
    if (!tooltip || !wrapRef.current) return { display: "none" };
    const maxLeft = wrapRef.current.offsetWidth - 216;
    const left    = Math.max(4, Math.min(tooltip.x - 108, maxLeft));
    const top     = tooltip.y < 140 ? tooltip.y + cellH + 8 : tooltip.y - 130;
    return { left, top: Math.max(4, top) };
  }, [tooltip, cellH]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative flex flex-col rounded-xl border bg-card/40 p-3 transition-all duration-200 select-none cursor-pointer",
        isCurrentActive
          ? "border-primary/60 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_40%,transparent),0_8px_32px_-10px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
          : "border-border hover:border-primary/30",
      )}
      onClick={() => setActiveMonth(monthKey)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setActiveMonth(monthKey);
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full transition-all",
            isCurrentActive ? "bg-primary shadow-[0_0_8px_var(--primary)]" : "bg-muted-foreground/35",
          )} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            {monthKey === "current" ? "Current" : monthKey === "previous" ? "Previous" : "Next"}
          </span>
          <span className="text-[10px] text-muted-foreground">{month.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {fragCount > 0 && (
            <span className="rounded px-1.5 py-0.5 text-[9px] tabular-nums ring-1 ring-amber/30 bg-amber/10 text-amber">
              {fragCount} gaps
            </span>
          )}
          <span className="tabular-nums text-[11px] font-semibold text-amber">
            −${leakage.toLocaleString()}
          </span>
        </div>
      </header>

      {/* ── Grid: rows = days (30), columns = rooms ─────────────────────────── */}
      <div
        className="overflow-hidden rounded-lg border border-border/30 bg-[oklch(0.15_0.02_256)]"
        onClick={(e) => e.stopPropagation()}
      >
        {month.roomNumbers.length === 0 ? (
          <div
            className="flex items-center justify-center text-[10px] text-muted-foreground/60"
            style={{ height: maxGridH }}
          >
            No data
          </div>
        ) : (
          <div
            className="overflow-y-auto scrollbar-thin"
            style={{ maxHeight: maxGridH }}
          >
            <div
              className="p-1.5"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
            >
              {isTransposed ? (
                <>
                  {/* Transposed: Rooms as rows, Days as columns */}
                  <div
                    className="sticky top-0 z-10 mb-[2px] bg-[oklch(0.15_0.02_256)] backdrop-blur-sm"
                    style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(${month.days.length}, 1fr)`, gap: `${CELL_GAP}px` }}
                  >
                    <div /> {/* room-label column */}
                    {month.days.map((day, dIdx) => (
                      <div
                        key={dIdx}
                        className="text-center leading-none"
                        style={{ fontSize: "9px", paddingBottom: "3px", color: C_FRAG }}
                      >
                        {(day.dayOfMonth === 1 || day.dayOfMonth % 7 === 0) ? day.dayOfMonth : ""}
                      </div>
                    ))}
                  </div>

                  {/* Room rows */}
                  {month.roomNumbers.map((roomNumber, rIdx) => (
                    <div
                      key={roomNumber}
                      style={{
                        display: "grid",
                        gridTemplateColumns: `${LABEL_W}px repeat(${month.days.length}, 1fr)`,
                        gap: `${CELL_GAP}px`,
                        marginBottom: `${CELL_GAP}px`,
                      }}
                    >
                      {/* Room label */}
                      <div className="flex items-center justify-end pr-1" style={{ width: LABEL_W }}>
                        {(roomNumber - 101) % 10 === 0 && (
                          <span
                            style={{ fontSize: "9px", color: C_FRAG }}
                            className="font-mono leading-none tabular-nums"
                          >
                            {roomNumber}
                          </span>
                        )}
                      </div>

                      {/* Day cells for this room */}
                      {month.days.map((day, dIdx) => {
                        const cid  = `${monthKey}-r${roomNumber}-d${dIdx}`;
                        const cell = cellMap.get(cid);
                        if (!cell) return (
                          <div key={dIdx} style={{ height: cellH, borderRadius: 2 }} className="bg-muted/10" />
                        );
                        return (
                          <HeatCell key={cid} cell={cell} cellH={cellH} mounted={mounted} rowDelay={rIdx} />
                        );
                      })}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {/* Original: Days as rows, Rooms as columns */}
                  {/* Room-number header row */}
                  <div
                    className="sticky top-0 z-10 mb-[2px] bg-[oklch(0.15_0.02_256)] backdrop-blur-sm"
                    style={{ display: "grid", gridTemplateColumns: colTemplate, gap: `${CELL_GAP}px` }}
                  >
                    <div /> {/* day-label column */}
                    {month.roomNumbers.map((roomNumber) => (
                      <div
                        key={roomNumber}
                        className="text-center leading-none"
                        style={{ fontSize: "9px", paddingBottom: "3px", color: C_FRAG }}
                      >
                        {/* show every 10th: 101, 111, 121, 131 */}
                        {(roomNumber - 101) % 10 === 0 ? roomNumber : ""}
                      </div>
                    ))}
                  </div>

                  {/* Day rows */}
                  {month.days.map((day, dIdx) => (
                    <div
                      key={dIdx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: colTemplate,
                        gap: `${CELL_GAP}px`,
                        marginBottom: `${CELL_GAP}px`,
                      }}
                    >
                      {/* Day label */}
                      <div className="flex items-center justify-end pr-1" style={{ width: LABEL_W }}>
                        {(day.dayOfMonth === 1 || day.dayOfMonth % 7 === 0) && (
                          <span
                            style={{ fontSize: "9px", color: C_FRAG }}
                            className="font-mono leading-none tabular-nums"
                          >
                            {day.dayOfMonth}
                          </span>
                        )}
                      </div>

                      {/* Room cells for this day */}
                      {month.roomNumbers.map((roomNumber) => {
                        const cid  = `${monthKey}-r${roomNumber}-d${dIdx}`;
                        const cell = cellMap.get(cid);
                        if (!cell) return (
                          <div key={roomNumber} style={{ height: cellH, borderRadius: 2 }} className="bg-muted/10" />
                        );
                        return (
                          <HeatCell key={cid} cell={cell} cellH={cellH} mounted={mounted} rowDelay={dIdx} />
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Tooltip ────────────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 w-52 rounded-lg border border-border/60 bg-card/95 px-2.5 py-2 shadow-2xl backdrop-blur-md"
          style={ttipStyle}
        >
          <CellTooltip cell={tooltip.cell} />
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LegendPip color={C_BOOKED}    label="Booked" />
            <LegendPip color={C_AVAILABLE} label="Free"   outline />
            <LegendPip color={C_FRAG}      label="Orphan" />
          </div>
          {isCurrentActive && (
            <button
              onClick={() => setIsTransposed(!isTransposed)}
              className="rounded px-2 py-1 text-[9px] font-medium transition-colors ring-1 ring-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:ring-primary/50"
              title="Transpose: swap rows and columns"
            >
              ⇄ Transpose
            </button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="tabular-nums text-[9px] text-muted-foreground/50">
            {ms.recovered > 0
              ? `+$${ms.recovered.toLocaleString()} recovered`
              : `30 days × ${month.roomNumbers.length} rooms`}
          </span>
          {isCurrentActive && (
            <span className="text-[8px] text-muted-foreground/60">
              {isTransposed ? "Rooms × Days" : "Days × Rooms"}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

function LegendPip({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
      <span style={{
        width: 8, height: 8, borderRadius: 2,
        background: outline ? "transparent" : color,
        border: outline ? `1px solid oklch(0.42 0.03 256)` : "none",
      }} />
      {label}
    </div>
  );
}

function CellTooltip({ cell }: { cell: RoomNight }) {
  const statusColor =
    cell.status === "booked" ? C_BOOKED
    : cell.status === "fragmented" ? C_FRAG
    : "oklch(0.55 0.02 256)";
  return (
    <div className="text-[11px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">Room {cell.roomNumber}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-medium capitalize"
          style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}
        >
          {cell.status === "fragmented" ? "Orphan Gap" : cell.status}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mb-1">{cell.roomType} · {cell.date}</div>
      <div className="text-[10px] text-muted-foreground/60 mb-1.5">${cell.rate}/night · min-stay {cell.minStay}</div>
      {cell.status === "booked" && cell.guestName && (
        <div className="text-[10px]" style={{ color: C_BOOKED }}>✓ {cell.guestName}</div>
      )}
      {cell.status === "fragmented" && (
        <div>
          <div className="font-semibold mb-0.5" style={{ color: C_FRAG }}>−${cell.lostRevenue} lost revenue</div>
          <div className="text-[9px] text-muted-foreground">Click to view AI recommendation →</div>
        </div>
      )}
    </div>
  );
}

const HeatCell = React.memo(function HeatCell({
  cell, cellH, mounted, rowDelay,
}: {
  cell: RoomNight; cellH: number; mounted: boolean; rowDelay: number;
}) {
  const [flipped, setFlipped] = React.useState(false);
  const prev = React.useRef(cell.status);

  React.useEffect(() => {
    if (prev.current === "fragmented" && cell.status === "available") {
      setFlipped(true);
      const t = window.setTimeout(() => setFlipped(false), 400);
      return () => window.clearTimeout(t);
    }
    prev.current = cell.status;
  }, [cell.status]);

  const isFrag   = cell.status === "fragmented";
  const isBooked = cell.status === "booked";
  const bg       = isBooked ? C_BOOKED : isFrag ? C_FRAG : C_AVAILABLE;
  const delay    = Math.min(rowDelay * 12, 240);

  return (
    <div
      data-cid={cell.id}
      style={{
        height: cellH,
        borderRadius: Math.max(1, cellH * 0.18),
        background: bg,
        boxShadow: isFrag
          ? `0 0 ${cellH * 0.6}px 2px ${C_FRAG_GLOW}`
          : isBooked ? `inset 0 1px 0 oklch(0.78 0.12 160 / 30%)` : "none",
        opacity:   mounted ? 1 : 0,
        transform: mounted ? "scale(1)" : "scale(0.4)",
        transitionProperty: "opacity, transform, box-shadow, filter",
        transitionDuration: mounted ? "160ms" : "0ms",
        transitionTimingFunction: "cubic-bezier(0.34, 1.2, 0.64, 1)",
        transitionDelay: mounted ? `${delay}ms` : "0ms",
        cursor: isFrag ? "pointer" : "default",
      }}
      className={cn(
        isFrag   && "animate-amber-pulse heatcell-frag",
        flipped  && "animate-cell-flip",
        isBooked && "heatcell-booked",
      )}
    />
  );
});
