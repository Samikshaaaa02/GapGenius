from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from enum import Enum


class RoomCategory(str, Enum):
    standard = "Standard"
    deluxe = "Deluxe"
    suite = "Suite"
    executive = "Executive"


class Channel(str, Enum):
    direct = "Direct"
    booking_com = "Booking.com"
    expedia = "Expedia"
    gds = "GDS"


class BookingStatus(str, Enum):
    booked = "booked"
    available = "available"
    blocked = "blocked"
    orphan_gap = "orphan_gap"


class Room(BaseModel):
    room_id: str
    number: str
    category: RoomCategory
    floor: int
    base_rate: float
    capacity: int = 2
    status: str = "active"
    notes: Optional[str] = None


class Booking(BaseModel):
    booking_id: str
    room_id: str
    check_in: date
    check_out: date
    channel: Channel
    rate: float
    guest_name: str
    status: str = "confirmed"


class OrphanGap(BaseModel):
    gap_id: str
    room_id: str
    room_category: RoomCategory
    start_date: date
    end_date: date
    gap_length_nights: int
    surrounding_booking_ids: List[str]
    channels_available: List[Channel]
    estimated_lost_revenue: float
    severity_score: float
    severity_label: str


class RebundleOpportunity(BaseModel):
    opportunity_id: str
    gap_ids: List[str]
    room_ids: List[str]
    proposed_start: date
    proposed_end: date
    total_nights: int
    proposed_action: str
    estimated_revenue_recovery: float
    confidence: float


class AIRecommendation(BaseModel):
    recommendation_id: str
    headline: str
    rationale: str
    action: str
    affected_rooms: List[str]
    affected_dates: str
    channel: Optional[Channel] = None
    estimated_revenue_lift: float
    priority: str
    implementation_difficulty: str


class CapacityScore(BaseModel):
    total_room_nights: int
    sellable_room_nights: int
    orphan_gap_nights: int
    fragmentation_rate: float
    usable_capacity_pct: float
    estimated_lost_revenue: float


class AnalysisResult(BaseModel):
    hotel_name: str
    analysis_date: date
    date_range_start: date
    date_range_end: date
    total_rooms: int
    score_before: CapacityScore
    score_after: CapacityScore
    orphan_gaps: List[OrphanGap]
    rebundle_opportunities: List[RebundleOpportunity]
    recommendations: List[AIRecommendation]
    improvement_pct: float


# ── API request / response models ──────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    hotel_name: str = "Demo Hotel"
    date_range_days: int = 90
    total_rooms: int = 50
    min_stay_rule: int = 2
    seed: int = 42


class AnalyzeResponse(BaseModel):
    success: bool
    result: Optional[AnalysisResult] = None
    error: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    message: str
    provider: str
    model: str


class PropertyStat(BaseModel):
    id: str
    name: str
    rooms: int
    orphan_nights: int
    monthly_leakage: float
    recovered: float
    recovery_pct: float
    trend: List[float]
    status: str
    pms: str


class BookingsUploadResponse(BaseModel):
    success: bool
    properties: List[PropertyStat] = []
    total_recoverable: float = 0
    avg_recovery_pct: float = 0
    orphan_gaps: List[OrphanGap] = []
    error: Optional[str] = None


class RoomsUploadResponse(BaseModel):
    success: bool
    rooms: List[Room] = []
    count: int = 0
    error: Optional[str] = None


class MatrixCell(BaseModel):
    room_id: str
    date: str
    status: str  # booked | available | orphan_gap
    rate: Optional[float] = None


class MatrixResponse(BaseModel):
    cells: List[MatrixCell]
    rooms: List[str]
    date_range_start: str
    date_range_end: str


# ── Orphan Gap Detection (ML-only) ─────────────────────────────────────────────

class BookingInput(BaseModel):
    room_number: str
    room_type: str = "Standard"
    check_in: str
    check_out: str
    rate: float = 0.0
    guest_name: Optional[str] = None
    status: str = "confirmed"


