/**
 * GapGenius API client — all calls to the FastAPI backend at /api/*
 * Vite proxies /api → http://localhost:8000 in dev.
 */

const BASE = "/api";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  provider: string;
  model: string;
}

export interface PropertyStat {
  id: string;
  name: string;
  rooms: number;
  orphan_nights: number;
  monthly_leakage: number;
  recovered: number;
  recovery_pct: number;
  trend: number[];
  status: string;
  pms: string;
}

export interface OrphanGap {
  gap_id: string;
  room_id: string;
  room_category: string;
  start_date: string;
  end_date: string;
  gap_length_nights: number;
  surrounding_booking_ids: string[];
  channels_available: string[];
  estimated_lost_revenue: number;
  severity_score: number;
  severity_label: string;
}

export interface BookingsUploadResponse {
  success: boolean;
  properties: PropertyStat[];
  total_recoverable: number;
  avg_recovery_pct: number;
  orphan_gaps?: OrphanGap[];
  error?: string;
}

export interface RoomFromBackend {
  room_id: string;
  number: string;
  category: string;
  floor: number;
  base_rate: number;
  capacity: number;
  status: string;
  notes?: string;
}

export interface RoomsUploadResponse {
  success: boolean;
  rooms: RoomFromBackend[];
  count: number;
  error?: string;
}

export interface LlmInfo {
  provider: string;
  model: string;
  has_key: boolean;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function sendChat(
  message: string,
  history: ChatMessage[],
  context?: Record<string, unknown>,
): Promise<ChatResponse> {
  return post<ChatResponse>("/chat", { message, history, context });
}

export async function uploadRoomsCSV(file: File): Promise<RoomsUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/rooms/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function uploadBookingsCSV(
  file: File,
  hotelName: string,
  minStayRule: number = 2,
): Promise<BookingsUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("hotel_name", hotelName);
  form.append("min_stay_rule", String(minStayRule));
  const res = await fetch(`${BASE}/bookings/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getLlmInfo(): Promise<LlmInfo> {
  return get<LlmInfo>("/llm-info");
}

export interface LlmConfigRequest {
  provider: string;
  model: string;
  api_key: string;
}

export async function updateLlmConfig(req: LlmConfigRequest): Promise<LlmInfo & { ok: boolean }> {
  return post("/llm-config", req);
}

export async function healthCheck(): Promise<{ status: string }> {
  return get<{ status: string }>("/health".replace("/api", "").replace("//", "/"));
}

// ── Orphan Gap Detection ──────────────────────────────────────────────────────

export interface BookingInput {
  room_number: string;
  room_type: string;
  check_in: string;
  check_out: string;
  rate: number;
  guest_name?: string;
  status: string;
}

export interface RebundleOpportunity {
  opportunity_id: string;
  gap_ids: string[];
  room_ids: string[];
  proposed_start: string;
  proposed_end: string;
  total_nights: number;
  proposed_action: string;
  estimated_revenue_recovery: number;
  confidence: number;
}

export interface CapacityScore {
  total_room_nights: number;
  sellable_room_nights: number;
  orphan_gap_nights: number;
  fragmentation_rate: number;
  usable_capacity_pct: number;
  estimated_lost_revenue: number;
}

export interface AnalyzeBookingsResponse {
  success: boolean;
  orphan_gaps: OrphanGap[];
  opportunities: RebundleOpportunity[];
  score_before?: CapacityScore;
  error?: string;
}

export async function analyzeBookings(
  bookings: BookingInput[],
  minStayRule = 2,
  hotelName = "Uploaded Property",
): Promise<AnalyzeBookingsResponse> {
  return post<AnalyzeBookingsResponse>("/analyze-bookings", {
    bookings,
    min_stay_rule: minStayRule,
    hotel_name: hotelName,
  });
}

// ── AI Recommendations ────────────────────────────────────────────────────────

export interface AIRecommendation {
  recommendation_id: string;
  headline: string;
  rationale: string;
  action: string;
  affected_rooms: string[];
  affected_dates: string;
  channel?: string;
  estimated_revenue_lift: number;
  priority: string;
  implementation_difficulty: string;
}

export interface AIRecommendationsResponse {
  success: boolean;
  recommendations: AIRecommendation[];
  executive_summary: string;
  error?: string;
}

export async function getAIRecommendations(
  orphanGaps: OrphanGap[],
  opportunities: RebundleOpportunity[],
  scoreBefore: CapacityScore,
  hotelName = "Uploaded Property",
): Promise<AIRecommendationsResponse> {
  const payload = {
    orphan_gaps: orphanGaps,
    opportunities,
    score_before: scoreBefore,
    hotel_name: hotelName,
  };
  console.log("[GG:api] POST /api/ai-recommendations — payload size:", JSON.stringify(payload).length, "bytes");

  const res = await fetch(`${BASE}/ai-recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  console.log("[GG:api] HTTP status:", res.status);
  console.log("[GG:api] Raw response text:", rawText.slice(0, 2000));

  if (!res.ok) {
    throw new Error(rawText || `HTTP ${res.status}`);
  }

  try {
    const parsed = JSON.parse(rawText) as AIRecommendationsResponse;
    console.log("[GG:api] Parsed — success:", parsed.success, "| recs:", parsed.recommendations?.length, "| summary length:", parsed.executive_summary?.length);
    if (parsed.error) console.error("[GG:api] Backend error field:", parsed.error);
    return parsed;
  } catch (e) {
    console.error("[GG:api] JSON parse failed:", e);
    throw new Error(`Invalid JSON from backend: ${rawText.slice(0, 200)}`);
  }
}
