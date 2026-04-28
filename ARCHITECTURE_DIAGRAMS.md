# GapGenius Architecture Diagrams

## Layered Architecture Model

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            🖥️  USER LAYER                                 │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Dashboard   │  │ KPI Cards    │  │   Heatmap    │  │  Copilot     │  │
│  │ (Main View)  │  │ (Metrics)    │  │(Fragmentation│  │  (Chat AI)   │  │
│  │              │  │ occupancy,   │  │  Matrix)     │  │              │  │
│  │ React 19     │  │ ARR, ADR,    │  │              │  │ Multi-LLM    │  │
│  │ Router       │  │ RevPAR       │  │ Severity     │  │ Support      │  │
│  │              │  │              │  │ Colors       │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
                                   ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                      ⚙️  ORCHESTRATION LAYER                               │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │  FastAPI Gateway (Port 8000)                                       │   │
│  │  ├─ CORS Middleware (allow localhost:5173, :4173)                 │   │
│  │  ├─ Rate Limiting                                                  │   │
│  │  ├─ Request Validation (Pydantic models)                          │   │
│  │  └─ Error Handling & Logging                                       │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Routes:                                                                    │
│  ├─ POST  /api/rooms/upload        → Room inventory CSV                    │
│  ├─ POST  /api/bookings/upload     → Bookings CSV → Gap analysis          │
│  ├─ POST  /api/analyze             → Full ML pipeline                     │
│  ├─ GET   /api/matrix              → Heatmap data                         │
│  ├─ POST  /api/chat                → AI copilot Q&A                       │
│  ├─ GET   /api/llm-info            → Active provider/model                │
│  └─ GET   /health                  → Health check                         │
│                                                                             │
│  Session Manager: Maintains hotel context, bookings, analysis state       │
└────────────────────────────────────────────────────────────────────────────┘
          ↙                ↓                ↘
      (config)         (routes)          (context)
         │                │                 │
         ↓                ↓                 ↓
