# GapGenius Technical Architecture — Documentation Index

Welcome to the GapGenius technical architecture documentation. This comprehensive set of documents describes the system design, component interactions, and implementation details of the hotel revenue management platform.

## 📚 Documentation Files

### 1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Main Reference
The comprehensive technical architecture document covering:
- 6-layer architecture model
- Detailed component descriptions
- API endpoint reference
- Request/response examples
- Technology stack
- Performance targets
- Security considerations
- Future roadmap

**Best for**: Understanding the complete system design and implementation details.

---

### 2. **[ARCHITECTURE_QUICK_REFERENCE.md](./ARCHITECTURE_QUICK_REFERENCE.md)** — Executive Summary
A concise one-page reference guide:
- Layer-by-layer breakdown
- Key design principles
- Data flow
- Tech stack at a glance
- Quick start instructions

**Best for**: Getting up to speed quickly or sharing with stakeholders.

---

### 3. **[ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)** — Visual Guides
ASCII and text diagrams illustrating:
- Layered architecture model
- AI layer (multi-LLM) flow
- ML pipeline processing
- Data layer context
- End-to-end data flow
- Multi-LLM routing strategy
- Component interaction matrix
- Deployment architecture

**Best for**: Presentations, documentation, and visualizing system interactions.

---

## 🏗️ Architecture Overview

### The 6-Layer Model

```
┌─────────────────────────────────────────┐
│  🖥️  USER LAYER                         │
│  React 19 Dashboard + Copilot Panel     │
├─────────────────────────────────────────┤
│  ⚙️  ORCHESTRATION LAYER               │
│  FastAPI Gateway + Session Manager      │
├─────────────────────────────────────────┤
│  🧠 AI LAYER          🔍 ML PIPELINE   │
│  Multi-LLM Copilot    Gap Detection    │
│  (Claude/GPT/Gemini)  Fragmentation    │
├─────────────────────────────────────────┤
│  💾 DATA LAYER                          │
│  Session Context + KPI Metrics          │
├─────────────────────────────────────────┤
│  🛠️  TOOL LAYER                        │
│  Analyzers + Utilities                  │
└─────────────────────────────────────────┘
```

### Key Design Principles

1. **Multi-LLM Flexibility**
   - Universal abstraction layer
   - Support for Claude, GPT-4o, Gemini, MiniMax
   - Automatic fallback on provider failure
   - Cost-aware routing

2. **Domain-Specific AI**
   - Custom system prompt for revenue management
   - Context injection from hotel data
   - Multi-turn conversation tracking
   - Explainable recommendations

3. **Fast Vectorized ML**
   - Pandas DataFrames for matrix operations
   - NumPy for numerical computation
   - <500ms analysis time for realistic data

4. **Clean Architecture**
   - Separation of concerns
   - Type hints throughout (Python + TypeScript)
   - Pydantic validation at layer boundaries
   - CORS & session isolation

5. **Developer Experience**
   - Hot reload (Vite + Uvicorn)
   - Mock data generator
   - Interactive API docs (Swagger)
   - Rich error messages

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Bun 1.0+
- API keys for LLM provider (Claude, OpenAI, Google, or MiniMax)

### Setup

```bash
# Clone/navigate to project
cd GapGeniusV2\ -\ Copy

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your LLM provider API key
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
bun install
bun run dev
```

Visit: `http://localhost:5173`

API Docs: `http://localhost:8000/docs`

---

## 🎯 Key Features

### For Revenue Managers
- **Gap Detection**: Identifies orphan gaps (1-night singles) that leak revenue
- **Fragmentation Analysis**: Measures booking scatter across channels
- **AI Recommendations**: Revenue recovery strategies from the copilot
- **Real-time Dashboard**: KPI cards, heatmaps, activity timeline

### For Developers
- **Type-Safe**: Full TypeScript + Python type hints
- **Extensible**: Easy to add new LLM providers
- **Well-Documented**: Comprehensive API docs
- **Hot Reload**: Instant feedback during development
- **Mock Data**: Test without real hotel data

---

## 📊 Data Flow

```
CSV Upload
    ↓
Parse Hotels/Bookings
    ↓
Build Availability Matrix
    ↓
Detect Orphan Gaps
    ↓
Score Fragmentation
    ↓
Optimize Rebundling
    ↓
Calculate KPIs
    ↓
Dashboard + Copilot Context
```

---

## 🔧 Technology Stack

### Frontend
- **React 19** with TypeScript
- **TanStack Router** for file-based routing
- **Tailwind CSS v4** for styling
- **Radix UI** + shadcn/ui for components
- **Vite** build tool
- **Bun** package manager

