# 🟢 JUNIOR: Hướng Dẫn Chi Tiết

---

## J1 — Triển Khai Web App Với Docker & Nginx

### 🎯 Mục Tiêu
- Containerize một ứng dụng web (Node.js / Python)
- Cấu hình Nginx làm reverse proxy
- Quản lý multi-container với Docker Compose

### 🛠️ Kiến Trúc
```
Internet → Nginx (port 80) → App Container (port 3000)
                           → DB Container (port 5432)
```

### 📋 Step-by-Step

**Bước 1: Chuẩn bị ứng dụng mẫu**
```bash
# Tạo thư mục project
mkdir docker-webapp && cd docker-webapp

# Tạo app Node.js đơn giản
cat > app.js << 'EOF'
const express = require('express');
const app = express();
app.get('/', (req, res) => res.json({ status: 'ok', service: 'webapp' }));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.listen(3000, () => console.log('App running on port 3000'));
EOF

cat > package.json << 'EOF'
{
  "name": "webapp",
  "version": "1.0.0",
  "dependencies": { "express": "^4.18.0" },
  "scripts": { "start": "node app.js" }
}
EOF
```

**Bước 2: Tạo Dockerfile**
```dockerfile
# Dockerfile
FROM node:20-alpine

# Non-root user (security best practice)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY --chown=appuser:appgroup . .
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["npm", "start"]
```

**Bước 3: Cấu hình Nginx**
```nginx
# nginx/default.conf
upstream webapp {
    server app:3000;
}

server {
    listen 80;
    server_name localhost;

    # Logging
    access_log /var/log/nginx/webapp_access.log;
    error_log  /var/log/nginx/webapp_error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    location / {
        proxy_pass http://webapp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://webapp/health;
        access_log off;
    }
}
```

**Bước 4: Docker Compose**
```yaml
# docker-compose.yml
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
    build: .
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

**Bước 5: Khởi chạy và kiểm tra**
```bash
# Build và start
docker compose up -d --build

# Kiểm tra logs
docker compose logs -f app

# Kiểm tra health
curl http://localhost/health

# Xem resource usage
docker stats
```

### ✅ Checklist Hoàn Thành
- [ ] App chạy trong container, không dùng root
- [ ] Nginx proxy đúng đến app
- [ ] PostgreSQL có persistent volume
- [ ] Health check hoạt động
- [ ] `.env` file cho sensitive data, không hardcode

---

## J2 — CI/CD Pipeline Cơ Bản với GitHub Actions

### 🎯 Mục Tiêu
- Tự động build Docker image khi push code
- Chạy automated tests
- Push image lên Docker Hub / GHCR
- Deploy tự động lên server

### 📋 Step-by-Step

**Bước 1: Cấu trúc thư mục**
```
.github/
  workflows/
    ci.yml       # Build & Test
    cd.yml       # Deploy to server
```

**Bước 2: CI Pipeline (Build & Test)**
```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  IMAGE_NAME: your-dockerhub-user/webapp
  
jobs:
  test:
    name: 🧪 Run Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Lint check
        run: npm run lint || true

  build:
    name: 🐳 Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Bước 3: CD Pipeline (Deploy)**
```yaml
# .github/workflows/cd.yml
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
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/webapp
            docker compose pull
            docker compose up -d --no-build
            docker image prune -f
            echo "✅ Deployed at $(date)"
```

**Bước 4: Cấu hình Secrets trong GitHub**
```
GitHub Repo → Settings → Secrets → Actions:
  DOCKERHUB_USERNAME    = your_username
  DOCKERHUB_TOKEN       = your_access_token
  SERVER_HOST           = your.server.ip
  SERVER_USER           = deploy
  SSH_PRIVATE_KEY       = (private key content)
```

### ✅ Checklist Hoàn Thành
- [ ] Push code → tự động chạy test
- [ ] Merge main → tự động build và push Docker image
- [ ] Deploy tự động lên server qua SSH
- [ ] Rollback được khi có lỗi

---

## J3 — Monitoring Stack: Prometheus + Grafana

### 🎯 Mục Tiêu
- Thu thập metrics từ server và containers
- Tạo dashboard trực quan trên Grafana
- Thiết lập alerting khi có sự cố

### Kiến Trúc
```
Server/App → Node Exporter → Prometheus → Grafana Dashboard
                                       → AlertManager → Email/Slack
```

