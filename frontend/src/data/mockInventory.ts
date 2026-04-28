// Seeded mock dataset across three months: prev / current / next.
// Each month: 40 rooms x 30 days = 1,200 room-nights.

export type CellStatus = "booked" | "available" | "fragmented";
export type SuggestedAction = "lower_min_stay" | "shuffle_guest" | "open_shoulder";
export type MonthKey = "previous" | "current" | "next";
export type ScenarioKind = "channel" | "shoulder" | "orphan";

export interface Signal {
  icon: "inquiries" | "competitor" | "history";
  title: string;
  detail: string;
}

export interface RoomNight {
  id: string;
  roomId: string;
  roomNumber: number;
  roomType: "Standard King" | "Deluxe Queen" | "Suite" | "Executive";
  date: string; // ISO YYYY-MM-DD
  dayOfMonth: number;
  weekday: string;
  status: CellStatus;
  rate: number;
  minStay: number;
  isShoulderDate: boolean;
  lostRevenue: number;
  signals: Signal[];
  suggestedAction: SuggestedAction;
  actionLabel: string;
  safeFix: boolean;
  scenario?: ScenarioKind; // only on fragmented cells
  guestName?: string; // only on booked cells (for tooltip)
}

export interface MonthData {
  key: MonthKey;
  label: string; // "Mar 2026"
  longLabel: string; // "March 2026"
  year: number;
  monthIndex: number; // 0-11
  inventory: RoomNight[];
  days: { dayOfMonth: number; weekday: string; isShoulder: boolean; iso: string }[];
  totalLeakage: number;
  safeRecovery: number;
  scenarioBreakdown: Record<ScenarioKind, number>;
  orphanCount: number;
  bookedCount: number;
  availableCount: number;
  blockedCount: number; // alias of fragmented for the manager mental model
  roomNumbers: number[];
}

// Mulberry32 deterministic PRNG
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ROOM_TYPES: RoomNight["roomType"][] = ["Standard King", "Deluxe Queen", "Suite", "Executive"];
const GUEST_NAMES = [
  "Patel",
  "Nguyen",
  "Garcia",
  "Müller",
  "Tanaka",
  "Okafor",
  "Andersson",
  "Rossi",
  "Khan",
  "Silva",
];

const ACTION_LABELS: Record<SuggestedAction, string> = {
  lower_min_stay: "Lower min-stay to 1",
  shuffle_guest: "Shuffle guest",
  open_shoulder: "Open shoulder date",
};

function buildSignals(
  action: SuggestedAction,
  rate: number,
  minStay: number,
  weekday: string,
  rng: () => number,
): Signal[] {
  const compRate = Math.round(rate * (1.1 + rng() * 0.18));
  if (action === "lower_min_stay") {
    return [
      {
        icon: "inquiries",
        title: "Booking pace",
        detail: `4 inquiries declined — min-stay ${minStay} blocked 1-night requests`,
      },
      {
        icon: "competitor",
        title: "Competitor rates",
        detail: `Comp set avg $${compRate} vs your $${rate}`,
      },
      {
        icon: "history",
        title: "Historical data",
        detail: `${weekday} shoulder dates fill 87% when min-stay = 1`,
      },
    ];
  }
  if (action === "shuffle_guest") {
    return [
      {
        icon: "inquiries",
        title: "Booking pace",
        detail: "Adjacent guest requested +1 night — currently blocked by orphan gap",
      },
      {
        icon: "competitor",
        title: "Reassignable inventory",
        detail: "Same room type next door — zero guest impact",
      },
      {
        icon: "history",
        title: "Historical data",
        detail: "Guest shuffles average +$310 recovered, 0% complaint rate",
      },
    ];
  }
  return [
    {
      icon: "inquiries",
      title: "Booking pace",
      detail: "Pace +24% vs forecast for this shoulder date",
    },
    {
      icon: "competitor",
      title: "Competitor rates",
      detail: `Comp set avg $${compRate} — you are closed for sale`,
    },
    {
      icon: "history",
      title: "Historical data",
      detail: "Shoulder Tuesdays sold out in 4 of last 5 weeks",
    },
  ];
}

