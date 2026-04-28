# GapGenius — Technical Architecture

Hotel revenue management platform that detects booking gaps, scores fragmentation, and provides AI-powered recommendations through a multi-LLM copilot.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER LAYER                                  │
│  ├─ Web Dashboard (React 19 + TanStack Router)                      │
│  ├─ Mobile Responsive (Tailwind CSS v4)                             │
│  └─ Real-time KPI Cards & Heatmaps                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                              │
│  ├─ API Gateway (FastAPI + CORS)                                    │
│  ├─ Request Router & Rate Limiting                                  │
│  ├─ Session Manager (Hotel context, user preferences)               │
│  └─ Error Handler & Logging                                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↕
        ┌─────────────────────┬─────────────────────┐
        │                     │                     │
        ↓                     ↓                     ↓
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│    AI LAYER      │  │   ML PIPELINE    │  │   DATA LAYER     │
│ (Copilot Brain)  │  │  (Analyzers)     │  │  (Storage)       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 1. User Layer

**Purpose**: Web-based interface for revenue managers and property operators

### Components
- **Dashboard** (`src/routes/index.tsx`)
  - Real-time KPI cards (occupancy, ARR, ADR, RevPAR)
  - Fragmentation heatmap visualization
  - Activity history timeline

- **Hotel Selector** (`HotelSelector.tsx`)
  - Multi-property support
  - Property filtering and switching
  - Session persistence

- **Activity Rail** (`ActivityRail.tsx`)
  - Contextual recommendations from AI
  - Booking event stream
  - Revenue impact notifications

- **CopilotPanel** (`CopilotPanel.tsx`)
  - Chat interface for AI Q&A
  - Context-aware revenue advice
  - Multi-LLM support indicator

- **UI Components** (`ui/`)
  - Radix UI + shadcn/ui library
  - Accessible, composable primitives
  - Dark mode support

### Technology Stack
- **Framework**: React 19 with TypeScript
- **Router**: TanStack Router v1 (file-based routing)
- **Styling**: Tailwind CSS v4 + CSS variables
- **State**: React Context (InventoryContext, PersonaContext)
- **HTTP Client**: Custom REST client (api/client.ts)

---

## 2. Orchestration Layer

**Purpose**: API gateway and request routing

### Endpoints

#### Data Upload
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/rooms/upload` | Upload room inventory CSV |
| POST | `/api/bookings/upload` | Upload bookings CSV |

#### Analysis
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/analyze` | Run full ML pipeline |
| GET | `/api/matrix` | Get heatmap availability matrix |
| POST | `/api/analyze-bookings` | Gap analysis on bookings |

#### AI Copilot
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/chat` | Chat with revenue AI agent |
| GET | `/api/llm-info` | Get active LLM provider/model |

#### Utilities
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check with LLM status |

### Key Features
- **CORS Middleware**: Allows localhost:5173 (dev) and :4173 (preview)
- **Error Handling**: Standardized HTTP exceptions with context
- **Request Validation**: Pydantic models for all inputs/outputs
- **Logging**: Full request/response tracking for debugging

---

## 3. AI Layer (Copilot Brain)

**Purpose**: Universal LLM abstraction with multi-provider support

### Architecture
```
llm_client.py (Universal Interface)
    ├─ Anthropic (Claude 3 Sonnet/Opus)
    ├─ OpenAI (GPT-4/4o)
    ├─ Google (Gemini 2.0)
    └─ MiniMax (Chinese market)