### Backend
- **FastAPI** 0.115+ (async web framework)
- **Pydantic v2** for data validation
- **Uvicorn** ASGI server
- **Pandas** for data processing
- **NumPy** + **scikit-learn** + **SciPy** for ML
- **Anthropic**, **OpenAI**, **Google**, **MiniMax** SDKs

### DevOps
- **Docker** (optional containerization)
- **Cloudflare Pages** (frontend)
- **Railway/Render** (backend)
- **PostgreSQL** (production data)

---

## 📈 Performance Targets

| Operation | Target |
|-----------|--------|
| Matrix Build (365 days × 100 rooms) | <500ms |
| Gap Detection (1000 bookings) | <200ms |
| Dashboard Load | <2s |
| LLM Response | 3-8s |

---

## 🔒 Security Checklist

- [ ] `.env` file not committed (use `.env.example`)
- [ ] CORS whitelist configured for trusted origins
- [ ] CSV upload validation (size, columns)
- [ ] LLM prompt injection prevention
- [ ] Rate limiting on `/api/chat`
- [ ] JWT/OAuth for multi-user deployments

---

## 🗺️ Future Roadmap

### Phase 2 (Weeks 3-4)
- [ ] Persistent PostgreSQL backend
- [ ] Multi-user authentication & RBAC
- [ ] Real-time PMS API integrations
- [ ] Improved error recovery

### Phase 3 (Weeks 5-6)
- [ ] Demand forecasting ML model
- [ ] Automated price optimization
- [ ] Channel manager integration
- [ ] Mobile app (React Native)

### Phase 4 (Post-launch)
- [ ] Agent orchestration (multi-agent workflows)
- [ ] Competitor price monitoring
- [ ] White-label SaaS offering
- [ ] Advanced analytics

---

## 📞 Support & Questions

### Common Questions

**Q: How do I switch LLM providers?**
A: Edit `.env` file:
```
LLM_PROVIDER=claude  # or openai, gemini, minimax
ANTHROPIC_API_KEY=sk-ant-...  # your API key
```
Then restart the backend.

**Q: How fast is the gap detection?**
A: ~200ms for 1000 bookings on a modern laptop. Matrix building is the bottleneck at ~500ms for 365 days × 100 rooms.

**Q: Can I use this with my PMS?**
A: Currently CSV import only. PMS integration is planned for Phase 2.

**Q: Is there a mobile app?**
A: Mobile web works today (responsive design). Native app planned for Phase 3.

---

## 📖 Related Documentation

- [README.md](./README.md) — Project overview & quick start
- [backend/](./backend/) — Backend implementation
- [frontend/](./frontend/) — Frontend implementation
- `.env.example` — Environment variables reference

---

## 👥 Team

**GapGenius Team** — Built for Genius Hacks 2026 (Problem 06)

- Architecture & AI: Multi-LLM integration, revenue domain expertise
- Frontend: React dashboard with real-time KPIs
- Backend: FastAPI + ML pipeline
- ML: Gap detection, fragmentation scoring, optimization

---

## 📄 Version & Updates

**Architecture Version**: 1.0  
**Last Updated**: 2026-04-27  
**Framework Versions**: React 19, FastAPI 0.115+, TanStack Router 1.168+

---

## 🎓 Learning Resources

### Architecture Concepts
- [Layered Architecture Pattern](https://en.wikipedia.org/wiki/Multitier_architecture)
- [API Gateway Pattern](https://microservices.io/patterns/apigateway.html)
- [Strangler Fig Pattern](https://martinfowler.com/bliki/StranglerFigApplication.html)

### Tech Stack Docs
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React 19 Docs](https://react.dev/)
- [TanStack Router](https://tanstack.com/router/latest)
- [Pydantic v2](https://docs.pydantic.dev/latest/)

### Hotel Revenue Management
- [Revenue Management Terminology](https://en.wikipedia.org/wiki/Revenue_management)
- [ADR, ARR, RevPAR Formulas](https://www.revenuehub.com/resources/hotel-revenue-management-glossary)
- [Channel Management Strategy](https://hospitalityinsights.ehl.edu/channel-manager-hotel)

---

**Start with**: [ARCHITECTURE_QUICK_REFERENCE.md](./ARCHITECTURE_QUICK_REFERENCE.md) for overview  
**Deep dive**: [ARCHITECTURE.md](./ARCHITECTURE.md) for details  
**Visualize**: [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) for diagrams

---

*Thank you for using GapGenius! 🚀*
