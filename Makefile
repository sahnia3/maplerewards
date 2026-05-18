.PHONY: dev build test migrate-up migrate-down lint docker-up docker-down setup remote-setup remote-start web-dev worker worker-build dump-ai-trace

DATABASE_URL ?= postgres://postgres:password@localhost:5432/maplerewards?sslmode=disable

dev:
	@go run ./cmd/api

# Background worker that runs award-watch + issuer-watch + digest sweeps.
# Run alongside `make dev` in a separate terminal during development.
worker:
	@go run ./cmd/worker

build:
	@go build -o bin/api ./cmd/api

worker-build:
	@go build -o bin/worker ./cmd/worker

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
	@if [ -z "$$TTYD_CRED" ]; then \
		echo "REFUSING TO START: TTYD_CRED is unset."; \
		echo "ttyd --writable is a remote ROOT-equivalent shell. It must not"; \
		echo "run unauthenticated on 0.0.0.0 (one Tailscale-ACL/LAN mistake ="; \
		echo "full RCE + access to .env secrets). Set credentials first:"; \
		echo "  export TTYD_CRED='user:strong-password'"; \
		exit 1; \
	fi
	@echo "Starting web terminals (bound to 127.0.0.1, basic-auth required)..."
	@echo "Access ONLY via Tailscale (tailscale serve) or an SSH tunnel."
	@echo "General terminal : http://127.0.0.1:7681"
	@echo "Claude Code      : http://127.0.0.1:7682"
	@ttyd -i 127.0.0.1 -p 7681 -c "$$TTYD_CRED" --writable zsh &
	@ttyd -i 127.0.0.1 -p 7682 -c "$$TTYD_CRED" --writable claude

# ── AI debugging ──────────────────────────────────────────────────────────────
# Print the most recent AI conversation trace from the API log file.
# Reads /tmp/maple-api.log by default; override with LOG_FILE=path.
# Pass --raw to skip markdown formatting.
dump-ai-trace:
	@bash scripts/dump-ai-trace.sh $(filter-out $@,$(MAKECMDGOALS))
