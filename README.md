# GapGenius

Hotel revenue management tool built for Genius Hacks 2026 — Problem 06.

Detects booking gaps, scores fragmentation, and provides AI-powered revenue recommendations through a multi-LLM copilot.

---

## Project Structure

```
GapGeniusV2/
├── frontend/          # React 19 + TanStack Router + Vite + Tailwind v4
├── backend/           # FastAPI + Python ML pipeline
├── start-frontend.bat
├── start-backend.bat
└── README.md
```

---

## Quick Start

**Option 1 — Run each server separately:**

```
start-backend.bat
start-frontend.bat
```

**Option 2 — Manual:**

```bash
# Backend
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
bun run dev
```

---

## Backend Setup

**Requirements:** Python 3.11+

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env and add your API key for the chosen LLM provider
```

### Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | `claude` \| `openai` \| `gemini` \| `minimax` |
| `LLM_MODEL` | Optional model override (uses provider default if blank) |
| `ANTHROPIC_API_KEY` | Required when `LLM_PROVIDER=claude` |
| `OPENAI_API_KEY` | Required when `LLM_PROVIDER=openai` |
| `GOOGLE_API_KEY` | Required when `LLM_PROVIDER=gemini` |
| `MINIMAX_API_KEY` | Required when `LLM_PROVIDER=minimax` |

### API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/rooms/upload` | Upload rooms CSV |
| POST | `/api/bookings/upload` | Upload bookings CSV → gap analysis |
| POST | `/api/analyze` | Full ML pipeline |
| GET | `/api/matrix` | Heatmap matrix data |
| POST | `/api/chat` | AI copilot chat |
| GET | `/api/llm-info` | Active LLM provider/model info |

Runs on: `http://localhost:8000`  
API docs: `http://localhost:8000/docs`

---

## Frontend Setup

**Requirements:** [Bun](https://bun.sh)

```bash
cd frontend
bun install
bun run dev
```

Runs on: `http://localhost:5173`

### Tech Stack

- React 19
- TanStack Router + TanStack Query
- Tailwind CSS v4
- Shadcn/ui components
- Vite

---

## CSV Formats

**Rooms CSV**
```
number,type,floor,capacity,rate,status,notes
```

**Bookings CSV**
```
booking_id,room_number,room_type,check_in,check_out,channel,guest_name,rate,status
```

---

## Features

- **Gap Detection** — ML-based identification of revenue gaps in booking calendar
- **Fragmentation Scoring** — Quantifies how fragmented your booking schedule is
- **Slot Optimizer** — Recommends optimal booking slots to maximize revenue
- **Portfolio View** — Property-level stats table from CSV import
- **AI Copilot** — Chat with an LLM trained on your booking context
- **Heatmap Matrix** — Visual room × date occupancy grid
