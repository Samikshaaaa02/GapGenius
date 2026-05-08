"""GapGenius FastAPI backend — all routes."""
import io
import csv
import os
import re
import asyncio
import warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="instructor")
from datetime import date, timedelta
from calendar import monthrange
from typing import Optional

try:
    import holidays as _holidays_lib
    _HOLIDAYS_AVAILABLE = True
except ImportError:
    _holidays_lib = None
    _HOLIDAYS_AVAILABLE = False

import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sse_starlette.sse import EventSourceResponse

from config import settings
from models import (
    AnalyzeRequest, AnalyzeResponse, AnalysisResult, CapacityScore,
    ChatRequest, ChatResponse,
    RoomsUploadResponse, BookingsUploadResponse, PropertyStat,
    MatrixResponse, MatrixCell,
    Room, Booking, RoomCategory, Channel,
    AnalyzeBookingsRequest, AnalyzeBookingsResponse,
    AIRecommendationsRequest, AIRecommendationsResponse,
    GmailStatusResponse, EmailsResponse, ParsedEmailResponse,
    SendReplyRequest, SendReplyResponse, DraftReplyRequest,
    ThreadResponse, CreateBookingRequest, BookingRecord,
    HolidaysResponse, EventsResponse,
)
from data.mock_generator import generate_hotel_data
from ml.gap_detector import build_availability_matrix, detect_orphan_gaps
from ml.fragmentation_scorer import score_gaps
from ml.slot_optimizer import find_rebundle_opportunities
from ai.chatbot import chat as ai_chat, get_provider_info

