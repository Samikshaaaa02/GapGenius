import * as React from "react";
import {
  buildEmptyMonths,
  buildMonthsFromUploads,
  type MonthData,
  type MonthKey,
  type RoomNight,
  type ScenarioKind,
  type UploadBooking,
  type UploadOrphanGap,
} from "@/data/mockInventory";

type FixSource = "manual" | "auto";

export interface ActivityEntry {
  id: string;
  ts: number;
  kind: "scenario" | "optimization" | "manual";
  title: string;
  detail: string;
  recovered: number;
  steps: string[];
}

interface MonthState {
  inventory: RoomNight[];
  appliedFixes: Set<string>;
  recovered: number;
  optimized: boolean;
  optimizationRunning: boolean;
  activity: ActivityEntry[];
}

interface InventoryState {
  activeMonth: MonthKey;
  setActiveMonth: (m: MonthKey) => void;
  months: Record<MonthKey, MonthData>;
  state: Record<MonthKey, MonthState>;
  // Convenience accessors for the active month
  active: MonthData;
  activeState: MonthState;
  applyFix: (cellId: string, monthKey?: MonthKey, source?: FixSource) => void;
  runOptimization: (monthKey?: MonthKey) => void;
  fixScenario: (kind: ScenarioKind, monthKey?: MonthKey) => void;
  reset: (monthKey?: MonthKey) => void;
  totalRecoveredAcrossMonths: number;
  loadRealData: (bookings: UploadBooking[], orphanGaps: UploadOrphanGap[]) => void;
}

const InventoryContext = React.createContext<InventoryState | null>(null);

const initialMonthState = (m: MonthData): MonthState => ({
  inventory: m.inventory.map((c) => ({ ...c })),
  appliedFixes: new Set(),
  recovered: 0,
  optimized: false,
  optimizationRunning: false,
  activity: [],
});

const UPLOAD_KEY   = "gg:upload-data";
const BOOKINGS_KEY = "gg:bookings";