class AnalyzeBookingsRequest(BaseModel):
    bookings: List[BookingInput]
    min_stay_rule: int = 2
    hotel_name: str = "Uploaded Property"


class AnalyzeBookingsResponse(BaseModel):
    success: bool
    orphan_gaps: List[OrphanGap] = []
    opportunities: List[RebundleOpportunity] = []
    score_before: Optional[CapacityScore] = None
    error: Optional[str] = None


# ── AI Recommendations ────────────────────────────────────────────────────────

class AIRecommendationsRequest(BaseModel):
    orphan_gaps: List[OrphanGap] = []
    opportunities: List[RebundleOpportunity] = []
    score_before: CapacityScore
    hotel_name: str = "Uploaded Property"


class AIRecommendationsResponse(BaseModel):
    success: bool
    recommendations: List[AIRecommendation] = []
    executive_summary: str = ""
    error: Optional[str] = None


# ── Gmail models ──────────────────────────────────────────────────────────────

class EmailSummary(BaseModel):
    id: str
    thread_id: str
    subject: str
    sender: str
    date: str
    snippet: str
    is_unread: bool
    is_booking_inquiry: bool


class EmailDetail(EmailSummary):
    body: str
    reply_to: str = ""


class BookingDetails(BaseModel):
    is_booking_inquiry: bool
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    nights: Optional[int] = None
    rooms_needed: Optional[int] = None
    room_type_preference: Optional[str] = None
    guests_count: Optional[int] = None
    special_requests: Optional[str] = None
    budget_per_night: Optional[float] = None
    missing_info: List[str] = []
    suggested_reply: str = ""


class GmailStatusResponse(BaseModel):
    authenticated: bool
    auth_url: Optional[str] = None
    unread_inquiry_count: int = 0
    user_email: Optional[str] = None


class EmailsResponse(BaseModel):
    success: bool
    emails: List[EmailSummary] = []
    error: Optional[str] = None


class ParsedEmailResponse(BaseModel):
    success: bool
    email: Optional[EmailDetail] = None
    booking_details: Optional[BookingDetails] = None
    error: Optional[str] = None


class SendReplyRequest(BaseModel):
    message_id: str
    thread_id: str
    to: str
    subject: str
    body: str


class SendReplyResponse(BaseModel):
    success: bool
    sent_id: str = ""
    error: Optional[str] = None


class DraftReplyRequest(BaseModel):
    message_id: str
    reply_type: str = "custom"   # accept | reject | missing_info | custom
    custom_instruction: str = ""


class ThreadResponse(BaseModel):
    success: bool
    messages: List[EmailDetail] = []
    error: Optional[str] = None


class CreateBookingRequest(BaseModel):
    email_id: str
    thread_id: str
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    nights: Optional[int] = None
    rooms_needed: Optional[int] = None
    room_type_preference: Optional[str] = None
    guests_count: Optional[int] = None
    special_requests: Optional[str] = None


class BookingRecord(BaseModel):
    id: str
    created_at: str
    status: str
    email_id: Optional[str] = None
    thread_id: Optional[str] = None
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    nights: Optional[int] = None
    rooms_needed: Optional[int] = None
    room_type_preference: Optional[str] = None
    guests_count: Optional[int] = None
    special_requests: Optional[str] = None


# ── Holiday & Event Models ────────────────────────────────────────────────────

class HolidayItem(BaseModel):
    date: str
    name: str
    type: str = "public"  # "public", "observance"


class HolidaysResponse(BaseModel):
    holidays: List[HolidayItem]
    location: str
    year: int


class EventItem(BaseModel):
    date: str
    name: str
    type: str  # "festival", "sports", "cultural", "trade", "holiday_period"
    impact: str = "medium"  # "high", "medium", "low"
    description: str = ""


class EventsResponse(BaseModel):
    events: List[EventItem]
    location: str
