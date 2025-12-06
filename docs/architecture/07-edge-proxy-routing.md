# Stagely Edge Proxy Routing Specification

## Overview

The Stagely Edge Proxy is a high-performance reverse proxy that routes incoming HTTPS traffic from `*.stagely.dev` to ephemeral user VMs. It is designed to be stateless, horizontally scalable, and blazing fast.

## Design Principles

1. **Stateless**: Proxy reads routing state from Redis (no local state)
2. **Fast**: Sub-millisecond routing decisions
3. **Resilient**: Graceful handling of dead backends
4. **Secure**: TLS termination, header injection, rate limiting
5. **Observable**: Structured logging, metrics, traces

## Architecture

```
┌──────────────────────────────────────────────┐
│  Internet (Client)                           │
└──────────────────┬───────────────────────────┘
                   │
                   │ HTTPS (TLS 1.3)
                   v
┌──────────────────────────────────────────────┐
│  Load Balancer (AWS ALB / Cloudflare)       │
│  Terminates TLS? No (handled by Proxy)      │
└──────────────────┬───────────────────────────┘
                   │
                   │ Forwards to multiple Proxy instances
                   v
┌──────────────────────────────────────────────┐
│  Edge Proxy Fleet (Horizontal Scale)        │
│  ┌──────────────┐  ┌──────────────┐         │
│  │ Proxy Pod 1  │  │ Proxy Pod 2  │  ...    │
│  │ 2 vCPU, 4GB  │  │ 2 vCPU, 4GB  │         │
│  └──────────────┘  └──────────────┘         │
└──────────────────┬───────────────────────────┘
                   │
                   │ Reads routing table
                   v
          ┌─────────────────┐
          │  Redis          │
          │  (Read-Only)    │
          └─────────────────┘
                   │
                   │ Proxies to backend
                   v
┌──────────────────────────────────────────────┐
│  User VM (Target)                            │
│  IP: 54.123.45.67                            │
│  Port: 3000                                  │
└──────────────────────────────────────────────┘
```

## TLS Strategy: Single Wildcard Certificate

### Certificate Details

**Domain:** `*.stagely.dev`

**Type:** Wildcard (covers all subdomains)

**Issuance:** Let's Encrypt via DNS-01 challenge

**Validity:** 90 days (auto-renewed)

### Obtaining the Certificate

**One-Time Manual Setup:**

```bash
# Install certbot
sudo apt-get install certbot

# Generate wildcard cert (requires DNS access)
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d "*.stagely.dev" \
  --agree-tos \
  --email ops@stagely.dev

# Certbot will prompt you to create a TXT record:
# _acme-challenge.stagely.dev → "abc123..."

# After DNS propagation (~5 mins), certbot retrieves the cert:
# /etc/letsencrypt/live/stagely.dev/fullchain.pem
# /etc/letsencrypt/live/stagely.dev/privkey.pem
```

### Certificate Storage

**Option 1: Kubernetes Secret**

```bash
kubectl create secret tls stagely-wildcard-cert \
  --cert=/etc/letsencrypt/live/stagely.dev/fullchain.pem \
  --key=/etc/letsencrypt/live/stagely.dev/privkey.pem \
  -n stagely
```

**Option 2: AWS Secrets Manager**

```bash
aws secretsmanager create-secret \
  --name stagely/wildcard-cert \
  --secret-string "$(cat /etc/letsencrypt/live/stagely.dev/fullchain.pem)"

aws secretsmanager create-secret \
  --name stagely/wildcard-key \
  --secret-string "$(cat /etc/letsencrypt/live/stagely.dev/privkey.pem)"
```

**Option 3: File on Disk (Simple)**

Mount the cert directory into the Proxy container:

```yaml
# docker-compose.yml (Proxy)
volumes:
  - /etc/letsencrypt/live/stagely.dev:/certs:ro
```

### Auto-Renewal

**Certbot Hook:**

```bash
# /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh
#!/bin/bash
# Reload proxy after cert renewal
kubectl rollout restart deployment/edge-proxy -n stagely
```

**Cron Job:**

```cron
0 3 * * * certbot renew --quiet --deploy-hook /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh
```

## Routing Logic

### Request Flow

