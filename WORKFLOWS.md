# 🚀 DevOps Junior Roadmap — Hướng Dẫn Triển Khai Hoàn Chỉnh

> **Mục tiêu**: Xây dựng một repository production-grade với đầy đủ CI/CD, monitoring, logging, backup, và HTTPS — sử dụng Git Flow chuyên nghiệp.

---

## 📁 Cấu Trúc Repository Cuối Cùng

```
devops-webapp/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Build & Test
│       └── cd.yml              # Deploy to production
├── app/                        # Source code Node.js
│   ├── app.js
│   ├── package.json
│   └── Dockerfile
├── nginx/
│   └── default.conf            # Nginx reverse proxy config
├── monitoring/                 # Prometheus + Grafana stack
│   ├── docker-compose.yml
│   ├── prometheus.yml
│   ├── alert.rules.yml
│   ├── alertmanager.yml
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           └── dashboards/
├── elk/                        # ELK Stack
│   ├── docker-compose.yml
│   ├── logstash/pipeline/
│   └── filebeat/filebeat.yml
├── scripts/                    # Bash scripts
│   ├── pg_backup.sh
│   └── pg_restore_test.sh
├── docker-compose.yml          # Main app stack
├── docker-compose.override.yml # Local dev overrides
├── .env.example                # Template (SAFE to commit)
├── .gitignore
├── Makefile
└── README.md
```

---

## 🌿 Part 0: Git Flow — Tư Duy & Chiến Lược Nhánh

### Mô Hình Nhánh

```
main          ──●────────────────────────────────●──────●──→ (production)
                │                                ↑      ↑
develop       ──●──●──●──●──●──●──●──●──────────●──────→ (integration)
                   │  │  │  │  │  │  │
                   │  │  │  │  │  │  └── feature/developer-experience
                   │  │  │  │  │  └───── feature/https-nginx
                   │  │  │  │  └──────── feature/backup-scripts
                   │  │  │  └─────────── feature/elk-logging
                   │  │  └──────────────feature/monitoring-stack
                   │  └─────────────────feature/cicd-pipeline
                   └────────────────────feature/docker-setup
```

### Quy Tắc Nhánh

| Nhánh | Mục đích | Ai merge vào? | Deploy đến? |
|-------|----------|---------------|-------------|
| `main` | Production code | `release/*` hoặc `hotfix/*` | Production server |
| `develop` | Integration branch | `feature/*` | Staging (tùy chọn) |
| `feature/*` | Tính năng mới | Dev cá nhân | Không |
| `release/*` | Chuẩn bị release | `develop` | Pre-production |
| `hotfix/*` | Vá lỗi khẩn | `main` | Production ASAP |

### Quy Tắc Commit Message (Conventional Commits)

```
<type>(<scope>): <short description>

type: feat | fix | docs | chore | refactor | test | ci
scope: docker | nginx | monitoring | elk | backup | ci

Ví dụ:
feat(docker): add multi-stage build for app container
fix(nginx): correct proxy timeout configuration
ci(github-actions): add Docker layer caching
chore(backup): add pg_backup cron script
```

---

## ⚙️ Part 1: Khởi Tạo Repository

```bash
mkdir devops-webapp && cd devops-webapp
git init

cat > .gitignore << 'EOF'
# Secrets — KHÔNG BAO GIỜ commit
.env
*.env.local
*.pem
*.key
id_rsa*

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Node
node_modules/

# Docker volumes
data/
postgres_data/
EOF

git add .gitignore
git commit -m "chore: initialize repository with .gitignore"

# Tạo nhánh develop NGAY sau commit đầu
git branch develop

# Push lên GitHub (tạo repo trước, không init README)
git remote add origin git@github.com:your-username/devops-webapp.git
git push -u origin main
git push -u origin develop
```

**Protect branches trên GitHub:**
```
Settings → Branches → Add rule:
  Branch: main   → ✅ Require PR, ✅ Require status checks
  Branch: develop → ✅ Require PR
```

**`.env.example`** (commit file này, KHÔNG commit `.env`):
```env
DB_NAME=webapp
DB_USER=appuser
DB_PASS=CHANGE_ME_SECURE_PASSWORD
GRAFANA_PASSWORD=CHANGE_ME
ELASTIC_PASSWORD=CHANGE_ME
KIBANA_PASSWORD=CHANGE_ME
S3_BUCKET=
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## 🐳 Part 2: Feature Branch — Docker & Nginx (J1)

```bash
git checkout develop && git pull
git checkout -b feature/docker-setup
mkdir -p app nginx
```

**`app/app.js`:**
```javascript
const express = require('express');
const app = express();

