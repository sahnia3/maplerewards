FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/api ./cmd/api

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata wget

WORKDIR /app
COPY --from=builder /app/bin/api .

EXPOSE 8080

# Hits /ready (checks postgres + redis). /health is liveness-only.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --spider http://localhost:8080/ready || exit 1

CMD ["./api"]