app = FastAPI(title="GapGenius API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173", "http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    info = get_provider_info()
    return {
        "status": "ok",
        "service": "GapGenius",
        "llm_provider": info["provider"],
        "llm_model": info["model"],
    }


# ── Room CSV Upload ───────────────────────────────────────────────────────────

@app.post("/api/rooms/upload", response_model=RoomsUploadResponse)
async def upload_rooms(file: UploadFile = File(...)):
    """
    Accept a CSV with columns: number, type, floor, capacity, rate, status, notes
    Returns parsed Room list.
    """
    try:
        content = await file.read()
        text = content.decode("utf-8-sig")  # handle BOM
        reader = csv.DictReader(io.StringIO(text))
        rooms: list[Room] = []

        CATEGORY_MAP = {
            "standard": RoomCategory.standard,
            "deluxe": RoomCategory.deluxe,
            "suite": RoomCategory.suite,
            "executive": RoomCategory.executive,
        }

        for i, row in enumerate(reader):
            normalized = {k.strip().lower(): v.strip() for k, v in row.items()}
            number = normalized.get("number") or normalized.get("room number") or normalized.get("room_number", "")
            room_type_raw = normalized.get("type") or normalized.get("room type") or normalized.get("room_type", "Standard King")
            floor = int(normalized.get("floor", 1) or 1)
            capacity = int(normalized.get("capacity", 2) or 2)
            rate = float(normalized.get("rate") or normalized.get("price") or 0)
            status = normalized.get("status", "active").lower()
            notes = normalized.get("notes") or None

            if not number:
                continue

            # Determine category from type string
            type_lower = room_type_raw.lower()
            if "executive" in type_lower:
                category = RoomCategory.executive
            elif "suite" in type_lower:
                category = RoomCategory.suite
            elif "deluxe" in type_lower:
                category = RoomCategory.deluxe
            else:
                category = RoomCategory.standard

            rooms.append(Room(
                room_id=f"R{number}",
                number=number,
                category=category,
                floor=floor,
                base_rate=rate,
                capacity=capacity,
                status=status,
                notes=notes,
            ))

        return RoomsUploadResponse(success=True, rooms=rooms, count=len(rooms))
    except Exception as e:
        return RoomsUploadResponse(success=False, error=str(e))


# ── Bookings CSV Upload ───────────────────────────────────────────────────────

@app.post("/api/bookings/upload", response_model=BookingsUploadResponse)
async def upload_bookings(
    file: UploadFile = File(...),
    min_stay_rule: int = Form(2),
    hotel_name: str = Form("Uploaded Property"),
):
    """
    Accept a CSV with columns: booking_id, room_number, room_type, check_in, check_out,
    channel, guest_name, rate, status.
    Runs gap detection and returns PropertyStat data for the portfolio table.
    """
    try:
        content = await file.read()
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))

        bookings: list[Booking] = []
        rooms_seen: dict[str, Room] = {}

        CHANNEL_MAP = {
            "direct": Channel.direct,
            "booking.com": Channel.booking_com,
            "expedia": Channel.expedia,
            "gds": Channel.gds,
        }
        CATEGORY_MAP_TYPE = {
            "standard": RoomCategory.standard,
            "deluxe": RoomCategory.deluxe,
            "suite": RoomCategory.suite,
            "executive": RoomCategory.executive,
        }

        for row in reader:
            norm = {k.strip().lower(): v.strip() for k, v in row.items()}
            booking_id = norm.get("booking_id") or norm.get("id", f"BK{len(bookings)+1:04d}")
            room_number = norm.get("room_number") or norm.get("room number") or norm.get("room", "")
            room_type_raw = norm.get("room_type") or norm.get("room type") or norm.get("type", "Standard")
            check_in_str = norm.get("check_in") or norm.get("check in") or norm.get("checkin", "")
            check_out_str = norm.get("check_out") or norm.get("check out") or norm.get("checkout", "")
            channel_raw = (norm.get("channel") or "direct").lower()
            guest_name = norm.get("guest_name") or norm.get("guest name") or norm.get("guest", "Guest")
            rate = float(norm.get("rate") or norm.get("price") or 0)
            booking_status = norm.get("status", "confirmed")

            if not room_number or not check_in_str or not check_out_str:
                continue

            try:
                check_in = date.fromisoformat(check_in_str)
                check_out = date.fromisoformat(check_out_str)
            except ValueError:
                continue

            channel = CHANNEL_MAP.get(channel_raw, Channel.direct)
            room_id = f"R{room_number}"

            if room_id not in rooms_seen:
                type_lower = room_type_raw.lower()
                if "executive" in type_lower:
                    cat = RoomCategory.executive
                    base_rate = 350.0
                elif "suite" in type_lower:
                    cat = RoomCategory.suite
                    base_rate = 280.0
                elif "deluxe" in type_lower:
                    cat = RoomCategory.deluxe
                    base_rate = 180.0
                else:
                    cat = RoomCategory.standard
                    base_rate = 120.0

                rooms_seen[room_id] = Room(
                    room_id=room_id,
                    number=room_number,
                    category=cat,
                    floor=1,
                    base_rate=rate if rate > 0 else base_rate,
                )

            bookings.append(Booking(
                booking_id=booking_id,
                room_id=room_id,
                check_in=check_in,
                check_out=check_out,
                channel=channel,
                rate=rate,
                guest_name=guest_name,
                status=booking_status,
            ))

        if not bookings:
            return BookingsUploadResponse(success=False, error="No valid bookings found in CSV.")

        rooms = list(rooms_seen.values())
        all_dates = [b.check_in for b in bookings] + [b.check_out for b in bookings]
        start_date = min(all_dates)
        end_date = max(all_dates)
        date_range_days = (end_date - start_date).days or 30

        matrix, booking_map = build_availability_matrix(rooms, bookings, start_date, end_date)
        gaps = detect_orphan_gaps(rooms, bookings, matrix, booking_map, min_stay_rule)
        gaps = score_gaps(gaps)
        opportunities = find_rebundle_opportunities(gaps, min_stay_rule)

        total_room_nights = len(rooms) * date_range_days
        orphan_nights = sum(g.gap_length_nights for g in gaps)
        lost_rev = sum(g.estimated_lost_revenue for g in gaps)
        recoverable = sum(o.estimated_revenue_recovery for o in opportunities)
        recovery_pct = round(recoverable / lost_rev * 100, 1) if lost_rev > 0 else 0

        # Build trend from weekly occupancy over last 7 weeks
        trend = _compute_trend(bookings, start_date, date_range_days)

        prop = PropertyStat(
            id="uploaded",
            name=hotel_name,
            rooms=len(rooms),
            orphan_nights=orphan_nights,
            monthly_leakage=round(lost_rev, 2),
            recovered=round(recoverable, 2),
            recovery_pct=recovery_pct,
            trend=trend,
            status="Connected",
            pms="Uploaded CSV",
        )

        return BookingsUploadResponse(
            success=True,
            properties=[prop],
            total_recoverable=round(lost_rev, 2),
            avg_recovery_pct=recovery_pct,
            orphan_gaps=gaps,
        )

    except Exception as e:
        return BookingsUploadResponse(success=False, error=str(e))


