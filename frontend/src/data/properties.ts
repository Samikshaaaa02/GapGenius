export interface Property {
  id: string;
  name: string;
  rooms: number;
  orphanNights: number;
  monthlyLeakage: number;
  recovered: number;
  recoveryPct: number;
  trend: number[];
  status: "Connected" | "Syncing" | "Available";
  pms: string;
}

export const PROPERTIES: Property[] = [
  {
    id: "downtown",
    name: "Downtown Tower",
    rooms: 248,
    orphanNights: 132,
    monthlyLeakage: 18400,
    recovered: 7780,
    recoveryPct: 42,
    trend: [3.1, 3.4, 4.0, 4.6, 5.2, 6.1, 6.9, 7.4, 7.78],
    status: "Connected",
    pms: "Opera PMS",
  },
  {
    id: "airport",
    name: "Airport Suites",
    rooms: 184,
    orphanNights: 98,
    monthlyLeakage: 12300,
    recovered: 5410,
    recoveryPct: 44,
    trend: [2.2, 2.5, 2.9, 3.3, 3.7, 4.2, 4.8, 5.1, 5.41],
    status: "Connected",
    pms: "Opera PMS",
  },
  {
    id: "beachfront",
    name: "Beachfront Resort",
    rooms: 312,
    orphanNights: 176,
    monthlyLeakage: 24800,
    recovered: 9620,
    recoveryPct: 39,
    trend: [4.0, 4.4, 5.0, 5.7, 6.5, 7.2, 8.1, 8.9, 9.62],
    status: "Syncing",
    pms: "SiteMinder",
  },
];

export const PORTFOLIO_TOTAL_RECOVERABLE = PROPERTIES.reduce((s, p) => s + p.recovered, 0);
export const PORTFOLIO_AVG_RECOVERY = Math.round(
  PROPERTIES.reduce((s, p) => s + p.recoveryPct, 0) / PROPERTIES.length,
);