```
1. Client requests: https://abc123.stagely.dev/api/users
   ↓
2. Proxy parses Host header: "abc123.stagely.dev"
   ↓
3. Proxy extracts subdomain hash: "abc123"
   ↓
4. Proxy queries Redis: GET route:abc123
   ↓
5. Redis returns: {"ip": "54.1.2.3", "port": 3000, "status": "ready"}
   ↓
6. Proxy dials backend: http://54.1.2.3:3000
   ↓
7. Proxy injects headers:
   - X-Forwarded-For: <client_ip>
   - X-Forwarded-Proto: https
   - X-Stagely-Hash: abc123
   - X-Stagely-Project: <project_slug>
   ↓
8. Proxy streams request to backend
   ↓
9. Backend responds
   ↓
10. Proxy streams response to client
```

### Pseudo-Code

```go
func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // 1. Parse subdomain
    host := r.Host // "abc123.stagely.dev"
    parts := strings.Split(host, ".")
    if len(parts) < 3 {
        http.Error(w, "Invalid host", http.StatusBadRequest)
        return
    }
    hash := parts[0] // "abc123"

    // 2. Lookup route in Redis
    routeKey := "route:" + hash
    route, err := p.Redis.Get(r.Context(), routeKey).Result()
    if err == redis.Nil {
        p.Serve404(w, r, hash)
        return
    }
    if err != nil {
        p.Serve502(w, r, "Redis error")
        return
    }

    // 3. Parse route JSON
    var target RouteTarget
    json.Unmarshal([]byte(route), &target)

    // 4. Check status
    if target.Status == "building" {
        p.ServeBuildingPage(w, r, hash)
        return
    }

    if target.Status != "ready" {
        p.Serve503(w, r, "Stagelet not ready")
        return
    }

    // 5. Dial backend
    backendURL := fmt.Sprintf("http://%s:%d", target.IP, target.Port)
    proxy := httputil.NewSingleHostReverseProxy(parseURL(backendURL))

    // 6. Inject headers
    r.Header.Set("X-Forwarded-For", r.RemoteAddr)
    r.Header.Set("X-Forwarded-Proto", "https")
    r.Header.Set("X-Stagely-Hash", hash)
    r.Header.Set("X-Stagely-Project", target.Project)

    // 7. Strip sensitive headers
    r.Header.Del("X-Stagely-Internal-Token")

    // 8. Proxy the request
    proxy.ServeHTTP(w, r)
}
```

## Redis Data Model

### Route Entry

**Key:** `route:{subdomain_hash}`

**Value (JSON):**

```json
{
  "ip": "54.123.45.67",
  "port": 3000,
  "status": "ready",
  "project": "api-backend",
  "team": "acme-corp",
  "stagelet_id": "env_xk82j9s7"
}
```

**TTL:** 1 hour (refreshed by Agent heartbeat every 30s)

**Why TTL?**

- If Agent dies, the route expires automatically
- No manual cleanup required
- Prevents routing to dead backends

### Example Redis Commands

**Set Route (by Core):**

```redis
SETEX route:abc123 3600 '{"ip":"54.1.2.3","port":3000,"status":"ready","project":"my-app"}'
```

**Get Route (by Proxy):**

```redis
GET route:abc123
```

**Refresh TTL (by Agent heartbeat):**

```redis
EXPIRE route:abc123 3600
```

**Delete Route (by Core when terminating):**

```redis
DEL route:abc123
```

## Error Handling

### 404: Stagelet Not Found