┌──────────────────┬──────────────────┬──────────────────┐
│  🧠  AI LAYER    │ 🔍  ML PIPELINE  │ 💾  DATA LAYER   │
│  (Copilot Brain) │  (Analysis)      │  (State)         │
└──────────────────┴──────────────────┴──────────────────┘
```

---

## AI Layer — Multi-LLM Copilot Brain

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    🧠 AI LAYER — Copilot Brain                           │
│                                                                           │
│  User Query (Chat)                                                        │
│  "Why are we losing revenue in May?"                                      │
│                ↓                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │ Chatbot.chat()                                        │               │
│  │ ├─ Build context block (hotel data, KPIs, matrix)   │               │
│  │ ├─ Inject into system prompt                         │               │
│  │ └─ Call LLM client                                   │               │
│  └──────────────────────────────────────────────────────┘               │
│                ↓                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │ llm_client.plain_completion()                         │               │
│  │ ├─ Check LLM_PROVIDER env var                        │               │
│  │ ├─ Load API key                                       │               │
│  │ └─ Select provider                                    │               │
│  └──────────────────────────────────────────────────────┘               │
│                ↓                                                          │
│      ┌─────────┼─────────┬──────────────┐                               │
│      ↓         ↓         ↓              ↓                               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐                         │
│  │ Claude │ │ GPT-4o │ │Gemini  │ │ MiniMax  │                         │
│  │        │ │        │ │ 2.0    │ │          │                         │
│  │Anthropic│ │OpenAI  │ │Google  │ │ China MKT│                         │
│  │        │ │        │ │        │ │          │                         │
│  │Best for:│ │Speed   │ │Batch   │ │Regional  │                         │
│  │Quality  │ │Cost    │ │Ops     │ │Support   │                         │
│  │Context  │ │        │ │        │ │          │                         │
│  └────────┘ └────────┘ └────────┘ └──────────┘                         │
│                ↓                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │ Fallback Strategy                                     │               │
│  │ ├─ Primary provider fails? → Try next               │               │
│  │ ├─ Rate limited? → Switch to cost-optimized         │               │
│  │ └─ Timeout? → Use cached response                    │               │
│  └──────────────────────────────────────────────────────┘               │
│                ↓                                                          │
│  AI Response (structured JSON or plain text)                             │
│  "Your May losses are driven by 87 orphan gaps (1-night singles)..."    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ML Pipeline Layer — Data Processing

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   🔍 ML PIPELINE LAYER — Analysis                        │
│                                                                           │
│  Input: Rooms CSV + Bookings CSV                                         │
│         (e.g., 50 rooms, 6-month history, 1000+ bookings)               │
│                ↓                                                          │
│  ┌────────────────────────────────────────────────────┐                 │
│  │ data/mock_generator.py                             │                 │
│  │ └─ Parse CSV → Room & Booking objects              │                 │
│  └────────────────────────────────────────────────────┘                 │
│                ↓                                                          │
│  ┌────────────────────────────────────────────────────┐                 │
│  │ ml/gap_detector.py                                 │                 │
│  │ build_availability_matrix()                        │                 │
│  │                                                     │                 │
│  │ Returns:                                            │                 │
│  │ ├─ DataFrame[rooms × dates] (bool)                │                 │
│  │ │  True = available, False = booked                │                 │
│  │ └─ booking_map: (room_id, date) → booking_id      │                 │
│  │                                                     │                 │
│  │ detect_orphan_gaps()                               │                 │
│  │ └─ Find single-night gaps too small to sell       │                 │
│  └────────────────────────────────────────────────────┘                 │
│                ↓                                                          │
│  ┌────────────────────────────────────────────────────┐                 │
│  │ ml/fragmentation_scorer.py                         │                 │
│  │ score_gaps()                                       │                 │
│  │                                                     │                 │
│  │ Output: Fragmentation metrics                      │                 │
│  │ ├─ Scatter index (0.0-1.0)                         │                 │
│  │ ├─ Severity per gap (LOW/MED/HIGH/CRITICAL)       │                 │
│  │ ├─ Channel-wise fragmentation                      │                 │
│  │ └─ Revenue impact per orphan                       │                 │
│  └────────────────────────────────────────────────────┘                 │
│                ↓                                                          │
│  ┌────────────────────────────────────────────────────┐                 │
│  │ ml/slot_optimizer.py                               │                 │
│  │ find_rebundle_opportunities()                      │                 │
│  │                                                     │                 │
│  │ Strategy: Consolidate orphans + LOS rules         │                 │
│  │ ├─ Group adjacent gaps                             │                 │
│  │ ├─ Respect min-length-of-stay constraints         │                 │
│  │ ├─ Evaluate channel mix                            │                 │
│  │ └─ Score revenue recovery potential                │                 │
│  └────────────────────────────────────────────────────┘                 │
│                ↓                                                          │
│  Output: Analysis Result                                                 │
│  ├─ total_leakage: $12,450                                              │
│  ├─ orphan_count: 87                                                    │
│  ├─ fragmentation_index: 0.68                                           │
│  ├─ opportunities: [rebundle_1, rebundle_2, ...]                        │
│  └─ recommendations: ["Consolidate OTA", "Lower ADR 1-night", ...]     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Layer — Context & State

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    💾 DATA LAYER — Session State                         │
│                                                                           │
│  ┌─────────────────────────────────────────────────────┐               │
│  │ Session Context                                     │               │
│  │                                                     │               │
│  │ {                                                   │               │
│  │   "property_id": "prop_12345",                     │               │
│  │   "property_name": "The Grand Hotel",              │               │
│  │   "rooms": [Room(...), Room(...), ...],            │               │
│  │   "bookings": [Booking(...), Booking(...), ...],   │               │
│  │   "analysis_date": "2025-06-15",                   │               │
│  │   "date_range": ("2025-04-01", "2025-06-30")      │               │
│  │ }                                                   │               │
│  └─────────────────────────────────────────────────────┘               │
│                ↕                                                         │
│  ┌─────────────────────────────────────────────────────┐               │
│  │ KPI Metrics                                         │               │
│  │                                                     │               │
│  │ {                                                   │               │
│  │   "occupancy_pct": 0.82,                           │               │
│  │   "arr": 24300,  # avg room revenue                │               │
│  │   "adr": 145.80, # avg daily rate                  │               │
│  │   "revpar": 118.56, # revenue per available room  │               │
│  │   "total_leakage": 12450,                          │               │
│  │   "orphan_count": 87,                              │               │
│  │   "fragmentation_index": 0.68,                     │               │
│  │   "usable_capacity_pct": 0.78                      │               │
│  │ }                                                   │               │
│  └─────────────────────────────────────────────────────┘               │
│                ↕                                                         │
│  ┌─────────────────────────────────────────────────────┐               │
│  │ Chat History                                        │               │
│  │                                                     │               │
│  │ [                                                   │               │
│  │   {                                                 │               │
│  │     "role": "user",                                │               │
│  │     "content": "Why are we losing revenue?",       │               │
│  │     "context": { hotel_data, matrix, kpis }       │               │
│  │   },                                                │               │
│  │   {                                                 │               │
│  │     "role": "assistant",                           │               │
│  │     "content": "Your May losses are driven by...",  │               │
│  │     "context": { llm_model, confidence }          │               │
│  │   }                                                 │               │
│  │ ]                                                   │               │
│  └─────────────────────────────────────────────────────┘               │
│                ↕                                                         │
│  Storage Backend                                                         │
│  ├─ Development: Python dict (in-memory)                               │
│  ├─ Staging: Redis (session cache)                                     │
│  └─ Production: PostgreSQL (persistent)                                │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow — End-to-End Request

```
User Action: Upload Bookings CSV
         ↓