def _compute_trend(bookings: list[Booking], start_date: date, days: int) -> list[float]:
    """Compute weekly occupancy % for a simple sparkline (7 data points)."""
    weeks = min(7, days // 7 or 1)
    week_len = days // weeks
    trend = []
    for w in range(weeks):
        week_start = start_date + timedelta(days=w * week_len)
        week_end = week_start + timedelta(days=week_len)
        booked_nights = sum(
            (min(b.check_out, week_end) - max(b.check_in, week_start)).days
            for b in bookings
            if b.check_in < week_end and b.check_out > week_start
        )
        total = len({b.room_id for b in bookings}) * week_len
        trend.append(round(booked_nights / total * 100, 1) if total > 0 else 0)
    return trend


# ── Orphan Gap Detection (ML-only, uses uploaded bookings) ───────────────────

@app.post("/api/analyze-bookings", response_model=AnalyzeBookingsResponse)
def analyze_bookings(request: AnalyzeBookingsRequest):
    """
    Run ML gap-detection pipeline on caller-supplied bookings.
    Does NOT call the LLM — pure ML only.
    """
    print(f"[GG:analyze-bookings] received {len(request.bookings)} bookings, min_stay={request.min_stay_rule}")
    if request.bookings:
        b0 = request.bookings[0]
        print(f"[GG:analyze-bookings] sample[0]: room={b0.room_number!r} type={b0.room_type!r} in={b0.check_in!r} out={b0.check_out!r}")
    try:
        CATEGORY_MAP_TYPE = {
            "executive": RoomCategory.executive,
            "suite": RoomCategory.suite,
            "deluxe": RoomCategory.deluxe,
        }
        CHANNEL_DEFAULT = Channel.direct

        rooms_seen: dict[str, Room] = {}
        bookings_ml: list[Booking] = []

        for b in request.bookings:
            raw = str(b.room_number).strip()
            digits = "".join(c for c in raw if c.isdigit())
            room_num = digits if digits else raw
            room_id = f"R{room_num}"

            if room_id not in rooms_seen:
                type_lower = b.room_type.lower()
                cat = next(
                    (v for k, v in CATEGORY_MAP_TYPE.items() if k in type_lower),
                    RoomCategory.standard,
                )
                base_rate = {
                    RoomCategory.executive: 350.0,
                    RoomCategory.suite: 280.0,
                    RoomCategory.deluxe: 180.0,
                    RoomCategory.standard: 120.0,
                }[cat]
                rooms_seen[room_id] = Room(
                    room_id=room_id,
                    number=raw,
                    category=cat,
                    floor=1,
                    base_rate=b.rate if b.rate > 0 else base_rate,
                )

            try:
                check_in = date.fromisoformat(b.check_in)
                check_out = date.fromisoformat(b.check_out)
            except ValueError:
                continue

            if b.status.lower() == "cancelled":
                continue

            bookings_ml.append(Booking(
                booking_id=f"BK-{len(bookings_ml)+1:04d}",
                room_id=room_id,
                check_in=check_in,
                check_out=check_out,
                channel=CHANNEL_DEFAULT,
                rate=b.rate,
                guest_name=b.guest_name or "Guest",
                status=b.status,
            ))

        print(f"[GG:analyze-bookings] valid bookings built: {len(bookings_ml)}, unique rooms: {len(rooms_seen)}")
        if not bookings_ml:
            return AnalyzeBookingsResponse(success=False, error="No valid bookings to analyse.")

        rooms = list(rooms_seen.values())
        all_dates = [b.check_in for b in bookings_ml] + [b.check_out for b in bookings_ml]
        start_date = min(all_dates)
        end_date = max(all_dates)
        total_rn = len(rooms) * (end_date - start_date).days
        print(f"[GG:analyze-bookings] date range: {start_date} → {end_date}  total_rn={total_rn}")

        matrix, booking_map = build_availability_matrix(rooms, bookings_ml, start_date, end_date)
        print(f"[GG:analyze-bookings] matrix shape: {matrix.shape}")
        gaps = detect_orphan_gaps(rooms, bookings_ml, matrix, booking_map, request.min_stay_rule)
        print(f"[GG:analyze-bookings] raw gaps detected: {len(gaps)}")
        gaps = score_gaps(gaps)
        opportunities = find_rebundle_opportunities(gaps, request.min_stay_rule)
        print(f"[GG:analyze-bookings] opportunities: {len(opportunities)}")

        orphan_nights = sum(g.gap_length_nights for g in gaps)
        lost_rev = sum(g.estimated_lost_revenue for g in gaps)
        print(f"[GG:analyze-bookings] orphan_nights={orphan_nights}  lost_rev=${lost_rev:.2f}")

        score_before = CapacityScore(
            total_room_nights=total_rn,
            sellable_room_nights=total_rn - orphan_nights,
            orphan_gap_nights=orphan_nights,
            fragmentation_rate=round(orphan_nights / total_rn * 100, 1) if total_rn > 0 else 0.0,
            usable_capacity_pct=round((total_rn - orphan_nights) / total_rn * 100, 1) if total_rn > 0 else 0.0,
            estimated_lost_revenue=round(lost_rev, 2),
        )

        print(f"[GG:analyze-bookings] returning success — gaps={len(gaps)}")
        return AnalyzeBookingsResponse(
            success=True,
            orphan_gaps=gaps,
            opportunities=opportunities,
            score_before=score_before,
        )
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"[GG:analyze-bookings] ERROR: {e}")
        return AnalyzeBookingsResponse(success=False, error=str(e))