**Scenario:** Redis returns `nil` (key doesn't exist)

**Response:**

```http
HTTP/1.1 404 Not Found
Content-Type: text/html

<!DOCTYPE html>
<html>
<head><title>Stagelet Not Found</title></head>
<body>
  <h1>404 - Stagelet Not Found</h1>
  <p>The preview stagelet <code>abc123</code> does not exist or has been terminated.</p>
  <p>If you believe this is an error, check the PR status on GitHub.</p>
</body>
</html>
```

### 502: Backend Unreachable

**Scenario:** Backend VM is down or not responding

**Response:**

```http
HTTP/1.1 502 Bad Gateway
Content-Type: text/html

<!DOCTYPE html>
<html>
<head><title>Bad Gateway</title></head>
<body>
  <h1>502 - Backend Unreachable</h1>
  <p>The preview stagelet is not responding.</p>
  <p>This could mean:</p>
  <ul>
    <li>The application is starting up (wait 30 seconds)</li>
    <li>The application crashed (check logs)</li>
  </ul>
  <a href="https://dashboard.stagely.dev/stagelets/abc123">View Logs</a>
</body>
</html>
```

### 503: Stagelet Building

**Scenario:** `status` is `"building"` (not ready yet)

**Response:**

```http
HTTP/1.1 503 Service Unavailable
Content-Type: text/html
Retry-After: 30

<!DOCTYPE html>
<html>
<head>
  <title>Building...</title>
  <meta http-equiv="refresh" content="10">
</head>
<body>
  <h1>Your stagelet is being built...</h1>
  <p>This usually takes 2-5 minutes.</p>
  <div class="spinner">⏳</div>
  <p><a href="https://dashboard.stagely.dev/stagelets/abc123">View Build Logs</a></p>
</body>
</html>
```

**Note:** The `Retry-After: 30` header tells clients to retry in 30 seconds. The `<meta http-equiv="refresh">` auto-reloads the page every 10 seconds.

## Header Injection

### Forwarded Headers (Standard)

These are standard reverse proxy headers:

```http
X-Forwarded-For: 203.0.113.45
X-Forwarded-Proto: https
X-Forwarded-Host: abc123.stagely.dev
X-Real-IP: 203.0.113.45
```

### Stagely-Specific Headers

These provide context to the application running in the VM:

```http
X-Stagely-Hash: abc123
X-Stagely-Project: api-backend
X-Stagely-Team: acme-corp
X-Stagely-Stagelet-ID: env_xk82j9s7
X-Stagely-PR: 42
```

**Use Case Example:**

Your application can read these headers to customize behavior:

```javascript
// In your Node.js app
app.use((req, res, next) => {
  const prNumber = req.headers["x-stagely-pr"];
  if (prNumber) {
    console.log(`This request is for PR #${prNumber}`);
  }
  next();
});
```

## Performance Optimizations

### Connection Pooling

The Proxy maintains a pool of connections to backends to avoid TCP handshake overhead:

```go
var backendTransport = &http.Transport{
    MaxIdleConns:        1000,
    MaxIdleConnsPerHost: 100,
    IdleConnTimeout:     90 * time.Second,
    DisableCompression:  true, // Let backend handle compression
}

proxy := &httputil.ReverseProxy{
    Transport: backendTransport,
}
```

### Redis Connection Pool

```go
var redisClient = redis.NewClient(&redis.Options{
    Addr:         "redis.internal:6379",
    PoolSize:     100,
    MinIdleConns: 10,
    MaxRetries:   3,
})
```

### Response Caching (Optional)

For static assets, cache responses:

```go
if strings.HasPrefix(r.URL.Path, "/static/") {
    w.Header().Set("Cache-Control", "public, max-age=3600")
}
```

## Rate Limiting

### Per-Stagelet Rate Limit

Prevent abuse by limiting requests per stagelet:

```go
func (p *Proxy) RateLimit(hash string) bool {
    key := "ratelimit:" + hash
    count, _ := p.Redis.Incr(context.Background(), key).Result()
    if count == 1 {
        p.Redis.Expire(context.Background(), key, 60*time.Second)
    }
    return count <= 1000 // Max 1000 requests per minute
}
```

**Error Response (429):**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60

{
  "error": "Rate limit exceeded",
  "limit": 1000,
  "window": "1 minute"
}
```

### Global Rate Limit (DDoS Protection)

Use a firewall (Cloudflare, AWS WAF) in front of the Proxy.

## Health Checks

### Liveness Probe

```http
GET /healthz
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "uptime_seconds": 86400
}
```

### Readiness Probe

Checks if Proxy can connect to Redis:

```http
GET /readyz
```

**Response (healthy):**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ready",
  "redis": "connected"
}
```

**Response (unhealthy):**

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "status": "not_ready",
  "redis": "disconnected"
}
```

## Observability

### Structured Logging

Use JSON logs for easy parsing:

```json
{
  "timestamp": "2025-12-06T14:30:00Z",
  "level": "info",
  "message": "request_handled",
  "hash": "abc123",
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "duration_ms": 45,
  "backend_ip": "54.1.2.3",
  "client_ip": "203.0.113.45"
}
```

### Metrics (Prometheus)

Expose metrics on `/metrics`:

```
# HELP stagely_proxy_requests_total Total number of requests
# TYPE stagely_proxy_requests_total counter
stagely_proxy_requests_total{status="200"} 10523
stagely_proxy_requests_total{status="404"} 42
stagely_proxy_requests_total{status="502"} 5

# HELP stagely_proxy_request_duration_seconds Request duration histogram
# TYPE stagely_proxy_request_duration_seconds histogram
stagely_proxy_request_duration_seconds_bucket{le="0.01"} 8000
stagely_proxy_request_duration_seconds_bucket{le="0.05"} 10000
stagely_proxy_request_duration_seconds_bucket{le="0.1"} 10500
stagely_proxy_request_duration_seconds_sum 523.45
stagely_proxy_request_duration_seconds_count 10523

# HELP stagely_proxy_redis_latency_seconds Redis query latency
# TYPE stagely_proxy_redis_latency_seconds histogram
stagely_proxy_redis_latency_seconds_bucket{le="0.001"} 10000
stagely_proxy_redis_latency_seconds_bucket{le="0.005"} 10500
```

### Tracing (OpenTelemetry)

Propagate trace context to backends:

```go
import "go.opentelemetry.io/otel"

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    ctx, span := otel.Tracer("proxy").Start(r.Context(), "proxy_request")
    defer span.End()

    // ... proxy logic ...
}
```

## Horizontal Scaling

### Load Balancer Configuration

**AWS ALB:**

```yaml
# Target Group
Protocol: HTTPS
Port: 443
HealthCheck: /healthz
Stickiness: None (stateless)

# Auto Scaling
MinSize: 2
MaxSize: 20
TargetCPUUtilization: 70%
```

**Kubernetes:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: edge-proxy
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: proxy
          image: stagely/edge-proxy:latest
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"
---
apiVersion: v1
kind: Service
metadata:
  name: edge-proxy
spec:
  type: LoadBalancer
  ports:
    - port: 443
      targetPort: 8443
```

### Scaling Metrics

- Scale up if: `avg(CPU) > 70%` for 2 minutes
- Scale down if: `avg(CPU) < 30%` for 5 minutes

## Security

### HTTPS-Only

Redirect HTTP to HTTPS:

```go
if r.TLS == nil {
    redirectURL := "https://" + r.Host + r.URL.String()
    http.Redirect(w, r, redirectURL, http.StatusMovedPermanently)
    return
}
```

### Header Stripping

Remove internal headers before forwarding:

```go
blacklist := []string{
    "X-Stagely-Internal-Token",
    "X-Admin-Secret",
}

for _, header := range blacklist {
    r.Header.Del(header)
}
```

### CORS Handling

Let the backend handle CORS (don't add headers in Proxy):

```go
// Do NOT add CORS headers here
// Let the backend app decide its CORS policy
```

## Implementation (Go)

### Full Example

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "net/http/httputil"
    "net/url"
    "strings"
    "time"

    "github.com/go-redis/redis/v8"
)

type RouteTarget struct {
    IP      string `json:"ip"`
    Port    int    `json:"port"`
    Status  string `json:"status"`
    Project string `json:"project"`
}

type Proxy struct {
    Redis *redis.Client
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // Health check
    if r.URL.Path == "/healthz" {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"status":"healthy"}`))
        return
    }

    // Parse subdomain
    host := r.Host
    parts := strings.Split(host, ".")
    if len(parts) < 3 {
        http.Error(w, "Invalid host", http.StatusBadRequest)
        return
    }
    hash := parts[0]

    // Lookup route
    ctx, cancel := context.WithTimeout(r.Context(), 100*time.Millisecond)
    defer cancel()

    routeJSON, err := p.Redis.Get(ctx, "route:"+hash).Result()
    if err == redis.Nil {
        p.serve404(w, r, hash)
        return
    }
    if err != nil {
        log.Printf("Redis error: %v", err)
        http.Error(w, "Internal server error", http.StatusInternalServerError)
        return
    }

    var target RouteTarget
    if err := json.Unmarshal([]byte(routeJSON), &target); err != nil {
        http.Error(w, "Invalid route data", http.StatusInternalServerError)
        return
    }

    // Check status
    if target.Status != "ready" {
        p.serveBuildingPage(w, r, hash)
        return
    }

    // Proxy request
    backendURL, _ := url.Parse(fmt.Sprintf("http://%s:%d", target.IP, target.Port))
    proxy := httputil.NewSingleHostReverseProxy(backendURL)

    // Inject headers
    r.Header.Set("X-Forwarded-For", r.RemoteAddr)
    r.Header.Set("X-Forwarded-Proto", "https")
    r.Header.Set("X-Stagely-Hash", hash)

    proxy.ServeHTTP(w, r)
}