function buildMonth(
  key: MonthKey,
  year: number,
  monthIndex: number,
  seed: number,
  targets: { totalLeakage: number; safeRecovery: number; safeCount: number },
): MonthData {
  const rng = mulberry32(seed);
  const rooms = Array.from({ length: 40 }, (_, i) => 101 + i);
  const start = new Date(year, monthIndex, 1);
  const inventory: RoomNight[] = [];
  const fragmented: { id: string; safe: boolean }[] = [];

  for (let r = 0; r < rooms.length; r++) {
    const roomType = ROOM_TYPES[r % ROOM_TYPES.length];
    for (let d = 0; d < 30; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + d);
      const weekday = WEEKDAYS[date.getDay()];
      const isShoulder = weekday === "Tue" || weekday === "Wed" || weekday === "Sun";

      const roll = rng();
      let status: CellStatus;
      if (roll < 0.55) status = "booked";
      else if (roll < 0.85) status = "available";
      else status = "fragmented";

      const rate = 215 + Math.floor(rng() * 120) + (isShoulder ? -15 : 10);
      const minStay = status === "fragmented" && rng() < 0.6 ? 3 : rng() < 0.4 ? 2 : 1;
      const id = `${key}-r${rooms[r]}-d${d}`;

      const cell: RoomNight = {
        id,
        roomId: `room-${rooms[r]}`,
        roomNumber: rooms[r],
        roomType,
        date: date.toISOString().slice(0, 10),
        dayOfMonth: date.getDate(),
        weekday,
        status,
        rate,
        minStay,
        isShoulderDate: isShoulder,
        lostRevenue: 0,
        signals: [],
        suggestedAction: "lower_min_stay",
        actionLabel: ACTION_LABELS.lower_min_stay,
        safeFix: false,
        guestName:
          status === "booked" ? GUEST_NAMES[Math.floor(rng() * GUEST_NAMES.length)] : undefined,
      };
      inventory.push(cell);

      if (status === "fragmented") {
        fragmented.push({ id, safe: rng() < 0.55 });
      }
    }
  }

  // Distribute leakage to hit revenue targets
  const safeIds = fragmented.filter((f) => f.safe).map((f) => f.id);
  const riskyIds = fragmented.filter((f) => !f.safe).map((f) => f.id);
  const SAFE_COUNT = Math.min(targets.safeCount, safeIds.length);
  const chosenSafe = safeIds.slice(0, SAFE_COUNT);
  const leftoverSafe = safeIds.slice(SAFE_COUNT);
  const finalRisky = [...riskyIds, ...leftoverSafe];

  function distribute(ids: string[], total: number) {
    if (ids.length === 0) return;
    const base = Math.floor(total / ids.length);
    let remainder = total - base * ids.length;
    ids.forEach((id, idx) => {
      const cell = inventory.find((c) => c.id === id)!;
      const jitter = (idx % 2 === 0 ? 1 : -1) * (20 + (idx % 5) * 8);
      let amount = base + jitter;
      if (idx === ids.length - 1) amount += remainder;
      else remainder -= jitter;
      cell.lostRevenue = Math.max(80, Math.round(amount));
    });
    const sum = ids.reduce((s, id) => s + inventory.find((c) => c.id === id)!.lostRevenue, 0);
    const diff = total - sum;
    const last = inventory.find((c) => c.id === ids[ids.length - 1])!;
    last.lostRevenue = Math.max(80, last.lostRevenue + diff);
  }

  distribute(chosenSafe, targets.safeRecovery);
  distribute(finalRisky, targets.totalLeakage - targets.safeRecovery);

  // Action assignment + scenario classification
  const rng2 = mulberry32(seed + 7);
  inventory.forEach((cell) => {
    if (cell.status !== "fragmented") return;
    const isSafe = chosenSafe.includes(cell.id);
    cell.safeFix = isSafe;
    const actionRoll = rng2();
    const action: SuggestedAction =
      actionRoll < 0.5 ? "lower_min_stay" : actionRoll < 0.8 ? "shuffle_guest" : "open_shoulder";
    cell.suggestedAction = action;
    cell.actionLabel = ACTION_LABELS[action];
    cell.signals = buildSignals(action, cell.rate, cell.minStay, cell.weekday, rng2);
    // Map action -> scenario bucket
    cell.scenario =
      action === "shuffle_guest"
        ? "orphan"
        : action === "open_shoulder"
          ? "shoulder"
          : cell.isShoulderDate
            ? "shoulder"
            : rng2() < 0.45
              ? "channel"
              : "orphan";
  });

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(year, monthIndex, 1 + i);
    return {
      dayOfMonth: d.getDate(),
      weekday: WEEKDAYS[d.getDay()],
      isShoulder: ["Tue", "Wed", "Sun"].includes(WEEKDAYS[d.getDay()]),
      iso: d.toISOString().slice(0, 10),
    };
  });

  const fragCells = inventory.filter((c) => c.status === "fragmented");
  const scenarioBreakdown: Record<ScenarioKind, number> = {
    channel: fragCells
      .filter((c) => c.scenario === "channel")
      .reduce((s, c) => s + c.lostRevenue, 0),
    shoulder: fragCells
      .filter((c) => c.scenario === "shoulder")
      .reduce((s, c) => s + c.lostRevenue, 0),
    orphan: fragCells.filter((c) => c.scenario === "orphan").reduce((s, c) => s + c.lostRevenue, 0),
  };

  const monthLabel = new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "short" });
  const longLabel = new Date(year, monthIndex, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    key,
    label: `${monthLabel} ${year}`,
    longLabel,
    year,
    monthIndex,
    inventory,
    days,
    totalLeakage: targets.totalLeakage,
    safeRecovery: targets.safeRecovery,
    scenarioBreakdown,
    orphanCount: fragCells.length,
    bookedCount: inventory.filter((c) => c.status === "booked").length,
    availableCount: inventory.filter((c) => c.status === "available").length,
    blockedCount: fragCells.length,
    roomNumbers: rooms,
  };
}

