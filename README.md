<div align="center">

![Go](https://img.shields.io/badge/Go-1.23-00ADD8?style=flat-square&logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

# MapleRewards

**The first Canadian-native credit card rewards optimization platform.**

Canada's $820B+ credit card market has zero native rewards optimization tools. Every existing platform is US-focused, leaving Canadian cardholders guessing which card to pull out at checkout. MapleRewards fixes that.

`92 cards` | `19 loyalty programs` | `35+ API endpoints` | `27,760 lines of code`

</div>

---

## What It Does

MapleRewards tells you which credit card earns the most on every purchase, tracks your points across every Canadian loyalty program, and finds award flights — all backed by a conversational AI assistant that knows your entire wallet.

| Feature | Description |
|---|---|
| **Rewards Optimizer** | Input a spending amount and category. Get a ranked list of cards sorted by effective return percentage. |
| **Card Wallet** | Track owned cards and point balances across 19 Canadian loyalty programs with transfer partner networks. |
| **Trip Planner** | Google Flights search integrated with award availability across 15+ airline booking portals. |
| **AI Chat Assistant** | Claude Sonnet 4.5 with full wallet context injection — answers "which card should I use?" with your actual data. |
| **Portfolio Analysis** | Annual value breakdown per card, fee ROI calculations, and dollar gap analysis against optimal alternatives. |
| **Welcome Bonus Tracker** | Progress bars and activation milestones for minimum spend requirements on new cards. |
| **Card Comparison** | Side-by-side comparison of any catalogued cards across all earning categories and perks. |
| **Spending Tracker** | Transaction logging with category-based statistics and historical trends. |
| **Multi-step Onboarding** | Card selection flow and spending category profiling to personalize recommendations from day one. |

---

## Architecture

```mermaid
flowchart LR
    A[Client Request] --> B[Chi Router]
    B --> C[Middleware Stack]
    C --> C1[CORS]
    C --> C2[Rate Limiter\n300 req/min]
    C --> C3[JWT Auth]
    C3 --> D[Handler]
    D --> E[Service Layer]
    E --> F[Repository]
    F --> G[(PostgreSQL)]
    F --> H[(Redis Cache)]
    E --> I[External APIs]
    I --> I1[Claude API]
    I --> I2[SerpAPI]
    I --> I3[Apify]
    I --> I4[Seats.aero]

    style A fill:#1a1a2e,stroke:#e2e8f0,color:#e2e8f0
    style B fill:#16213e,stroke:#e2e8f0,color:#e2e8f0
    style C fill:#0f3460,stroke:#e2e8f0,color:#e2e8f0
    style D fill:#1a1a2e,stroke:#e2e8f0,color:#e2e8f0
    style E fill:#16213e,stroke:#e2e8f0,color:#e2e8f0
    style F fill:#0f3460,stroke:#e2e8f0,color:#e2e8f0
    style G fill:#4169E1,stroke:#e2e8f0,color:#e2e8f0
    style H fill:#DC382D,stroke:#e2e8f0,color:#e2e8f0
```

The backend follows a strict **Handler > Service > Repository** separation. Handlers extract and validate request parameters. Services contain all business logic. Repositories own database access. No layer skips another.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Go 1.23, Chi v5 router, JWT authentication |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion 12, shadcn/ui |
| **Database** | PostgreSQL 16 (12 tables, 9 migrations) |
| **Cache** | Redis 7 |
| **AI** | Claude Sonnet 4.5 (conversational rewards advice with wallet context) |
| **Payments** | Stripe |
| **Auth** | Google OAuth + JWT refresh tokens |
| **External Data** | SerpAPI (flights), Apify (award scraping), Seats.aero (award availability) |

---

## Getting Started

### Prerequisites

- Go 1.23+
- Node.js 20+
- Docker & Docker Compose

### Setup

```bash
# Start PostgreSQL + Redis and run all migrations
make setup

# Start the Go backend on :8080
make dev

# In a separate terminal — start Next.js on :3000
cd frontend && npm run dev
```

### Environment Variables

Create a `.env` file in the project root with the following:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_ADDR` | Redis host and port |
| `REDIS_PASSWORD` | Redis authentication |
| `PORT` | Backend server port |
| `CORS_ORIGIN` | Allowed frontend origin |
| `JWT_SECRET` | Token signing key |
| `ANTHROPIC_API_KEY` | Claude API access |
| `TAVILY_API_KEY` | Web search for AI assistant |
| `SERPAPI_KEY` | Google Flights data |
| `APIFY_TOKEN` | Award availability scraping |
| `SEATSAERO_API_KEY` | Seats.aero award search |

---

## Data Model

12 PostgreSQL tables across 9 migrations:

```
users
loyalty_programs ............ 19 Canadian programs (Aeroplan, Avion, Scene+, etc.)
cards ....................... 92 credit cards with reward structures
card_multipliers ............ Per-category earn rates for each card
categories .................. 8 spending categories with MCC code mappings
transfer_partners ........... Program-to-airline/hotel transfer ratios
point_valuations ............ Cents-per-point benchmarks by program
user_cards .................. User wallet — owned cards and balances
spend_entries ............... Transaction log
welcome_bonus ............... Sign-up bonus tracking and progress
stripe_customer ............. Billing integration
refresh_tokens .............. JWT token rotation
```

**Spending Categories**: Groceries, Dining, Travel, Gas, Pharmacy, Entertainment, Streaming, Everything Else

---

<details>
<summary><strong>Project Structure</strong></summary>

```
maplerewards-main/
├── cmd/api/main.go              # Backend entry point
├── internal/
│   ├── handler/                 # 22 HTTP handlers
│   ├── service/                 # 18 business logic files
│   │   ├── ai.go               # Claude integration (1,026 lines)
│   │   ├── trip.go             # Trip planner (1,040 lines)
│   │   ├── award_search.go     # Flight awards (698 lines)
│   │   └── optimizer.go        # Card ranking (305 lines)
│   ├── repo/                    # 7 database access layers
│   ├── model/types.go           # 100+ struct definitions
│   ├── middleware/              # JWT, rate limiting, CORS, logging
│   ├── cache/                   # Redis integration
│   └── knowledge/               # YAML knowledge bases
├── frontend/                    # Next.js 16 app
│   ├── app/                     # 18+ page routes
│   ├── components/              # UI + feature components
│   └── contexts/                # Session, Auth, Wallet, Sidebar
├── migrations/                  # 9 PostgreSQL migrations
├── Makefile                     # Build & run commands
└── docker-compose.yml           # PostgreSQL + Redis
```

</details>

<details>
<summary><strong>Codebase Breakdown</strong></summary>

| Component | Lines | Language |
|---|---|---|
| Backend services | 10,717 | Go |
| Frontend application | 17,043 | TypeScript |
| **Total** | **27,760** | |

Largest backend files by complexity:

| File | Lines | Responsibility |
|---|---|---|
| `service/trip.go` | 1,040 | Trip planning, flight search orchestration, award link generation |
| `service/ai.go` | 1,026 | Claude integration, wallet context building, streaming responses |
| `service/award_search.go` | 698 | Multi-source award availability aggregation |
| `model/types.go` | 600+ | Domain models, API request/response types |
| `service/optimizer.go` | 305 | Card ranking algorithm, effective return calculation |

</details>

---

## Testing

```bash
# Run Go tests with race condition detection
make test

# Run Go linter
make lint

# Run frontend linting
cd frontend && npm run lint
```

---

## How the Optimizer Works

The core ranking algorithm in `optimizer.go` takes a spending amount and category, then:

1. Looks up every card's earn rate for that category (including base rates and multipliers)
2. Resolves the loyalty program each card earns into
3. Applies cents-per-point valuations to convert points to dollar values
4. Factors in annual fee amortization for cards with fees
5. Returns a ranked list sorted by effective return percentage

This runs against all 92 catalogued cards in under 50ms.

---

## Built With

[![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)](https://www.framer.com/motion)
[![Claude](https://img.shields.io/badge/Claude_Sonnet_4.5-191919?style=for-the-badge&logo=anthropic&logoColor=white)](https://www.anthropic.com)
[![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white)](https://stripe.com)

---

## License

MIT License. See [LICENSE](LICENSE) for details.
