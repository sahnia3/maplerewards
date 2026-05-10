.PHONY: dev build test migrate-up migrate-down lint docker-up docker-down setup remote-setup remote-start web-dev dump-ai-trace

DATABASE_URL ?= postgres://postgres:password@localhost:5432/maplerewards?sslmode=disable

dev:
	@go run ./cmd/api

build:
	@go build -o bin/api ./cmd/api

test:
	@go test ./... -v -race

migrate-up:
	@migrate -path ./migrations -database "$(DATABASE_URL)" up

migrate-down:
	@migrate -path ./migrations -database "$(DATABASE_URL)" down

lint:
	@golangci-lint run ./...

docker-up:
	@docker compose up -d postgres redis

docker-down:
	@docker compose down

# One-shot local setup: spin up infra, run migrations
setup: docker-up
	@echo "Waiting for Postgres..."
	@sleep 3
	@$(MAKE) migrate-up
	@echo "Done. Run: make dev"

# ── Frontend ───────────────────────────────────────────────────────────────────
web-dev:
	@cd web && npm run dev

# ── Remote access (Tailscale + ttyd web terminal) ─────────────────────────────
remote-setup:
	@bash scripts/remote-setup.sh

# Starts two ttyd instances:
#   :7681 → general terminal (zsh)
#   :7682 → Claude Code directly
remote-start:
	@echo "Starting web terminals..."
	@echo "General terminal : http://localhost:7681  (also via Tailscale IP)"
	@echo "Claude Code      : http://localhost:7682"
	@ttyd -p 7681 --writable zsh &
	@ttyd -p 7682 --writable claude

# ── AI debugging ──────────────────────────────────────────────────────────────
# Print the most recent AI conversation trace from the API log file.
# Reads /tmp/maple-api.log by default; override with LOG_FILE=path.
# Pass --raw to skip markdown formatting.
dump-ai-trace:
	@bash scripts/dump-ai-trace.sh $(filter-out $@,$(MAKECMDGOALS))