// Build three months. Current = April 2026 (matches brief).
export const MONTHS: Record<MonthKey, MonthData> = {
  previous: buildMonth("previous", 2026, 2, 20260301, {
    totalLeakage: 14200,
    safeRecovery: 5800,
    safeCount: 18,
  }),
  current: buildMonth("current", 2026, 3, 20260412, {
    totalLeakage: 10000, // 2k channel + 2k shoulder + 6k orphan = $10k matching brief
    safeRecovery: 5000, // matches "Total Saved $5,000" in brief
    safeCount: 20,
  }),
  next: buildMonth("next", 2026, 4, 20260501, {
    totalLeakage: 11600,
    safeRecovery: 4400,
    safeCount: 16,
  }),
};

// Force the current-month scenario breakdown to match brief exactly: 2k/2k/6k
(function tuneCurrent() {
  const m = MONTHS.current;
  const targets: Record<ScenarioKind, number> = {
    channel: 2000,
    shoulder: 2000,
    orphan: 6000,
  };
  (Object.keys(targets) as ScenarioKind[]).forEach((kind) => {
    const cells = m.inventory.filter((c) => c.status === "fragmented" && c.scenario === kind);
    if (cells.length === 0) return;
    const target = targets[kind];
    const base = Math.floor(target / cells.length);
    const remainder = target - base * cells.length;
    cells.forEach((c, i) => {
      c.lostRevenue = Math.max(80, base + (i === cells.length - 1 ? remainder : 0));
    });
    const sum = cells.reduce((s, c) => s + c.lostRevenue, 0);
    cells[cells.length - 1].lostRevenue += target - sum;
  });
  m.scenarioBreakdown = targets;
  m.totalLeakage = targets.channel + targets.shoulder + targets.orphan;
})();