app.get('/', (req, res) => res.json({ 
  status: 'ok', service: 'webapp',
  timestamp: new Date().toISOString()
}));
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`app_uptime_seconds ${process.uptime()}\n`);
});

app.listen(process.env.PORT || 3000, () => console.log('App running on port 3000'));
```

**`app/Dockerfile`:**
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["npm", "start"]
```

**`nginx/default.conf`:**
```nginx
upstream webapp {
    server app:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name localhost;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    location / {
        proxy_pass http://webapp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_connect_timeout 30s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://webapp/health;
        access_log off;
    }
}
```

**`docker-compose.yml`:**
```yaml
version: '3.9'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped

  app:
    build: ./app
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=${DB_NAME:-webapp}
      - DB_USER=${DB_USER:-appuser}
      - DB_PASS=${DB_PASS:-securepass}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_NAME:-webapp}
      POSTGRES_USER: ${DB_USER:-appuser}
      POSTGRES_PASSWORD: ${DB_PASS:-securepass}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-appuser}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  nginx_logs:
```

**`docker-compose.override.yml`** (local dev only — không ảnh hưởng production):
```yaml
version: '3.9'
services:
  app:
    volumes:
      - ./app:/app   # Live reload
    environment:
      - NODE_ENV=development
  db:
    ports:
      - "5432:5432"  # Expose để dùng DB tool local
```

```bash
git add .
git commit -m "feat(docker): add containerized webapp with nginx reverse proxy

- Multi-stage Dockerfile (minimal image size, non-root user)
- Nginx reverse proxy with keepalive and security headers
- PostgreSQL with persistent volume and health checks
- docker-compose.override.yml for local dev convenience"

git push origin feature/docker-setup
# ➡️ Mở Pull Request: feature/docker-setup → develop
# ➡️ Review → Merge
```

---

## 🔁 Part 3: Feature Branch — CI/CD (J2)

```bash
git checkout develop && git pull
git checkout -b feature/cicd-pipeline
mkdir -p .github/workflows
```

**`.github/workflows/ci.yml`:**
```yaml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  IMAGE_NAME: ${{ secrets.DOCKERHUB_USERNAME }}/webapp

jobs:
  test:
    name: 🧪 Run Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json
      - run: cd app && npm ci
      - run: cd app && npm test

  build:
    name: 🐳 Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=sha-
            type=raw,value=latest
      - uses: docker/build-push-action@v5
        with:
          context: ./app
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**`.github/workflows/cd.yml`:**
```yaml
name: CD Pipeline

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    name: 🚀 Deploy to Production
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            set -e
            cd /opt/webapp
            docker compose pull app
            docker compose up -d --no-build --remove-orphans
            docker image prune -f
            echo "✅ Deployed at $(date)"
```

> **Cấu hình Secrets trong GitHub:**
> `Settings → Secrets and variables → Actions`
> - `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`
> - `SERVER_HOST` / `SERVER_USER` / `SSH_PRIVATE_KEY`

```bash
git add .github/
git commit -m "ci: add GitHub Actions CI/CD pipeline

- Test on every push and PR to main/develop
- Build & push Docker image only on main merge
- Auto-deploy to production via SSH
- Docker layer caching with GHA cache"

git push origin feature/cicd-pipeline
# ➡️ PR: feature/cicd-pipeline → develop
```

---

## 📊 Part 4: Feature Branch — Monitoring (J3)

```bash
git checkout develop && git pull
git checkout -b feature/monitoring-stack
mkdir -p monitoring/grafana/provisioning/{datasources,dashboards}
```

**`monitoring/prometheus.yml`:**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - "alert.rules.yml"

scrape_configs:
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  - job_name: 'webapp'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'
```

**`monitoring/alert.rules.yml`:**
```yaml
groups:
  - name: server_alerts
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance)(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CPU cao {{ $value | printf \"%.1f\" }}% trên {{ $labels.instance }}"

      - alert: HighMemoryUsage
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 85
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Memory cao {{ $value | printf \"%.1f\" }}% trên {{ $labels.instance }}"

      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes) * 100 < 15
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Disk thấp {{ $value | printf \"%.1f\" }}% còn lại"

      - alert: AppDown
        expr: up{job="webapp"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Webapp DOWN trên {{ $labels.instance }}"
```

**`monitoring/grafana/provisioning/datasources/prometheus.yml`:**
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