function loadPersistedMonths(): Record<MonthKey, MonthData> {
  // 1. Prefer gg:upload-data (written by loadRealData — has orphan gaps)
  try {
    const raw = localStorage.getItem(UPLOAD_KEY);
    if (raw) {
      const { bookings, orphanGaps } = JSON.parse(raw) as {
        bookings: UploadBooking[];
        orphanGaps: UploadOrphanGap[];
      };
      if (Array.isArray(bookings) && bookings.length > 0) {
        return buildMonthsFromUploads(bookings, orphanGaps ?? []);
      }
    }
  } catch {}

  // 2. Fall back to gg:bookings (written by portfolio page — no orphan gaps)
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Array<{
        room_number: string; room_type: string; check_in: string;
        check_out: string; rate: number; guest_name?: string; status: string;
      }>;
      if (Array.isArray(saved) && saved.length > 0) {
        const bookings: UploadBooking[] = saved.map((b) => ({
          room_number: b.room_number,
          room_type:   b.room_type,
          check_in:    b.check_in,
          check_out:   b.check_out,
          rate:        b.rate,
          guest_name:  b.guest_name,
          status:      b.status,
        }));
        return buildMonthsFromUploads(bookings, []);
      }
    }
  } catch {}

  return buildEmptyMonths();
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [activeMonth, setActiveMonth] = React.useState<MonthKey>("current");
  const [monthsData, setMonthsData] = React.useState<Record<MonthKey, MonthData>>(buildEmptyMonths);
  const [state, setState] = React.useState<Record<MonthKey, MonthState>>(() => {
    const months = buildEmptyMonths();
    return {
      previous: initialMonthState(months.previous),
      current: initialMonthState(months.current),
      next: initialMonthState(months.next),
    };
  });

  // Load persisted data after hydration so server and client render the same
  // empty state on first pass, avoiding SSR mismatches.
  React.useEffect(() => {
    const months = loadPersistedMonths();
    setMonthsData(months);
    setState({
      previous: initialMonthState(months.previous),
      current: initialMonthState(months.current),
      next: initialMonthState(months.next),
    });
  }, []);

  const loadRealData = React.useCallback(
    (bookings: UploadBooking[], orphanGaps: UploadOrphanGap[]) => {
      try {
        localStorage.setItem(UPLOAD_KEY, JSON.stringify({ bookings, orphanGaps }));
      } catch {}
      const newMonths = buildMonthsFromUploads(bookings, orphanGaps);
      setMonthsData(newMonths);
      setState({
        previous: initialMonthState(newMonths.previous),
        current: initialMonthState(newMonths.current),
        next: initialMonthState(newMonths.next),
      });
    },
    [],
  );

  const updateMonth = React.useCallback((key: MonthKey, updater: (m: MonthState) => MonthState) => {
    setState((prev) => ({ ...prev, [key]: updater(prev[key]) }));
  }, []);

  const applyFix = React.useCallback(
    (cellId: string, monthKey?: MonthKey) => {
      const key = monthKey ?? activeMonth;
      updateMonth(key, (m) => {
        const cell = m.inventory.find((c) => c.id === cellId);
        if (!cell || cell.status !== "fragmented") return m;
        const inventory = m.inventory.map((c) =>
          c.id === cellId ? { ...c, status: "available" as const } : c,
        );
        const appliedFixes = new Set(m.appliedFixes);
        appliedFixes.add(cellId);
        return {
          ...m,
          inventory,
          appliedFixes,
          recovered: m.recovered + cell.lostRevenue,
        };
      });
    },
    [activeMonth, updateMonth],
  );

  const runOptimization = React.useCallback(
    (monthKey?: MonthKey) => {
      const key = monthKey ?? activeMonth;
      const current = state[key];
      if (current.optimizationRunning || current.optimized) return;
      const safeIds = current.inventory
        .filter((c) => c.status === "fragmented" && c.safeFix)
        .map((c) => c.id);

      const startRecovered = current.recovered;
      updateMonth(key, (m) => ({ ...m, optimizationRunning: true }));

      safeIds.forEach((id, idx) => {
        window.setTimeout(() => {
          updateMonth(key, (m) => {
            const cell = m.inventory.find((c) => c.id === id);
            if (!cell) return m;
            const inventory = m.inventory.map((c) =>
              c.id === id ? { ...c, status: "available" as const } : c,
            );
            const appliedFixes = new Set(m.appliedFixes);
            appliedFixes.add(id);
            return {
              ...m,
              inventory,
              appliedFixes,
              recovered: m.recovered + cell.lostRevenue,
            };
          });
        }, idx * 50);
      });

      window.setTimeout(
        () => {
          updateMonth(key, (m) => {
            const totalRecoveredNow = m.recovered;
            const recoveredThisRun = totalRecoveredNow - startRecovered;
            const entry: ActivityEntry = {
              id: `opt-${Date.now()}`,
              ts: Date.now(),
              kind: "optimization",
              title: "AI Optimization run",
              detail: `Resolved ${safeIds.length} fragmented room-night${safeIds.length === 1 ? "" : "s"}`,
              recovered: recoveredThisRun,
              steps: [
                "Scanned 1,200 room-nights for fragmentation patterns",
                "Calculated revenue impact for 40-room inventory",
                "Applied OptaPlanner constraints for guest shuffles",
                "Executed 1-click fixes for Orphan Nights",
                "Synced recovered revenue to Opera PMS",
              ],
            };
            return {
              ...m,
              optimized: true,
              optimizationRunning: false,
              activity: [entry, ...m.activity],
            };
          });
        },
        safeIds.length * 50 + 400,
      );
    },
    [activeMonth, state, updateMonth],
  );

  const fixScenario = React.useCallback(
    (kind: ScenarioKind, monthKey?: MonthKey) => {
      const key = monthKey ?? activeMonth;
      const current = state[key];
      const targetIds = current.inventory
        .filter((c) => c.status === "fragmented" && c.scenario === kind)
        .map((c) => c.id);

      const startRecovered = current.recovered;
      updateMonth(key, (m) => ({ ...m, optimizationRunning: true }));

      targetIds.forEach((id, idx) => {
        window.setTimeout(() => {
          updateMonth(key, (m) => {
            const cell = m.inventory.find((c) => c.id === id);
            if (!cell) return m;
            const inventory = m.inventory.map((c) =>
              c.id === id ? { ...c, status: "available" as const } : c,
            );
            const appliedFixes = new Set(m.appliedFixes);
            appliedFixes.add(id);
            return {
              ...m,
              inventory,
              appliedFixes,
              recovered: m.recovered + cell.lostRevenue,
            };
          });
        }, idx * 50);
      });

      window.setTimeout(
        () => {
          updateMonth(key, (m) => {
            const recoveredThisRun = m.recovered - startRecovered;
            const titleMap: Record<ScenarioKind, string> = {
              channel: "Channel Partner Blockage cleared",
              shoulder: "Shoulder Nights re-opened",
              orphan: "Orphan Nights stitched",
            };
            const stepMap: Record<ScenarioKind, string[]> = {
              channel: [
                "Audited OTA inventory holds past 48h release window",
                "Pulled inventory back to direct channels",
                "Repriced against comp set",
                "Synced changes to Opera PMS",
              ],
              shoulder: [
                "Identified mispriced Tue/Wed/Sun shoulder dates",
                "Adjusted rate floor by -8%",
                "Re-opened closed-for-sale dates",
                "Synced changes to Opera PMS",
              ],
              orphan: [
                "Detected single-night gaps locked by min-stay",
                "Reduced min-stay to 1 on orphan nights",
                "Triggered guest shuffle suggestions",
                "Synced changes to Opera PMS",
              ],
            };
            const entry: ActivityEntry = {
              id: `sc-${kind}-${Date.now()}`,
              ts: Date.now(),
              kind: "scenario",
              title: titleMap[kind],
              detail: `Fixed ${targetIds.length} cell${targetIds.length === 1 ? "" : "s"}`,
              recovered: recoveredThisRun,
              steps: stepMap[kind],
            };
            return {
              ...m,
              optimizationRunning: false,
              activity: [entry, ...m.activity],
            };
          });
        },
        targetIds.length * 50 + 300,
      );
    },
    [activeMonth, state, updateMonth],
  );

  const reset = React.useCallback(
    (monthKey?: MonthKey) => {
      if (monthKey) {
        setState((prev) => ({ ...prev, [monthKey]: initialMonthState(monthsData[monthKey]) }));
      } else {
        setState({
          previous: initialMonthState(monthsData.previous),
          current: initialMonthState(monthsData.current),
          next: initialMonthState(monthsData.next),
        });
      }
    },
    [monthsData],
  );

  const totalRecoveredAcrossMonths =
    state.previous.recovered + state.current.recovered + state.next.recovered;

  const value: InventoryState = {
    activeMonth,
    setActiveMonth,
    months: monthsData,
    state,
    active: monthsData[activeMonth],
    activeState: state[activeMonth],
    applyFix,
    runOptimization,
    fixScenario,
    reset,
    totalRecoveredAcrossMonths,
    loadRealData,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = React.useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used within InventoryProvider");
  return ctx;
}
