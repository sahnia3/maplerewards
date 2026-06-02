FROM golang:1.25.7-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/api ./cmd/api
# Build the background worker too (award-watch / issuer-watch / digest sweeps).
# It ships in the same image; the default CMD below runs the api, and the
# `worker` service in docker-compose.yml overrides the command to ["./worker"]
# so both processes run in the default deployment. Without this the worker —
# and its Pro features (award alerts, issuer-page diffs, weekly digests) —
# can never run in prod, since the API image alone contained no worker binary.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/worker ./cmd/worker

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata wget \
    && addgroup -S maple -g 10001 \
    && adduser -S -D -H -u 10001 -G maple -s /sbin/nologin maple

WORKDIR /app
COPY --from=builder /app/bin/api .
COPY --from=builder /app/bin/worker .
# knowledge YAML files are referenced via relative path internal/knowledge/*.yaml
# in main.go — copy them into the image at the same path so the binary boots.
COPY --from=builder /app/internal/knowledge ./internal/knowledge

# Drop root before runtime — the runtime user only needs read access to
# /app and write access to nothing (state lives in Postgres + Redis).
USER 10001:10001

EXPOSE 8080

# Hits /ready (checks postgres + redis). /health is liveness-only.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --spider http://localhost:8080/ready || exit 1

CMD ["./api"]