# ── AI Recommendations (LLM, uses pre-computed gaps) ─────────────────────────

@app.post("/api/ai-recommendations", response_model=AIRecommendationsResponse)
def ai_recommendations(request: AIRecommendationsRequest):
    """
    Generate LLM revenue recommendations from pre-computed orphan gaps.
    Requires a valid API key.
    """
    print(f"[GG:ai-recommendations] received gaps={len(request.orphan_gaps)} opps={len(request.opportunities)}")
    print(f"[GG:ai-recommendations] score_before: {request.score_before}")
    print(f"[GG:ai-recommendations] provider={settings.llm_provider!r}  has_key={bool(settings.active_api_key)}")
    try:
        if not settings.active_api_key:
            raise ValueError(
                f"No API key set for provider '{settings.llm_provider}'. "
                f"Check your .env file."
            )

        print(f"[GG:ai-recommendations] calling generate_recommendations...")
        from ai.recommendation_engine import generate_recommendations
        rec_set = generate_recommendations(
            request.orphan_gaps,
            request.opportunities,
            request.score_before,
            request.hotel_name,
        )
        print(f"[GG:ai-recommendations] got {len(rec_set.recommendations)} recommendations")
        print(f"[GG:ai-recommendations] summary: {rec_set.executive_summary[:120]!r}")

        return AIRecommendationsResponse(
            success=True,
            recommendations=rec_set.recommendations,
            executive_summary=rec_set.executive_summary,
        )
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"[GG:ai-recommendations] ERROR: {e}")
        return AIRecommendationsResponse(success=False, error=str(e))


# ── Full ML Analysis ──────────────────────────────────────────────────────────

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    """
    Full pipeline: mock data → matrix → gaps → scoring → optimizer → AI recommendations.
    """
    try:
        if not settings.active_api_key:
            raise ValueError(
                f"No API key set for provider '{settings.llm_provider}'. "
                f"Check your .env file."
            )

        data = generate_hotel_data(
            total_rooms=request.total_rooms,
            date_range_days=request.date_range_days,
            min_stay_rule=request.min_stay_rule,
            seed=request.seed,
        )

        matrix, booking_map = build_availability_matrix(
            data["rooms"], data["bookings"], data["start_date"], data["end_date"]
        )

        gaps = detect_orphan_gaps(
            data["rooms"], data["bookings"], matrix, booking_map, request.min_stay_rule
        )
        gaps = score_gaps(gaps)
        opportunities = find_rebundle_opportunities(gaps, request.min_stay_rule)

        total_rn = request.total_rooms * request.date_range_days
        orphan_nights = sum(g.gap_length_nights for g in gaps)
        lost_rev = sum(g.estimated_lost_revenue for g in gaps)

        score_before = CapacityScore(
            total_room_nights=total_rn,
            sellable_room_nights=total_rn - orphan_nights,
            orphan_gap_nights=orphan_nights,
            fragmentation_rate=round(orphan_nights / total_rn * 100, 1),
            usable_capacity_pct=round((total_rn - orphan_nights) / total_rn * 100, 1),
            estimated_lost_revenue=round(lost_rev, 2),
        )

        from ai.recommendation_engine import generate_recommendations
        rec_set = generate_recommendations(gaps, opportunities, score_before, request.hotel_name)

        recoverable = sum(o.estimated_revenue_recovery for o in opportunities)
        recovered_nights = sum(
            sum(
                next((g.gap_length_nights for g in gaps if g.gap_id == gid), 0)
                for gid in o.gap_ids
            )
            for o in opportunities
        ) if opportunities else orphan_nights * 0.6

        score_after = CapacityScore(
            total_room_nights=total_rn,
            sellable_room_nights=score_before.sellable_room_nights + int(recovered_nights),
            orphan_gap_nights=max(0, orphan_nights - int(recovered_nights)),
            fragmentation_rate=round(
                max(0, orphan_nights - recovered_nights) / total_rn * 100, 1
            ),
            usable_capacity_pct=round(
                (score_before.sellable_room_nights + recovered_nights) / total_rn * 100, 1
            ),
            estimated_lost_revenue=round(max(0, lost_rev - recoverable), 2),
        )

        result = AnalysisResult(
            hotel_name=request.hotel_name,
            analysis_date=date.today(),
            date_range_start=data["start_date"],
            date_range_end=data["end_date"],
            total_rooms=request.total_rooms,
            score_before=score_before,
            score_after=score_after,
            orphan_gaps=gaps,
            rebundle_opportunities=opportunities,
            recommendations=rec_set.recommendations,
            improvement_pct=round(
                score_after.usable_capacity_pct - score_before.usable_capacity_pct, 1
            ),
        )

        return AnalyzeResponse(success=True, result=result)

    except Exception as e:
        return AnalyzeResponse(success=False, error=str(e))