```

### Configuration
Uses environment variables (`.env`):
```
LLM_PROVIDER = claude | openai | gemini | minimax
LLM_MODEL = (optional override, uses provider default if blank)
ANTHROPIC_API_KEY
OPENAI_API_KEY
GOOGLE_API_KEY
MINIMAX_API_KEY
```

### Components

#### `llm_client.py` — Provider Abstraction
- Unified interface: `plain_completion(messages, system_prompt, json_mode)`
- Automatic fallback on API errors
- Cost-optimized routing (Gemini for batch, Claude for quality)
- Token counting and budgeting

#### `chatbot.py` — Conversation Engine
- Revenue management domain expertise in system prompt
- Context-aware responses using hotel data
- Multi-turn conversation state management
- Output formatting for UI display

### Capabilities
- **Domain**: Hotel revenue management, gap analysis, channel strategy
- **Input**: Hotel data, bookings, heatmap matrix, user query
- **Output**: Actionable recommendations, explanations, revenue impact projections

---

## 4. ML Pipeline Layer

**Purpose**: Gap detection, fragmentation scoring, optimization

### Data Flow
```
CSV Upload → Parse → Availability Matrix → Analysis → KPIs → UI
```

### Modules

#### `gap_detector.py`
- **Availability Matrix**: (rooms × dates) boolean grid
  - True = available, False = booked
- **Orphan Gap Detection**: Single-night gaps too small to sell
- **Orphan Cost**: Revenue lost per orphaned night
- **Output**: Gap inventory with severity scores

**Key Functions**:
- `build_availability_matrix(rooms, bookings, date_range)` → DataFrame + booking_map
- `detect_orphan_gaps(matrix, booking_map)` → List[OrphanGap]

#### `fragmentation_scorer.py`
- **Fragmentation Index**: Measures channel-wise booking fragmentation
- **Scatter Score**: How "spread out" bookings are across dates
- **Severity Levels**: Low / Medium / High / Critical
- **Recommendations**: Rebundling strategies per channel

**Key Functions**:
- `score_gaps(gaps, hotel_context)` → Dict with fragmentation metrics

#### `slot_optimizer.py`
- **Rebundling**: Consolidate orphan gaps into sellable slots
- **LOS Rules**: Respect minimum length-of-stay constraints
- **Channel Strategy**: Cross-channel booking optimization
- **Opportunity Score**: Expected revenue impact

**Key Functions**:
- `find_rebundle_opportunities(gaps, rooms, constraints)` → List[RebundleOpportunity]

#### `mock_generator.py`
- Generates realistic hotel booking data for testing
- Creates orphan gaps and fragmentation patterns
- Supports multiple room types and channels

---

## 5. Data Layer

**Purpose**: Session state, hotel context, conversation history

### Data Structures

#### Session Context
```python
{
    "property_id": str,
    "property_name": str,
    "rooms": List[Room],
    "bookings": List[Booking],
    "analysis_date": date,
    "date_range": (start_date, end_date),
}
```

#### KPI Metrics
```python
{
    "occupancy_pct": float,
    "total_leakage": float,  # $ lost to orphan gaps
    "orphan_count": int,
    "fragmentation_index": float,
    "usable_capacity_pct": float,
    "avg_booking_length": float,
}
```

#### Conversation History
```python
List[ChatMessage]
    ├─ role: "user" | "assistant"
    ├─ content: str
    └─ context: dict (hotel_data, matrix, kpis)
```

### Storage
- **In-Memory**: Python dictionary per session (dev mode)
- **Optional**: PostgreSQL/MongoDB for production persistence
- **Frontend State**: React Context + TanStack Query caching

---

## 6. Tool Layer

**Purpose**: Analysis engines, utilities, external integrations

### Built-in Tools

#### Analysis Engines
- **Heatmap Generator**: Converts matrix to frontend-ready format
- **KPI Calculator**: Occupancy, ARR, ADR, RevPAR computation
- **Revenue Impact Analyzer**: Quantifies gap recovery potential

#### Utilities
- **CSV Parser**: Room and booking data ingestion
- **Date Range Handler**: Season detection, business day calculations
- **Error Recovery**: Graceful degradation when LLM fails

### External Integrations (Future)
- **OTA APIs**: Real-time channel data (Booking.com, Expedia)
- **PMS Integration**: Direct reservation system sync
- **BI Tools**: Tableau, Looker dashboards
- **Notification Service**: Slack, email alerts

---

## Data Models

### Core Models (Pydantic)

```python
class Room(BaseModel):
    room_id: str
    room_type: str
    capacity: int

class Booking(BaseModel):
    booking_id: str
    room_id: str
    check_in: date
    check_out: date
    channel: Channel  # OTA, DIRECT, PHONE, etc.
    revenue: float

class OrphanGap(BaseModel):
    room_id: str
    date: date
    severity: str  # LOW, MEDIUM, HIGH, CRITICAL
    revenue_opportunity: float

class RoomCategory(str, Enum):
    SINGLE = "SINGLE"
    DOUBLE = "DOUBLE"
    SUITE = "SUITE"

class Channel(str, Enum):
    OTA = "OTA"
    DIRECT = "DIRECT"
    PHONE = "PHONE"
    CORP = "CORP"
```

---

## Request/Response Examples

### Upload Bookings
```http
POST /api/bookings/upload
Content-Type: multipart/form-data

