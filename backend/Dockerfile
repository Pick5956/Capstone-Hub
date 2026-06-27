# ── Build stage ──────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server .

# ── Runtime stage ────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -h /app appuser

WORKDIR /app
COPY --from=builder /app/server .

# uploads directory (bind-mount or volume in production)
RUN mkdir -p /app/uploads && chown appuser:appuser /app/uploads
VOLUME ["/app/uploads"]

USER appuser

EXPOSE 8080

CMD ["./server"]