# ── Heatmap Matrix ────────────────────────────────────────────────────────────

@app.get("/api/matrix", response_model=MatrixResponse)
def get_matrix(
    total_rooms: int = 50,
    date_range_days: int = 90,
    seed: int = 42,
    min_stay_rule: int = 2,
):
    """Return room × date availability matrix for the ECharts heatmap."""
    data = generate_hotel_data(
        total_rooms=total_rooms, date_range_days=date_range_days, seed=seed
    )
    matrix, booking_map = build_availability_matrix(
        data["rooms"], data["bookings"], data["start_date"], data["end_date"]
    )
    gaps = detect_orphan_gaps(
        data["rooms"], data["bookings"], matrix, booking_map, min_stay_rule
    )
    gap_dates: set[tuple] = {
        (g.room_id, str(g.start_date + timedelta(days=d)))
        for g in gaps
        for d in range(g.gap_length_nights)
    }

    cells: list[MatrixCell] = []
    for room_id in matrix.index:
        for d in matrix.columns:
            date_str = d.strftime("%Y-%m-%d")
            is_avail = bool(matrix.loc[room_id, d])
            if (room_id, date_str) in gap_dates:
                status = "orphan_gap"
            elif not is_avail:
                status = "booked"
            else:
                status = "available"
            cells.append(MatrixCell(room_id=room_id, date=date_str, status=status))

    return MatrixResponse(
        cells=cells,
        rooms=[r.room_id for r in data["rooms"]],
        date_range_start=str(data["start_date"]),
        date_range_end=str(data["end_date"]),
    )


# ── AI Chatbot ────────────────────────────────────────────────────────────────