### 📋 Step-by-Step

**Bước 1: Docker Compose cho monitoring stack**
```yaml
# monitoring/docker-compose.yml
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
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin123}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=http://your-domain.com/grafana
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    ports:
      - "3000:3000"
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    command:
      - '--path.rootfs=/host'
    network_mode: host
    pid: host
    volumes:
      - '/:/host:ro,rslave'
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

**Bước 2: Cấu hình Prometheus**
```yaml
# prometheus.yml
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
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  - job_name: 'webapp'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'
```

**Bước 3: Alert Rules**
```yaml
# alert.rules.yml
groups:
  - name: server_alerts
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CPU usage cao trên {{ $labels.instance }}"
          description: "CPU đang ở {{ $value }}%"

      - alert: HighMemoryUsage
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 85
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Memory usage cao trên {{ $labels.instance }}"

      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes) * 100 < 15
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Disk space thấp: {{ $value }}% còn lại"

      - alert: ContainerDown
        expr: absent(container_last_seen{name="webapp_app_1"})
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Container webapp đã dừng"
```

**Bước 4: AlertManager (gửi Telegram)**
```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'telegram'
  routes:
    - match:
        severity: critical
      receiver: 'telegram'
      repeat_interval: 1h

receivers:
  - name: 'telegram'
    webhook_configs:
      - url: 'http://telegram-bot:8080/alert'
        send_resolved: true
```

### ✅ Checklist Hoàn Thành
- [ ] Prometheus scrape được node-exporter và cAdvisor
- [ ] Grafana dashboard hiển thị CPU, Memory, Disk, Network
- [ ] Alert gửi được thông báo khi threshold vượt ngưỡng
- [ ] Data retention 30 ngày

---

## J4 — Centralized Logging: ELK Stack

### 🎯 Mục Tiêu
- Thu thập logs từ nhiều containers/services
- Index và search logs trên Elasticsearch
- Visualize trên Kibana

### 📋 Step-by-Step

**Bước 1: Docker Compose ELK**
```yaml
# elk/docker-compose.yml
version: '3.9'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    environment:
      - node.name=es01
      - cluster.name=elk-cluster
      - discovery.type=single-node
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD:-changeme}
      - xpack.security.enabled=true
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    healthcheck:
      test: ["CMD-SHELL", "curl -su elastic:${ELASTIC_PASSWORD:-changeme} http://localhost:9200/_cluster/health | grep -q '\"status\":\"green\"\\|\"status\":\"yellow\"'"]
      interval: 30s
      timeout: 10s
      retries: 5
    ulimits:
      memlock:
        soft: -1
        hard: -1
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
      - ./logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro
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

**Bước 2: Filebeat config thu thập Docker logs**
```yaml
# filebeat/filebeat.yml
filebeat.inputs:
  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log
    processors:
      - add_docker_metadata:
          host: "unix:///var/run/docker.sock"
      - decode_json_fields:
          fields: ["message"]
          target: "json"
          overwrite_keys: true

processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded
  - add_cloud_metadata: ~

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  username: "elastic"
  password: "${ELASTIC_PASSWORD}"
  index: "filebeat-%{[agent.version]}-%{+yyyy.MM.dd}"

setup.kibana:
  host: "kibana:5601"

setup.ilm.enabled: true
setup.ilm.rollover_alias: "filebeat"
setup.ilm.pattern: "{now/d}-000001"
```

---

## J5 — Backup & Restore PostgreSQL Tự Động

### 📋 Script Backup Hoàn Chỉnh

