# 🍁 Maple Rewards

AI-powered credit card point optimizer for Canada. Find the best card for every purchase, track milestones, and see your rewards analytics — all in one place.

---

## Prerequisites

Install these before anything else:

| Tool | Download | Notes |
|------|----------|-------|
| **Go 1.22+** | https://go.dev/dl/ | Run `go version` to confirm |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop/ | Needed for Postgres + Redis |
| **Node.js 18+** | https://nodejs.org/ | Run `node -v` to confirm |
| **golang-migrate** | https://github.com/golang-migrate/migrate/releases | For DB migrations |

> **Windows users:** After installing Go and Node, open a **new** terminal window so PATH updates take effect.

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/sahnia3/maplerewards.git
cd maplerewards
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

The defaults in `.env` work out of the box with Docker — no changes needed.

### 3. Start the database (Postgres + Redis)

```bash
docker compose up -d
```

Wait about 5 seconds for Postgres to be ready, then run migrations:

```bash
# Mac/Linux
make migrate-up

# Windows (if make isn't available)
migrate -path ./migrations -database "postgres://postgres:password@localhost:5432/maplerewards?sslmode=disable" up
```

> **Don't have `migrate`?** Download it from https://github.com/golang-migrate/migrate/releases — grab the binary for your OS and put it in your PATH.

### 4. Start the backend API

```bash
# Mac/Linux
make dev

# Windows
go run ./cmd/api
```

The API will be running at **http://localhost:8080**

### 5. Start the frontend

Open a **second terminal** in the same folder:

```bash
cd frontend
npm install
npm run dev
```

The app will be running at **http://localhost:3000**

---

## You're live! 🎉

Open **http://localhost:3000** in your browser.

| Page | URL | What it does |
|------|-----|-------------|
| Optimizer | `/` | Rank your cards for any spend category |
| Compare | `/compare` | See all cards vs all categories in one table |
| Milestones | `/milestones` | Track welcome bonus progress |
| Insights | `/insights` | Spending analytics + rewards history |
| Wallet | `/wallet` | Manage your cards + point balances |

---

## Project Structure

```
maplerewards/
├── cmd/api/          # Go entry point
├── internal/
│   ├── handler/      # HTTP handlers
│   ├── service/      # Business logic
│   ├── repo/         # Database queries
│   ├── model/        # Data types
│   └── cache/        # Redis client
├── migrations/       # SQL migrations
├── frontend/         # Next.js app
│   ├── app/          # Pages (App Router)
│   ├── components/   # UI components
│   └── lib/          # API client + types
├── docker-compose.yml
├── .env.example
└── Makefile
```

---

## Tech Stack

**Backend**
- Go 1.22, chi router
- PostgreSQL 16 (pgx driver)
- Redis 7 (caching)
- Docker Compose

**Frontend**
- Next.js 16, TypeScript
- Tailwind CSS v4
- shadcn/ui components

---

## Common Issues

**`go: command not found`**
→ Install Go from https://go.dev/dl/ and open a new terminal

**`docker: command not found`**
→ Install Docker Desktop and make sure it's running (check the system tray)

**`migrate: command not found`**
→ Download the migrate binary from https://github.com/golang-migrate/migrate/releases

**Frontend can't connect to API**
→ Make sure the backend is running on port 8080. Check `.env` has `CORS_ORIGIN=http://localhost:3000`

**Port already in use**
→ The frontend will auto-pick the next available port (3001, 3002, etc.) — check the terminal output for the actual URL
