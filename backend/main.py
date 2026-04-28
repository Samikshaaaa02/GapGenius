"""GapGenius FastAPI backend — all routes."""
import io
import csv
import os
import warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="instructor")
from datetime import date, timedelta
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models import (
    AnalyzeRequest, AnalyzeResponse, AnalysisResult, CapacityScore,
    ChatRequest, ChatResponse,
    RoomsUploadResponse, BookingsUploadResponse, PropertyStat,
    MatrixResponse, MatrixCell,
    Room, Booking, RoomCategory, Channel,
    AnalyzeBookingsRequest, AnalyzeBookingsResponse,
    AIRecommendationsRequest, AIRecommendationsResponse,
)
from data.mock_generator import generate_hotel_data
from ml.gap_detector import build_availability_matrix, detect_orphan_gaps
from ml.fragmentation_scorer import score_gaps
from ml.slot_optimizer import find_rebundle_opportunities
from ai.chatbot import chat as ai_chat, get_provider_info

app = FastAPI(title="GapGenius API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
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