func (p *Proxy) serve404(w http.ResponseWriter, r *http.Request, hash string) {
    w.WriteHeader(http.StatusNotFound)
    fmt.Fprintf(w, "<h1>404 - Stagelet Not Found</h1><p>Hash: %s</p>", hash)
}

func (p *Proxy) serveBuildingPage(w http.ResponseWriter, r *http.Request, hash string) {
    w.Header().Set("Retry-After", "30")
    w.WriteHeader(http.StatusServiceUnavailable)
    fmt.Fprintf(w, "<h1>Building...</h1><p>Hash: %s</p>", hash)
}

func main() {
    rdb := redis.NewClient(&redis.Options{
        Addr: "redis:6379",
    })

    proxy := &Proxy{Redis: rdb}

    log.Println("Edge Proxy listening on :8443")
    log.Fatal(http.ListenAndServeTLS(":8443", "/certs/fullchain.pem", "/certs/privkey.pem", proxy))
}
```

## Deployment

### Docker

```dockerfile
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o proxy .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates
COPY --from=builder /app/proxy /usr/local/bin/proxy
CMD ["proxy"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: edge-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: edge-proxy
  template:
    metadata:
      labels:
        app: edge-proxy
    spec:
      containers:
        - name: proxy
          image: stagely/edge-proxy:latest
          ports:
            - containerPort: 8443
          volumeMounts:
            - name: certs
              mountPath: /certs
              readOnly: true
          env:
            - name: REDIS_URL
              value: "redis://redis.stagely.svc.cluster.local:6379"
      volumes:
        - name: certs
          secret:
            secretName: stagely-wildcard-cert
```

## Testing

### Unit Tests

```go
func TestRouting(t *testing.T) {
    // Mock Redis
    mockRedis := miniredis.RunT(t)
    mockRedis.Set("route:abc123", `{"ip":"1.2.3.4","port":3000,"status":"ready"}`)

    rdb := redis.NewClient(&redis.Options{Addr: mockRedis.Addr()})
    proxy := &Proxy{Redis: rdb}

    req := httptest.NewRequest("GET", "http://abc123.stagely.dev/", nil)
    rec := httptest.NewRecorder()

    proxy.ServeHTTP(rec, req)

    if rec.Code != http.StatusOK {
        t.Errorf("Expected 200, got %d", rec.Code)
    }
}
```

### Load Testing

```bash
# Apache Bench
ab -n 10000 -c 100 https://abc123.stagely.dev/

# wrk
wrk -t12 -c400 -d30s https://abc123.stagely.dev/
```

## Troubleshooting

### Issue: High Latency

**Symptom:** Requests take >500ms

**Debug:**

```bash
# Check Redis latency
redis-cli --latency

# Check backend latency
curl -w "%{time_total}\n" -o /dev/null -s http://54.1.2.3:3000/
```

**Fix:** Increase connection pool size or add Redis replicas.

### Issue: 502 Errors

**Symptom:** Backend unreachable

**Debug:**

```bash
# Check if backend VM is running
ssh user@54.1.2.3
docker ps

# Check firewall
nc -zv 54.1.2.3 3000
```

**Fix:** Restart application or open firewall rules.

## Future Enhancements

1. **WebSocket Support**: Proxy WebSocket connections
2. **Compression**: Enable gzip/brotli compression
3. **Caching**: Cache static assets
4. **Authentication Overlay**: Add optional auth layer before backend
5. **Geographic Routing**: Route to nearest VM
