# GapGenius Architecture — Quick Reference

## 6-Layer Architecture Model

### 1. 🖥️ User Layer
**Web Dashboard** — React 19 + TanStack Router + Tailwind CSS v4
- Real-time KPI cards (occupancy, ARR, ADR, RevPAR)
- Fragmentation heatmap visualization
- AI copilot chat panel
- Hotel selector & activity rail

**Key Files**: `frontend/src/routes/`, `frontend/src/components/`

---

### 2. ⚙️ Orchestration Layer
**FastAPI Gateway** — Central request routing & session management
- CORS middleware (allow localhost dev)
- Request validation (Pydantic models)
- Error handling & logging
- Session context management

**Key Files**: `backend/main.py`, `backend/models.py`

**Endpoints**:
- `POST /api/rooms/upload` — Room inventory
- `POST /api/bookings/upload` — Booking data
- `POST /api/analyze` — Run full pipeline
- `POST /api/chat` — Copilot Q&A
- `GET /api/matrix` — Heatmap data

---

### 3. 🧠 AI Layer — Multi-LLM Copilot Brain
**Universal LLM Abstraction** — Plug-in any LLM provider
- **Anthropic Claude** (quality, long context)
- **OpenAI GPT-4o** (fast, cost-effective)
- **Google Gemini 2.0** (batch processing)
- **MiniMax** (China market)

**Fallback Strategy**: Auto-switch if primary fails  
**Cost Optimization**: Route to cheapest suitable model

**Key Files**: `backend/ai/llm_client.py`, `backend/ai/chatbot.py`

**System Prompt**: Revenue management expert mode with domain knowledge
- Gap analysis interpretation
- Channel strategy optimization
- Revenue recovery recommendations

---

### 4. 🔍 ML Pipeline Layer
**Gap Detection & Revenue Analysis** — Pandas/NumPy/scikit-learn

**Availability Matrix**
- (rooms × dates) boolean DataFrame
- True = available, False = booked
- Fast vectorized operations on 1000s of bookings

**Gap Detector** (`gap_detector.py`)
- Orphan gap identification (1-night singles)
- Booking map for traceability
- Severity classification

**Fragmentation Scorer** (`fragmentation_scorer.py`)
- Scatter index (how spread out bookings are)
- Channel-wise fragmentation analysis
- Severity levels: LOW, MEDIUM, HIGH, CRITICAL

**Slot Optimizer** (`slot_optimizer.py`)
- Rebundling strategy (consolidate orphans)
- LOS constraint respect (min stay rules)
- Revenue impact scoring

**Key Files**: `backend/ml/`

---

### 5. 💾 Data Layer
**Session State & Context** — In-memory (dev) / persistent (production)

**Session Context**
```
{
  property_id, property_name,
  rooms, bookings,
  analysis_date, date_range
}
```

**KPI Metrics**
```
{
  occupancy_pct, total_leakage, orphan_count,
  fragmentation_index, usable_capacity_pct,
  avg_booking_length
}
```

**Chat History**
```
[
  { role: "user", content, context },
  { role: "assistant", content, context }
]
```

**Storage**: Python dict (dev) → PostgreSQL (production)

**Key Files**: `backend/models.py`

---

### 6. 🛠️ Tool Layer
**Utilities & Analyzers** — Computation engines

**Built-in Tools**:
- KPI Calculator (occupancy, ARR, ADR, RevPAR)
- Heatmap Generator (matrix → UI format)
- CSV Parser (room & booking ingestion)
- Revenue Impact Analyzer (gap recovery projection)

**Future Integrations**:
- OTA APIs (Booking.com, Expedia)
- PMS integration (property management)
- BI tools (Tableau, Looker)
- Notifications (Slack, email)

**Key Files**: `backend/data/`, `backend/ml/`

---

## Data Flow

```
CSV Upload
    ↓
Parse Rooms & Bookings
    ↓
Build Availability Matrix (rooms × dates)
    ↓
Detect Orphan Gaps
    ↓
Score Fragmentation
    ↓
Find Rebundle Opportunities
    ↓
Calculate KPIs
    ↓
Display Dashboard + Copilot Context
    ↓
Chat with AI for Recommendations
```

---

## Key Design Principles

### 1. Multi-LLM Flexibility
- Universal `llm_client.py` interface
- Swap providers via `.env` variable
- Automatic fallback if provider fails
- Cost-aware routing

### 2. Domain-Specific AI
- Custom system prompt for revenue management
- Context injection (hotel data, KPIs, matrix)
- Multi-turn conversation tracking
- Explainable recommendations

### 3. Fast Vectorized ML
- Pandas DataFrames for matrix operations
- NumPy for numerical computation
- scikit-learn for severity scoring
- <500ms analysis for realistic hotel data

### 4. Clean Architecture
- Separation of concerns (UI, API, AI, ML, Data)
- Pydantic for validation at boundaries
- Type hints throughout (Python + TypeScript)
- CORS & session isolation

### 5. Developer Experience
- Hot reload on both frontend (Vite) & backend (Uvicorn)
- Mock data generator for testing
- Interactive API docs (Swagger)
- Rich error messages

---

## Tech Stack at a Glance

| Layer | Tech |
|-------|------|
| **Frontend** | React 19, TypeScript, TanStack Router, Tailwind v4, Bun |
| **Backend** | FastAPI, Pydantic, Uvicorn, Python 3.11+ |
| **ML** | Pandas, NumPy, scikit-learn, SciPy |
| **LLM** | Anthropic, OpenAI, Google, MiniMax SDKs |
| **Deployment** | Cloudflare (Frontend), Railway/Render (Backend) |

---

## Performance Targets

| Operation | Target |
|-----------|--------|
| Matrix Build | <500ms (365 days × 100 rooms) |
| Gap Detection | <200ms (1000 bookings) |
| Dashboard Load | <2s |
| LLM Response | <3s-8s (varies by model) |

---

## Security Checklist

- [ ] `.env` not committed (use `.env.example`)
- [ ] CORS whitelist configured
- [ ] CSV upload validation (size, columns)
- [ ] LLM prompt injection prevention
- [ ] Rate limiting on `/api/chat`
- [ ] JWT/OAuth for multi-user (if needed)

---

## Quick Start

```bash
# Backend
cd backend && python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your LLM API key
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
bun install
bun run dev
```

Visit: `http://localhost:5173`

---

## Next Steps for Enhancement

### Immediate (Phase 2)
- [ ] Persistent PostgreSQL backend
- [ ] Multi-user auth & RBAC
- [ ] Real-time PMS API integrations
- [ ] Improved error recovery

### Medium-term (Phase 3)
- [ ] Demand forecasting ML model
- [ ] Automated price optimization
- [ ] Channel manager integration
- [ ] Mobile app (React Native)

### Long-term (Phase 4)
- [ ] Agent orchestration (multi-agent workflows)
- [ ] Agentic revenue loops
- [ ] Competitor price monitoring
- [ ] White-label SaaS offering

---

**Version**: 1.0 | **Updated**: 2026-04-27