**`monitoring/docker-compose.yml`:**
```yaml
version: '3.9'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./alert.rules.yml:/etc/prometheus/alert.rules.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin123}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    ports:
      - "3000:3000"
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    network_mode: host
    pid: host
    volumes:
      - '/:/host:ro,rslave'
    command: ['--path.rootfs=/host']
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    ports:
      - "9093:9093"
    restart: unless-stopped

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```

```bash
git add monitoring/
git commit -m "feat(monitoring): add Prometheus + Grafana monitoring stack

- Prometheus scraping app, node-exporter, cAdvisor
- 30d data retention
- Grafana with auto-provisioned Prometheus datasource
- Alert rules: CPU >80%, Memory >85%, Disk <15%, App down
- AlertManager for routing to Telegram"

git push origin feature/monitoring-stack
# ➡️ PR: feature/monitoring-stack → develop
```

---

## 📋 Part 5: Feature Branch — ELK (J4)

```bash
git checkout develop && git pull
git checkout -b feature/elk-logging
mkdir -p elk/{logstash/pipeline,filebeat}
```

**`elk/logstash/pipeline/logstash.conf`:**
```
input {
  beats { port => 5044 }
}

filter {
  if [container][name] =~ /webapp/ {
    grok { match => { "message" => "%{COMBINEDAPACHELOG}" } }
    date { match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"] }
  }
  mutate { remove_field => ["agent", "ecs"] }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    user => "elastic"
    password => "${ELASTIC_PASSWORD}"
    index => "webapp-logs-%{+YYYY.MM.dd}"
  }
}
```

**`elk/filebeat/filebeat.yml`:**
```yaml
filebeat.inputs:
  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log
    processors:
      - add_docker_metadata:
          host: "unix:///var/run/docker.sock"

output.logstash:
  hosts: ["logstash:5044"]
```

**`elk/docker-compose.yml`:**
```yaml
version: '3.9'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    environment:
      - discovery.type=single-node
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD:-changeme}
      - xpack.security.enabled=true
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    healthcheck:
      test: ["CMD-SHELL", "curl -su elastic:${ELASTIC_PASSWORD:-changeme} http://localhost:9200/_cluster/health | grep -qE 'green|yellow'"]
      interval: 30s
      retries: 5
    ulimits:
      memlock: { soft: -1, hard: -1 }
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.12.0
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - ELASTICSEARCH_USERNAME=kibana_system
      - ELASTICSEARCH_PASSWORD=${KIBANA_PASSWORD:-changeme}
    ports:
      - "5601:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

  logstash:
    image: docker.elastic.co/logstash/logstash:8.12.0
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline:ro
    environment:
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD:-changeme}
    depends_on:
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

  filebeat:
    image: docker.elastic.co/beats/filebeat:8.12.0
    user: root
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

volumes:
  es_data:
```

```bash
git add elk/
git commit -m "feat(elk): add ELK centralized logging stack

- Elasticsearch 8.12 with security (xpack)
- Kibana for visualization
- Logstash pipeline with grok Apache log parsing
- Filebeat collecting Docker container logs by metadata"

git push origin feature/elk-logging
# ➡️ PR: feature/elk-logging → develop
```

---

## 💾 Part 6: Feature Branch — Backup (J5)

```bash
git checkout develop && git pull
git checkout -b feature/backup-scripts
mkdir -p scripts
```

**`scripts/pg_backup.sh`:**
```bash
#!/bin/bash
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:?Error: DB_PASS not set}"
DB_NAMES="${DB_NAMES:-all}"
BACKUP_DIR="/opt/backups/postgresql"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
S3_BUCKET="${S3_BUCKET:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

notify_telegram() {
    [[ -z "${TELEGRAM_TOKEN:-}" ]] && return
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
        -d "chat_id=${TELEGRAM_CHAT_ID}" -d "text=$1" > /dev/null
}

mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${DATE}"
mkdir -p "$BACKUP_PATH"

log "=== START BACKUP ==="

if [[ "$DB_NAMES" == "all" ]]; then
    DATABASES=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -t -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres';")
else
    DATABASES="$DB_NAMES"
fi

FAILED=0; SUCCESS=0
for DB in $DATABASES; do
    DB=$(echo "$DB" | tr -d '[:space:]')
    [[ -z "$DB" ]] && continue
    OUTFILE="${BACKUP_PATH}/${DB}.dump"
    if PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -Fc --compress=9 "$DB" > "$OUTFILE" 2>/dev/null; then
        log "✅ $DB OK ($(du -sh "$OUTFILE" | cut -f1))"
        ((SUCCESS++))
    else
        log "❌ $DB FAILED"; ((FAILED++))
    fi
done

find "$BACKUP_DIR" -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true

[[ -n "$S3_BUCKET" ]] && aws s3 sync "$BACKUP_PATH" "s3://${S3_BUCKET}/postgresql/${DATE}/" --storage-class STANDARD_IA

SUMMARY="🗄️ Backup: ✅ ${SUCCESS} thành công | ❌ ${FAILED} thất bại | $(date)"
log "=== END: Success=${SUCCESS}, Failed=${FAILED} ==="

if [[ $FAILED -gt 0 ]]; then notify_telegram "⚠️ BACKUP FAILED! ${SUMMARY}"; exit 1
else notify_telegram "${SUMMARY}"; fi
```