export const ROOM_NUMBERS = Array.from({ length: 40 }, (_, i) => 101 + i);

// Backwards-compatible exports (legacy index route uses these)
export const MOCK_INVENTORY = MONTHS.current.inventory;
export const DAYS = MONTHS.current.days;
export const TOTAL_LEAKAGE = MONTHS.current.totalLeakage;
export const SAFE_RECOVERY = MONTHS.current.safeRecovery;
export const SAFE_FIX_COUNT = MONTHS.current.inventory.filter(
  (c) => c.status === "fragmented" && c.safeFix,
).length;
export const ORPHAN_NIGHT_COUNT = MONTHS.current.orphanCount;
export const SHOULDER_OCCUPANCY = (() => {
  const shoulder = MOCK_INVENTORY.filter((c) => c.isShoulderDate);
  const occupied = shoulder.filter((c) => c.status === "booked").length;
  return Math.round((occupied / shoulder.length) * 100);
})();
export const AVG_MIN_STAY = (() => {
  const sum = MOCK_INVENTORY.reduce((s, c) => s + c.minStay, 0);
  return (sum / MOCK_INVENTORY.length).toFixed(1);
})();

export interface UploadBooking {
  room_number: string;
  room_type: string;
  check_in: string;   // YYYY-MM-DD
  check_out: string;  // YYYY-MM-DD
  rate: number;
  guest_name?: string;
  status: string;
}

export interface UploadOrphanGap {
  room_id: string;            // e.g. "R101"
  start_date: string;         // YYYY-MM-DD
  end_date: string;           // YYYY-MM-DD
  gap_length_nights: number;
  estimated_lost_revenue: number;
}

export function buildEmptyMonths(): Record<MonthKey, MonthData> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    previous: _emptyMonth("previous", y, m - 1 < 0 ? 11 : m - 1),
    current:  _emptyMonth("current",  y, m),
    next:     _emptyMonth("next",     y, m + 1 > 11 ? 0 : m + 1),
  };
}

function _emptyMonth(key: MonthKey, year: number, monthIndex: number): MonthData {
  const label = new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "short" });
  const longLabel = new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(year, monthIndex, 1 + i);
    const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
    return { dayOfMonth: d.getDate(), weekday: wd, isShoulder: ["Tue","Wed","Sun"].includes(wd), iso: d.toISOString().slice(0,10) };
  });
  return { key, label: `${label} ${year}`, longLabel, year, monthIndex, inventory: [], days, totalLeakage: 0, safeRecovery: 0, scenarioBreakdown: { channel: 0, shoulder: 0, orphan: 0 }, orphanCount: 0, bookedCount: 0, availableCount: 0, blockedCount: 0, roomNumbers: [] };
}

export function buildMonthsFromUploads(
  bookings: UploadBooking[],
  orphanGaps: UploadOrphanGap[],
): Record<MonthKey, MonthData> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const defs: Array<{ key: MonthKey; year: number; mi: number }> = [
    { key: "previous", year: y, mi: m - 1 < 0 ? 11 : m - 1 },
    { key: "current",  year: y, mi: m },
    { key: "next",     year: y, mi: m + 1 > 11 ? 0 : m + 1 },
  ];
  // Unique room numbers — strip non-digit chars so "R101", "Room 101" → 101
  const roomSet = new Set<number>();
  const _roomStrMap = new Map<string, number>(); // fallback for fully non-numeric IDs
  let _nextId = 101;
  bookings.forEach(b => {
    const raw = String(b.room_number ?? "").trim();
    if (!raw) return;
    const digits = raw.replace(/\D/g, "");
    const n = digits ? parseInt(digits) : NaN;
    if (!isNaN(n)) { roomSet.add(n); _roomStrMap.set(raw, n); }
    else { if (!_roomStrMap.has(raw)) _roomStrMap.set(raw, _nextId++); roomSet.add(_roomStrMap.get(raw)!); }
  });
  const roomNumbers = Array.from(roomSet).sort((a,b) => a-b).slice(0,40);

  const result: Partial<Record<MonthKey, MonthData>> = {};
  for (const { key, year, mi } of defs) {
    result[key] = _buildRealMonth(key, year, mi, bookings, orphanGaps, roomNumbers);
  }
  return result as Record<MonthKey, MonthData>;
}