bookings_csv: <binary file>
```

Response:
```json
{
  "success": true,
  "bookings_count": 342,
  "date_range": ["2025-04-01", "2025-06-30"],
  "channels": { "OTA": 180, "DIRECT": 162 }
}
```

### Run Analysis
```http
POST /api/analyze
Content-Type: application/json

{
  "property_id": "prop_12345",
  "start_date": "2025-04-01",
  "end_date": "2025-06-30"
}
```

Response:
```json
{
  "property_id": "prop_12345",
  "total_leakage": 12450.00,
  "orphan_count": 87,
  "fragmentation_index": 0.68,
  "occupancy_pct": 0.82,
  "opportunities": [
    {
      "room_id": "101",
      "date": "2025-05-15",
      "revenue_opportunity": 185.00,
      "recommendation": "Rebundle with 2025-05-16"
    }
  ]
}
```

### Chat with Copilot
```http
POST /api/chat
Content-Type: application/json

{
  "message": "Why are we losing revenue in May?",
  "context": {
    "property_id": "prop_12345",
    "total_leakage": 12450,
    "orphan_count": 87,
    "fragmentation_index": 0.68
  },
  "llm_provider": "claude"
}
```

Response:
```json
{
  "reply": "Your May losses are primarily driven by 87 orphan gaps (1-night singles) worth ~$12.4K. This 68% fragmentation index suggests channel-wide booking scatter. I recommend: 1) Consolidate OTA bookings into 2-3 night packages, 2) Lower ADR on 1-night direct bookings, 3) Block orphans proactively on weekends.",
  "confidence": 0.92,
  "llm_model": "claude-3-sonnet-20250514"
}
```

---

## Technology Stack Summary

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Routing | TanStack Router v1 |
| Styling | Tailwind CSS v4 |
| Components | Radix UI + shadcn/ui |
| Build | Vite 6 |
| Package Manager | Bun |

### Backend
| Layer | Technology |
|-------|-----------|
| Framework | FastAPI 0.115+ |
| Server | Uvicorn 0.30+ |
| Validation | Pydantic v2 |
| ML | Pandas, NumPy, scikit-learn, SciPy |
| LLM | Anthropic, OpenAI, Google, MiniMax SDKs |
| Data | Instructor (structured outputs) |

### Deployment
| Environment | Deployment |
|---|---|
| Development | Local (bun dev, uvicorn --reload) |
| Staging | Docker containers (optional) |
| Production | Cloudflare Workers (Frontend), Railway/Render (Backend) |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Matrix Build | <500ms for 365 days × 100 rooms |
| Gap Detection | <200ms for 1000 bookings |
| LLM Response | <3s (varies by model) |
| Dashboard Load | <2s (frontend + API calls) |
| Chat Response | <8s (LLM inference) |

---

## Security Considerations

1. **API Keys**: Store in `.env`, never commit to git
2. **CORS**: Whitelist only trusted origins
3. **Rate Limiting**: Implement per-IP limits on `/api/chat`
4. **CSV Upload**: Validate file size, row count, column names
5. **LLM Prompts**: Sanitize user input before passing to LLM
6. **Session**: Add JWT/OAuth for multi-user deployments

---

## Future Enhancements

### Phase 2
- [ ] Persistent PostgreSQL backend
- [ ] Multi-user authentication & RBAC
- [ ] Real-time PMS API integrations
- [ ] ML model fine-tuning on hotel data

### Phase 3
- [ ] Predictive demand forecasting
- [ ] Automated price optimization
- [ ] Channel manager integration (Booking Engine)
- [ ] Mobile app (React Native)

### Phase 4
- [ ] Agent orchestration (AI for complex workflows)
- [ ] Agentic revenue management loops
- [ ] Competitor price monitoring
- [ ] White-label SaaS deployment

---

## Development Roadmap

| Milestone | Timeline | Deliverables |
|-----------|----------|--------------|
| MVP | Week 1-2 | Core gap detection, basic copilot |
| Beta | Week 3-4 | Multi-hotel support, improved UI/UX |
| v1.0 | Week 5-6 | Production readiness, documentation |
| v1.1+ | Post-launch | Analytics, integrations, ML improvements |

---

## Getting Started

### Prerequisites
- Python 3.11+
- Bun 1.0+
- API keys (Claude / OpenAI / Gemini / MiniMax)

### Quick Start
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your LLM provider key
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
bun install
bun run dev
```

### Running Tests
```bash
pytest backend/  # Backend unit tests
bun test         # Frontend unit tests
```

---

**Architecture Version**: 1.0  
**Last Updated**: 2026-04-27  
**Maintainers**: GapGenius Team