Browser Form Submit
         ↓
POST /api/bookings/upload (multipart/form-data)
         ↓
FastAPI Route Handler
├─ Validate file (size, format)
├─ Parse CSV rows
└─ Create Booking objects
         ↓
Session Manager
├─ Store bookings in session context
└─ Trigger analysis
         ↓
ML Pipeline (gap_detector.py)
├─ Build availability matrix (rooms × dates)
├─ Detect orphan gaps
└─ Map bookings to gaps
         ↓
ML Pipeline (fragmentation_scorer.py)
├─ Score each gap
├─ Calculate metrics
└─ Identify high-impact gaps
         ↓
ML Pipeline (slot_optimizer.py)
├─ Find rebundling opportunities
├─ Evaluate revenue recovery
└─ Rank recommendations
         ↓
Tool Layer (KPI Calculator)
├─ Compute occupancy, ARR, ADR, RevPAR
├─ Calculate total leakage
└─ Generate heatmap data
         ↓
Data Layer
├─ Store analysis results in session
├─ Cache KPI metrics
└─ Prepare copilot context
         ↓
API Response (200 OK)
{
  "success": true,
  "bookings_count": 342,
  "date_range": ["2025-04-01", "2025-06-30"],
  "analysis": {
    "total_leakage": 12450,
    "orphan_count": 87,
    "fragmentation_index": 0.68,
    ...
  }
}
         ↓
Frontend (React)
├─ Update dashboard state
├─ Render KPI cards
├─ Display heatmap
└─ Enable copilot chat
         ↓
User sees recommendations + AI chat
```

---

## Multi-LLM Routing Strategy

```
User Query → /api/chat (POST)
         ↓