@app.post("/api/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest):
    """AI chatbot — revenue management Q&A using the configured LLM."""
    try:
        if not settings.active_api_key:
            raise ValueError(
                f"No API key set for provider '{settings.llm_provider}'. "
                f"Check your .env file."
            )
        reply = ai_chat(
            message=request.message,
            history=request.history,
            context=request.context,
        )
        info = get_provider_info()
        return ChatResponse(message=reply, provider=info["provider"], model=info["model"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── LLM Provider Info ─────────────────────────────────────────────────────────

@app.get("/api/llm-info")
def llm_info():
    """Return the currently configured LLM provider and model."""
    info = get_provider_info()
    return {
        "provider": info["provider"],
        "model": info["model"],
        "has_key": bool(settings.active_api_key),
    }


# ── LLM Config Update ─────────────────────────────────────────────────────────

from pydantic import BaseModel as PydanticBase

class LlmConfigRequest(PydanticBase):
    provider: str
    model: str = ""
    api_key: str = ""

def _persist_env(key_name: str, value: str):
    """Rewrite the matching KEY=... line in .env so the value survives restarts."""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        new_lines = []
        replaced = False
        for line in lines:
            if line.startswith(f"{key_name}="):
                new_lines.append(f"{key_name}={value}\n")
                replaced = True
            else:
                new_lines.append(line)
        if not replaced:
            new_lines.append(f"{key_name}={value}\n")
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        print(f"[GG:llm-config] persisted {key_name} to .env")
    except Exception as e:
        print(f"[GG:llm-config] WARNING: could not write .env: {e}")


@app.post("/api/llm-config")
def update_llm_config(req: LlmConfigRequest):
    """Update LLM provider/model/key at runtime and persist to .env."""
    valid = {"claude", "openai", "gemini", "minimax"}
    if req.provider not in valid:
        raise HTTPException(status_code=400, detail=f"provider must be one of {valid}")

    settings.llm_provider = req.provider
    settings.llm_model = req.model
    _persist_env("LLM_PROVIDER", req.provider)
    if req.model:
        _persist_env("LLM_MODEL", req.model)

    if req.api_key:
        key_map = {
            "claude":   ("anthropic_api_key",  "ANTHROPIC_API_KEY"),
            "openai":   ("openai_api_key",      "OPENAI_API_KEY"),
            "gemini":   ("google_api_key",      "GOOGLE_API_KEY"),
            "minimax":  ("minimax_api_key",     "MINIMAX_API_KEY"),
        }
        attr, env_name = key_map[req.provider]
        setattr(settings, attr, req.api_key)
        _persist_env(env_name, req.api_key)

    return {
        "ok": True,
        "provider": settings.llm_provider,
        "model": settings.active_model,
        "has_key": bool(settings.active_api_key),
    }


# ── Holiday & Event Store ────────────────────────────────────────────────────

# In-memory caches: avoid repeated computation per request
_holiday_store: dict[str, list[dict]] = {}          # "location:year" → list of holiday dicts
_event_store: dict[str, dict[int, list[dict]]] = {}  # location → year → list of event dicts


def _extract_state_code(location: str) -> str | None:
    """Extract US 2-letter state abbreviation from location string."""
    match = re.search(r',\s*([A-Z]{2})\b', location.upper())
    return match.group(1) if match else None


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """Return the nth occurrence of weekday (Mon=0..Sun=6) in the given month.
    n=-1 returns the last occurrence."""
    if n == -1:
        _, max_day = monthrange(year, month)
        last = date(year, month, max_day)
        delta = (last.weekday() - weekday) % 7
        return last - timedelta(days=delta)
    first = date(year, month, 1)
    delta = (weekday - first.weekday()) % 7
    return first + timedelta(days=delta + (n - 1) * 7)


def _build_events(location: str, year: int) -> list[dict]:
    """Build hospitality-relevant events for a location/year (nationwide + city-specific)."""
    loc_up = location.upper()
    state = _extract_state_code(location)
    evts: list[dict] = []

    def add(d: date, name: str, type_: str, impact: str, desc: str = ""):
        evts.append({"date": str(d), "name": name, "type": type_, "impact": impact, "description": desc})

    # ── Nationwide ──────────────────────────────────────────────────────────
    add(date(year, 2, 14), "Valentine's Day", "cultural", "high", "Peak demand for romantic getaways")
    add(date(year, 7, 4),  "Independence Day", "festival", "high", "Major travel holiday")
    add(date(year, 10, 31), "Halloween", "festival", "medium", "Weekend events drive leisure travel")
    add(date(year, 12, 24), "Christmas Eve", "holiday_period", "high", "Peak holiday travel")
    add(date(year, 12, 31), "New Year's Eve", "festival", "high", "Premium pricing opportunity")
    add(date(year, 3, 14),  "Spring Break Begins", "holiday_period", "high", "Student & family travel surge")

    # Memorial Day weekend (Sat before last Mon in May)
    mem_mon = _nth_weekday(year, 5, 0, -1)
    add(mem_mon - timedelta(days=2), "Memorial Day Weekend", "holiday_period", "high", "Peak leisure travel weekend")
    # Labor Day weekend (Sat before first Mon in September)
    labor_mon = _nth_weekday(year, 9, 0, 1)
    add(labor_mon - timedelta(days=2), "Labor Day Weekend", "holiday_period", "high", "Last summer travel surge")
    # Thanksgiving (4th Thursday in November)
    thanksgiving = _nth_weekday(year, 11, 3, 4)
    add(thanksgiving, "Thanksgiving Weekend", "holiday_period", "high", "Family travel peak")

    # ── City / state specific ────────────────────────────────────────────────
    if state == "NY" or "NEW YORK" in loc_up:
        add(date(year, 3, 17),  "St. Patrick's Day Parade", "cultural", "high", "Major NYC street event")
        add(date(year, 6, 28),  "NYC Pride Parade", "cultural", "high", "Large-scale city event")
        add(date(year, 2, 7),   "NYC Fashion Week (Feb)", "trade", "high", "Trade visitors fill Midtown hotels")
        add(date(year, 9, 5),   "NYC Fashion Week (Sept)", "trade", "high", "Post-Labor Day demand spike")
        add(date(year, 8, 25),  "US Open Tennis Begins", "sports", "medium", "Flushing Meadows draws international visitors")
        add(_nth_weekday(year, 11, 6, 1), "NYC Marathon", "sports", "high", "City-wide demand spike")

    elif state == "CA" or "LOS ANGELES" in loc_up or "SAN FRANCISCO" in loc_up:
        add(date(year, 1, 1),   "Rose Parade (Pasadena)", "festival", "high", "New Year's Day tradition")
        add(date(year, 3, 16),  "LA Marathon", "sports", "medium", "Road closures & hotel demand")
        add(date(year, 6, 29),  "SF Pride Parade", "cultural", "high", "Large-scale city event")
        add(date(year, 4, 11),  "Coachella Weekend 1", "festival", "high", "Desert resort demand peak")
        add(date(year, 4, 18),  "Coachella Weekend 2", "festival", "high")

    elif state == "FL" or "MIAMI" in loc_up or "ORLANDO" in loc_up:
        add(date(year, 3, 21),  "Miami Music Week (MMW)", "festival", "high", "Massive influx to South Beach")
        add(date(year, 3, 7),   "Spring Break Peak (FL)", "holiday_period", "high")
        add(date(year, 10, 4),  "Halloween Horror Nights (Orlando)", "festival", "medium")

    elif state == "IL" or "CHICAGO" in loc_up:
        add(date(year, 7, 31),  "Lollapalooza Chicago", "festival", "high", "Grant Park music festival")
        add(date(year, 10, 11), "Chicago Marathon", "sports", "high")
        add(date(year, 3, 17),  "Chicago St. Patrick's Day", "cultural", "high", "River dyeing tradition")

    elif state == "NV" or "LAS VEGAS" in loc_up:
        add(date(year, 1, 5),   "CES (Consumer Electronics Show)", "trade", "high", "Largest tech trade show")
        add(date(year, 11, 19), "Las Vegas Grand Prix", "sports", "high", "F1 street circuit")
        add(date(year, 3, 27),  "March Madness Finals", "sports", "medium")

    elif state == "TX" or "HOUSTON" in loc_up or "DALLAS" in loc_up or "AUSTIN" in loc_up:
        add(date(year, 3, 7),   "SXSW (Austin)", "trade", "high", "Music, film & tech festival")
        add(date(year, 10, 3),  "Texas State Fair (Dallas)", "festival", "medium")

    elif state == "MA" or "BOSTON" in loc_up:
        add(_nth_weekday(year, 4, 0, 3), "Boston Marathon", "sports", "high", "Third Monday in April")
        add(date(year, 6, 15),  "Boston Pride Parade", "cultural", "medium")

    # Dedup by (date, name) and sort
    seen: set[tuple] = set()
    result = []
    for e in sorted(evts, key=lambda x: x["date"]):
        k = (e["date"], e["name"])
        if k not in seen:
            seen.add(k)
            result.append(e)
    return result


@app.get("/api/holidays", response_model=HolidaysResponse)
def get_holidays(location: str = "New York, NY · USA", year: int = 0):
    """Return public holidays for a US location and year."""
    if not year:
        year = date.today().year

    cache_key = f"{location}:{year}"
    if cache_key not in _holiday_store:
        rows: list[dict] = []
        if _HOLIDAYS_AVAILABLE:
            state = _extract_state_code(location)
            try:
                h = _holidays_lib.US(subdiv=state, years=year) if state else _holidays_lib.US(years=year)
                rows = [
                    {"date": str(d), "name": name, "type": "public"}
                    for d, name in sorted(h.items())
                ]
            except Exception as exc:
                print(f"[GG:holidays] {exc}")
        _holiday_store[cache_key] = rows

    return HolidaysResponse(
        holidays=_holiday_store[cache_key],
        location=location,
        year=year,
    )


@app.get("/api/events", response_model=EventsResponse)
def get_events(location: str = "New York, NY · USA", days: int = 180):
    """Return upcoming hospitality-relevant events for a location."""
    today = date.today()
    end = today + timedelta(days=days)

    if location not in _event_store:
        _event_store[location] = {}

    for yr in {today.year, end.year}:
        if yr not in _event_store[location]:
            _event_store[location][yr] = _build_events(location, yr)

    all_evts = _event_store[location][today.year] + (
        _event_store[location].get(end.year, []) if end.year != today.year else []
    )
    upcoming = sorted(
        [e for e in all_evts if today <= date.fromisoformat(e["date"]) <= end],
        key=lambda x: x["date"],
    )
    return EventsResponse(events=upcoming, location=location)


# ── Gmail Integration ──────────────────────────────────────────────────────────

_AUTH_ERRORS = ("invalid_grant", "token has been expired", "token has been revoked", "invalid_rapt")

@app.get("/api/gmail/status", response_model=GmailStatusResponse)
def gmail_status():
    """Check Gmail auth status. Auto-clears expired/revoked tokens."""
    import gmail_client as gc
    authenticated = gc.is_authenticated()
    auth_url = None
    unread = 0
    user_email = None

    if authenticated:
        try:
            user_email = gc.get_user_email()
            unread = gc.get_unread_inquiry_count()
        except Exception as ex:
            err_lower = str(ex).lower()
            if any(e in err_lower for e in _AUTH_ERRORS):
                # Token revoked or expired — clear it so the connect flow kicks in
                gc.clear_token()
                authenticated = False
            # Other errors (network etc.) — keep authenticated=True, just skip unread

    if not authenticated:
        if settings.gmail_client_id and not settings.gmail_client_id.startswith("your-"):
            try:
                auth_url = gc.get_auth_url()
            except Exception:
                pass

    return GmailStatusResponse(
        authenticated=authenticated,
        auth_url=auth_url,
        unread_inquiry_count=unread,
        user_email=user_email,
    )


@app.get("/api/gmail/auth-url")
def gmail_auth_url():
    """Get Google OAuth authorization URL."""
    if not settings.gmail_client_id or settings.gmail_client_id.startswith("your-"):
        raise HTTPException(status_code=400, detail="Gmail client_id not configured in .env")
    import gmail_client as gc
    return {"auth_url": gc.get_auth_url()}


@app.get("/api/gmail/callback")
def gmail_callback(code: str, state: str = ""):
    """Handle OAuth callback — exchange code for tokens then redirect to frontend."""
    import gmail_client as gc
    try:
        gc.exchange_code(code)
        return RedirectResponse(url=f"{settings.frontend_url}/?gmail=connected")
    except Exception as e:
        return RedirectResponse(url=f"{settings.frontend_url}/?gmail=error&msg={str(e)[:100]}")


@app.get("/api/gmail/emails", response_model=EmailsResponse)
def gmail_emails(max_results: int = 30, unread_only: bool = False):
    """Fetch recent emails, filtered to booking inquiries first."""
    import gmail_client as gc
    try:
        emails = gc.fetch_recent_emails(max_results=max_results, unread_only=unread_only)
        # Sort: unread booking inquiries first
        emails.sort(key=lambda e: (not e["is_booking_inquiry"], not e["is_unread"]))
        from models import EmailSummary
        return EmailsResponse(
            success=True,
            emails=[EmailSummary(**{k: v for k, v in e.items() if k != "body"}) for e in emails],
        )
    except Exception as ex:
        return EmailsResponse(success=False, error=str(ex))


@app.get("/api/gmail/email/{message_id}", response_model=ParsedEmailResponse)
def gmail_get_email(message_id: str):
    """Fetch a single email and parse it with AI."""
    import gmail_client as gc
    from ai.email_parser import parse_inquiry
    from models import EmailDetail, BookingDetails as BDModel
    try:
        raw = gc.fetch_email_by_id(message_id)
        gc.mark_as_read(message_id)
        details = parse_inquiry(
            subject=raw["subject"],
            body=raw["body"],
            sender=raw["sender"],
        )
        return ParsedEmailResponse(
            success=True,
            email=EmailDetail(**raw),
            booking_details=BDModel(**details.model_dump()),
        )
    except Exception as ex:
        import traceback; traceback.print_exc()
        return ParsedEmailResponse(success=False, error=str(ex))


@app.post("/api/gmail/draft-reply")
def gmail_draft_reply(req: DraftReplyRequest):
    """Generate an AI-drafted reply for a given email."""
    import gmail_client as gc
    from ai.email_parser import parse_inquiry, draft_reply
    try:
        raw = gc.fetch_email_by_id(req.message_id)
        details = parse_inquiry(raw["subject"], raw["body"], raw["sender"])
        reply = draft_reply(
            subject=raw["subject"],
            body=raw["body"],
            sender=raw["sender"],
            booking_details=details,
            reply_type=req.reply_type,
            custom_instruction=req.custom_instruction,
        )
        return {"success": True, "draft": reply, "to": raw["reply_to"] or raw["sender"]}
    except Exception as ex:
        return {"success": False, "error": str(ex)}


@app.post("/api/gmail/send", response_model=SendReplyResponse)
def gmail_send(req: SendReplyRequest):
    """Send an email reply."""
    import gmail_client as gc
    try:
        sent_id = gc.send_reply(
            to=req.to,
            subject=req.subject,
            body=req.body,
            thread_id=req.thread_id or None,
        )
        return SendReplyResponse(success=True, sent_id=sent_id)
    except Exception as ex:
        return SendReplyResponse(success=False, error=str(ex))


# SSE stream — pushes new inquiry count every 30 s
@app.get("/api/gmail/stream")
async def gmail_stream(request: Request):
    import gmail_client as gc

    async def event_generator():
        last_count = -1
        while True:
            if await request.is_disconnected():
                break
            try:
                count = gc.get_unread_inquiry_count() if gc.is_authenticated() else 0
            except Exception:
                count = 0
            if count != last_count:
                last_count = count
                yield {"data": str(count)}
            await asyncio.sleep(10)

    return EventSourceResponse(event_generator())


@app.get("/api/gmail/thread/{thread_id}", response_model=ThreadResponse)
def gmail_thread(thread_id: str):
    """Fetch all messages in a Gmail thread."""
    import gmail_client as gc
    try:
        messages = gc.fetch_thread(thread_id)
        return ThreadResponse(success=True, messages=messages)
    except Exception as ex:
        return ThreadResponse(success=False, error=str(ex))


# ── Bookings ──────────────────────────────────────────────────────────────────

@app.post("/api/bookings", response_model=BookingRecord)
def create_booking(req: CreateBookingRequest):
    """Create a confirmed booking from an email inquiry."""
    from bookings_store import create_booking as store_create
    booking = store_create(req.model_dump())
    return BookingRecord(**booking)


@app.get("/api/bookings", response_model=list[BookingRecord])
def list_bookings():
    """List all bookings."""
    from bookings_store import list_bookings as store_list
    return [BookingRecord(**b) for b in store_list()]