```bash
chmod +x scripts/pg_backup.sh
git add scripts/
git commit -m "chore(backup): add automated PostgreSQL backup script

- Backup all or specific databases to compressed .dump files
- Configurable retention period (default 7 days)
- Optional S3 upload with STANDARD_IA storage class
- Telegram notifications on success/failure
- Cron: 0 2 * * * /opt/scripts/pg_backup.sh"

git push origin feature/backup-scripts
# ➡️ PR: feature/backup-scripts → develop
```

---

## 🔒 Part 7: Feature Branch — HTTPS (J6)

```bash
git checkout develop && git pull
git checkout -b feature/https-nginx
```

**`nginx/nginx-https.conf`** (template cho production):
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy no-referrer-when-downgrade;

    gzip on;
    gzip_types text/css application/javascript application/json;

    location / {
        proxy_pass http://webapp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**`scripts/setup_https.sh`:**
```bash
#!/bin/bash
DOMAIN="${1:?Usage: $0 your-domain.com admin@email.com}"
EMAIL="${2:?Usage: $0 your-domain.com admin@email.com}"

apt update && apt install -y certbot python3-certbot-nginx

certbot --nginx -d "$DOMAIN" -d "www.${DOMAIN}" \
    --non-interactive --agree-tos --email "$EMAIL"

echo "0 12 * * * root certbot renew --quiet && systemctl reload nginx" \
    > /etc/cron.d/certbot

certbot renew --dry-run && echo "✅ HTTPS setup complete for $DOMAIN"
```

```bash
git add nginx/ scripts/setup_https.sh
git commit -m "feat(https): add HTTPS/TLS Nginx config with Let's Encrypt

- TLS 1.2/1.3 only with strong cipher suite
- HSTS with preload (63072000s = 2 years)
- HTTP to HTTPS redirect
- Auto-renewal cron setup script"

git push origin feature/https-nginx
# ➡️ PR: feature/https-nginx → develop
```

---

## 🛠️ Part 8: Developer Experience — Makefile

```bash
git checkout develop && git pull
git checkout -b feature/developer-experience
```

**`Makefile`:**
```makefile
.PHONY: help up down logs ps build clean monitoring-up elk-up backup health

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## Start main app stack
	docker compose up -d --build

down: ## Stop main app stack
	docker compose down

logs: ## Follow app logs
	docker compose logs -f app

ps: ## Show container status
	docker compose ps

build: ## Rebuild without cache
	docker compose build --no-cache

clean: ## Remove volumes and local images
	docker compose down -v --rmi local

monitoring-up: ## Start monitoring stack
	cd monitoring && docker compose --env-file ../.env up -d

monitoring-down: ## Stop monitoring stack
	cd monitoring && docker compose down

elk-up: ## Start ELK stack
	cd elk && docker compose --env-file ../.env up -d

elk-down: ## Stop ELK stack
	cd elk && docker compose down

backup: ## Run manual backup
	bash scripts/pg_backup.sh

health: ## Check app health endpoint
	@curl -s http://localhost/health | python3 -m json.tool
```

```bash
git add Makefile
git commit -m "chore: add Makefile for developer convenience

Shortcuts:
  make up            - start app stack
  make monitoring-up - start monitoring
  make elk-up        - start logging
  make backup        - manual backup
  make health        - check health endpoint"

git push origin feature/developer-experience
# ➡️ PR: feature/developer-experience → develop
```

---

## 🚀 Part 9: Release Flow

```bash
# Sau khi tất cả feature branches đã merge vào develop:
git checkout develop && git pull

# Tạo release branch
git checkout -b release/v1.0.0

# Tạo CHANGELOG
cat > CHANGELOG.md << 'EOF'
## v1.0.0 - $(date +%Y-%m-%d)

### Added
- feat(docker): Containerized webapp with multi-stage Dockerfile + Nginx
- feat(ci/cd): GitHub Actions CI test + CD auto-deploy
- feat(monitoring): Prometheus + Grafana + Alertmanager stack
- feat(elk): ELK centralized logging with Filebeat
- feat(backup): Automated PostgreSQL backup with S3 + Telegram
- feat(https): TLS config with Let's Encrypt auto-renewal
EOF

git add CHANGELOG.md
git commit -m "chore(release): prepare v1.0.0"
git push origin release/v1.0.0

# Mở PR: release/v1.0.0 → main
# Review → Merge

# Sau khi merge vào main — tạo git tag
git checkout main && git pull
git tag -a v1.0.0 -m "Release v1.0.0: Full DevOps Junior stack"
git push origin v1.0.0

# Quan trọng: sync release changes ngược lại develop
git checkout develop
git merge main
git push origin develop
```

---

## 🔥 Part 10: Hotfix Flow

```bash
# Phát hiện bug trên production
git checkout main && git pull
git checkout -b hotfix/fix-nginx-timeout

# Sửa lỗi (ví dụ tăng timeout)
# Edit nginx/default.conf...

git add .
git commit -m "fix(nginx): increase proxy_read_timeout to 120s

Requests to slow DB queries were timing out at 60s.
Increased to 120s to prevent 504 errors."

git push origin hotfix/fix-nginx-timeout

# PR nhanh: hotfix/fix-nginx-timeout → main
# CI pass → Merge → CD tự deploy

# Đừng quên sync lại develop:
git checkout develop
git merge main
git push origin develop
```

---

## 📊 Tổng Kết: Timeline & Thứ Tự

### Branch Timeline

```
main:     ●────────────────────────────────────────────●──────●
          │                                            ↑      ↑
          │                              release/v1.0  │     hotfix/*
develop:  ●──●──●──●──●──●──●──●──────────────────────●──────→
              │  │  │  │  │  │  │
              │  │  │  │  │  │  └── feature/developer-experience
              │  │  │  │  │  └───── feature/https-nginx
              │  │  │  │  └──────── feature/backup-scripts
              │  │  │  └─────────── feature/elk-logging
              │  │  └──────────────── feature/monitoring-stack
              │  └──────────────────── feature/cicd-pipeline
              └────────────────────── feature/docker-setup
```

### Thứ Tự Triển Khai Khuyến Nghị

| # | Branch | Task | Phụ thuộc | Thời gian ước tính |
|---|--------|------|-----------|-------------------|
| 1 | `feature/docker-setup` | J1 | — | 2-3h |
| 2 | `feature/cicd-pipeline` | J2 | J1 | 2-3h |
| 3 | `feature/monitoring-stack` | J3 | J1 | 2-3h |
| 4 | `feature/elk-logging` | J4 | J1 | 3-4h |
| 5 | `feature/backup-scripts` | J5 | J1 (DB) | 1-2h |
| 6 | `feature/https-nginx` | J6 | J1 | 1h |
| 7 | `feature/developer-experience` | DX | All | 30m |
| 8 | `release/v1.0.0` | Release | All | 30m |

---

## ✅ Checklist Repository Hoàn Chỉnh

- [ ] `main` và `develop` được **Branch Protection** trên GitHub
- [ ] `.env` không xuất hiện trong `git log` (kiểm tra bằng `git log --all -- .env`)
- [ ] Tất cả tính năng được merge qua **Pull Request** (không direct push)
- [ ] **CI pass** trước khi merge bất kỳ PR nào vào `develop` hoặc `main`
- [ ] **Git tags** được tạo tại mỗi release (`v1.0.0`, `v1.1.0`, ...)
- [ ] `CHANGELOG.md` ghi lại thay đổi của mỗi version
- [ ] Secrets chỉ tồn tại trong **GitHub Actions Secrets**, không hardcode
- [ ] `docker-compose.override.yml` được giải thích trong README (chỉ dùng local)
- [ ] Health checks hoạt động: `make health` trả về `{"status": "healthy"}`
- [ ] Monitoring: Prometheus scrape được 3 targets (node, cadvisor, app)
- [ ] Logging: Kibana thấy index `webapp-logs-*`
- [ ] Backup: cron chạy và file `.dump` xuất hiện trong `/opt/backups/`