llm_client.check_provider()
         ↓
    ┌─────┴─────┬──────────┬──────────┐
    ↓           ↓          ↓          ↓
 Claude?    GPT-4o?   Gemini?    MiniMax?
    │           │          │          │
    ├─ Primary LLM_PROVIDER from .env
    │
    ├─ If rate limited:
    │  └─ Try next provider in fallback chain
    │
    ├─ If provider down:
    │  └─ Automatic failover
    │
    └─ Cost-aware routing:
       ├─ Batch analysis? → Gemini (cheapest)
       ├─ Quick response? → GPT-4o
       ├─ Complex task? → Claude (best quality)
       └─ Regional? → MiniMax

         ↓
    LLM API Call
    + System Prompt (revenue management expert)
    + Context (hotel data, KPIs, matrix)
    + User Query
         ↓
    Response
    {
      "reply": "actionable recommendation",
      "confidence": 0.92,
      "llm_model": "claude-3-sonnet-20250514"
    }
```

---

## Component Interaction Matrix

```
                 AI      ML      Data    Tools   Orch
Orch
├─ Routes requests to all layers       ✓       ✓       ✓       ✓
└─ Manages session context             ✓       ✓       ✓       ✓
                 
ML
├─ Reads from Data layer                       ✓
├─ Writes analysis results              ✓              ✓
└─ Uses Tool layer calculators                          ✓

AI
├─ Reads from Data layer                       ✓
├─ Gets hotel context from Orch         ✓
└─ Returns recommendations to Orch      ✓

Tools
├─ Computes KPIs from Data              ✓
└─ Generates heatmap for UI             ✓

Data
├─ Persists all layer outputs           ✓       ✓       ✓       ✓
└─ Serves as single source of truth

Frontend
├─ Calls all Orch routes                ✓       ✓       ✓       ✓
├─ Displays KPIs from Data              ✓
├─ Renders heatmap from Tools           ✓
└─ Shows copilot responses from AI      ✓
```

---

## Deployment Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT (LOCAL)                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend                          Backend                      │
│  ┌──────────────────┐             ┌──────────────────┐        │
│  │ Vite Dev Server  │             │ Uvicorn          │        │
│  │ localhost:5173   │◄────CORS───►│ localhost:8000   │        │
│  │ Hot reload       │             │ Hot reload       │        │
│  │ npm/bun dev      │             │ --reload flag    │        │
│  └──────────────────┘             └──────────────────┘        │
│                                                                 │
│  .env (local)                                                  │
│  LLM_PROVIDER=claude                                          │
│  ANTHROPIC_API_KEY=sk-ant-...                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    PRODUCTION (CLOUD)                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend                          Backend                      │
│  ┌──────────────────────┐         ┌──────────────────────┐    │
│  │ Cloudflare Pages     │         │ Railway / Render     │    │
│  │ (Static SPA)         │         │ (FastAPI container)  │    │
│  │ CDN globally cached  │◄─JSON──►│ PostgreSQL database  │    │
│  │ Instant deployment   │         │ Environment secrets  │    │
│  └──────────────────────┘         └──────────────────────┘    │
│                                                                 │
│  Secrets (env vars):                                            │
│  LLM_PROVIDER, API_KEY, DB_URL, etc. (never committed)        │
└────────────────────────────────────────────────────────────────┘
```

---

## Error Handling & Resilience

```
Request Processing
         ↓
    Error Occurs?
    ├─ Yes → Check Error Type
    │        ├─ Validation Error (400)
    │        │  └─ Return clear error + fix suggestion
    │        ├─ Auth Error (401)
    │        │  └─ Redirect to login
    │        ├─ Rate Limited (429)
    │        │  └─ Retry with exponential backoff
    │        ├─ LLM Timeout (503)
    │        │  └─ Fallback to next provider
    │        ├─ Database Error (500)
    │        │  └─ Log error, return cached response
    │        └─ Unknown Error (500)
    │           └─ Log details, return generic message
    └─ No → Return success response
```

---

**Architecture Version**: 1.0 | Updated: 2026-04-27 | Maintainers: GapGenius Team