```bash
#!/bin/bash
# /opt/scripts/pg_backup.sh
set -euo pipefail

# === CẤU HÌNH ===
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAMES="${DB_NAMES:-all}"  # "all" hoặc "db1 db2 db3"
BACKUP_DIR="/opt/backups/postgresql"
RETENTION_DAYS=7
S3_BUCKET="${S3_BUCKET:-}"  # Tùy chọn: upload lên S3
LOG_FILE="/var/log/pg_backup.log"

# === HÀM TIỆN ÍCH ===
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

notify_telegram() {
    local msg="$1"
    if [[ -n "${TELEGRAM_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "text=${msg}" > /dev/null
    fi
}

# === BACKUP ===
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${DATE}"
mkdir -p "$BACKUP_PATH"

log "=== BẮT ĐẦU BACKUP POSTGRESQL ==="

# Lấy danh sách databases
if [[ "$DB_NAMES" == "all" ]]; then
    DATABASES=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -t -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres';")
else
    DATABASES="$DB_NAMES"
fi

FAILED=0
SUCCESS=0

for DB in $DATABASES; do
    DB=$(echo "$DB" | tr -d '[:space:]')
    [[ -z "$DB" ]] && continue

    log "Backup database: $DB"
    OUTFILE="${BACKUP_PATH}/${DB}_${DATE}.dump"

    if PGPASSWORD="$DB_PASS" pg_dump \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -Fc --compress=9 \
        "$DB" > "$OUTFILE" 2>> "$LOG_FILE"; then
        
        SIZE=$(du -sh "$OUTFILE" | cut -f1)
        log "✅ $DB backup thành công: $OUTFILE ($SIZE)"
        ((SUCCESS++))
    else
        log "❌ $DB backup THẤT BẠI"
        ((FAILED++))
    fi
done

# === CLEANUP ===
log "Xóa backup cũ hơn ${RETENTION_DAYS} ngày..."
find "$BACKUP_DIR" -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true

# === UPLOAD S3 (tùy chọn) ===
if [[ -n "$S3_BUCKET" ]]; then
    log "Upload lên S3: s3://${S3_BUCKET}/postgresql/${DATE}/"
    aws s3 sync "$BACKUP_PATH" "s3://${S3_BUCKET}/postgresql/${DATE}/" \
        --storage-class STANDARD_IA
fi

# === BÁO CÁO ===
SUMMARY="🗄️ PostgreSQL Backup\n✅ Thành công: ${SUCCESS}\n❌ Thất bại: ${FAILED}\n📅 $(date)"
log "=== KẾT THÚC: Success=${SUCCESS}, Failed=${FAILED} ==="

if [[ $FAILED -gt 0 ]]; then
    notify_telegram "⚠️ BACKUP THẤT BẠI!\n${SUMMARY}"
    exit 1
else
    notify_telegram "✅ Backup hoàn thành!\n${SUMMARY}"
fi
```

**Cron Job Setup:**
```bash
# Chỉnh sửa crontab
crontab -e

# Thêm các jobs:
# Backup hàng ngày lúc 2:00 AM
0 2 * * * /opt/scripts/pg_backup.sh >> /var/log/pg_backup_cron.log 2>&1

# Backup trước khi deploy (chạy thủ công)
# /opt/scripts/pg_backup.sh

# Test restore hàng tuần (Chủ Nhật 3:00 AM)
0 3 * * 0 /opt/scripts/pg_restore_test.sh >> /var/log/pg_restore_test.log 2>&1
```

---

## J6 — HTTPS Website Với Nginx & Let's Encrypt

### 📋 Step-by-Step

```bash
# 1. Cài đặt Nginx và Certbot
apt update && apt install -y nginx certbot python3-certbot-nginx

# 2. Cấu hình Nginx ban đầu (HTTP)
cat > /etc/nginx/sites-available/myapp << 'EOF'
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    root /var/www/myapp;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 3. Lấy SSL certificate
certbot --nginx -d your-domain.com -d www.your-domain.com \
    --non-interactive --agree-tos --email admin@your-domain.com

# 4. Kiểm tra auto-renewal
certbot renew --dry-run

# 5. Crontab auto-renew
echo "0 12 * * * root certbot renew --quiet && systemctl reload nginx" \
    > /etc/cron.d/certbot
```

**Cấu hình Nginx sau khi có HTTPS:**
```nginx
# /etc/nginx/sites-available/myapp (sau certbot tự cập nhật)
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

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy no-referrer-when-downgrade;

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📊 Bảng Đánh Giá Cấp 1

| Kỹ năng | Chưa làm | Đang học | Thành thạo |
|---------|----------|----------|------------|
| Docker & Compose | ⬜ | ⬜ | ⬜ |
| Nginx reverse proxy | ⬜ | ⬜ | ⬜ |
| GitHub Actions CI/CD | ⬜ | ⬜ | ⬜ |
| Prometheus + Grafana | ⬜ | ⬜ | ⬜ |
| ELK Stack | ⬜ | ⬜ | ⬜ |
| Bash scripting | ⬜ | ⬜ | ⬜ |
| SSL/TLS với Certbot | ⬜ | ⬜ | ⬜ |