const _RTYPES: RoomNight["roomType"][] = ["Standard King","Deluxe Queen","Suite","Executive"];
const _WDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function _buildRealMonth(
  key: MonthKey, year: number, monthIndex: number,
  bookings: UploadBooking[], orphanGaps: UploadOrphanGap[], roomNumbers: number[]
): MonthData {
  const label = new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "short" });
  const longLabel = new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(year, monthIndex, 1 + i);
    const wd = _WDAYS[d.getDay()];
    return { dayOfMonth: d.getDate(), weekday: wd, isShoulder: ["Tue","Wed","Sun"].includes(wd), iso: d.toISOString().slice(0,10) };
  });
  const inventory: RoomNight[] = [];
  for (const roomNum of roomNumbers) {
    const rType = _RTYPES[(roomNum - 101) % _RTYPES.length];
    for (let dIdx = 0; dIdx < 30; dIdx++) {
      const d = new Date(year, monthIndex, 1 + dIdx);
      const dateStr = d.toISOString().slice(0,10);
      const wd = _WDAYS[d.getDay()];
      const isShoulder = ["Tue","Wed","Sun"].includes(wd);
      const id = `${key}-r${roomNum}-d${dIdx}`;
      const booking = bookings.find(b => { const d = String(b.room_number ?? "").replace(/\D/g,""); const n = d ? parseInt(d) : NaN; return n === roomNum && b.check_in <= dateStr && b.check_out > dateStr && b.status !== "cancelled"; });
      const gap = orphanGaps.find(g => parseInt(g.room_id.replace(/\D/g,"")) === roomNum && g.start_date <= dateStr && g.end_date >= dateStr);
      let status: CellStatus = "available";
      let lostRevenue = 0;
      if (booking) { status = "booked"; }
      else if (gap) { status = "fragmented"; lostRevenue = gap.gap_length_nights > 0 ? gap.estimated_lost_revenue / gap.gap_length_nights : gap.estimated_lost_revenue; }
      const bookingForRoom = bookings.find(b => { const d = String(b.room_number ?? "").replace(/\D/g,""); return d ? parseInt(d) === roomNum : false; });
      const resolvedType = (["Standard King","Deluxe Queen","Suite","Executive"].includes(bookingForRoom?.room_type ?? "")) ? bookingForRoom!.room_type as RoomNight["roomType"] : rType;
      inventory.push({ id, roomId:`room-${roomNum}`, roomNumber:roomNum, roomType:resolvedType, date:dateStr, dayOfMonth:d.getDate(), weekday:wd, status, rate:booking?.rate ?? 150, minStay:status==="fragmented"?3:1, isShoulderDate:isShoulder, lostRevenue, signals:[], suggestedAction:"lower_min_stay", actionLabel:"Lower min-stay to 1", safeFix:status==="fragmented", guestName:booking?.guest_name, scenario:status==="fragmented"?"orphan":undefined });
    }
  }
  const fragCells = inventory.filter(c => c.status==="fragmented");
  const tl = fragCells.reduce((s,c) => s+c.lostRevenue, 0);
  return { key, label:`${label} ${year}`, longLabel, year, monthIndex, inventory, days, totalLeakage:tl, safeRecovery:tl*0.6, scenarioBreakdown:{channel:0,shoulder:0,orphan:tl}, orphanCount:fragCells.length, bookedCount:inventory.filter(c=>c.status==="booked").length, availableCount:inventory.filter(c=>c.status==="available").length, blockedCount:fragCells.length, roomNumbers };
}
