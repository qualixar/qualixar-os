# Deploy Qualixar OS to Fly.io

## Prerequisites

- Fly CLI installed: `curl -L https://fly.io/install.sh | sh`
- Logged in: `fly auth login`

## Step 1: Launch

```bash
fly launch --name qualixar-os --region iad --no-deploy
```

## Step 2: Configure fly.toml

Create or update `fly.toml` in the project root:

```toml
app = "qualixar-os"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  QOS_HTTP_PORT = "3000"
  QOS_MODE = "companion"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = 30000
    timeout = 5000
    path = "/api/health"
    method = "GET"

[mounts]
  source = "qos_data"
  destination = "/home/qos/.qualixar-os"
```

## Step 3: Set Secrets

```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly secrets set QOS_API_KEY=your-bearer-token
```

## Step 4: Create Volume

```bash
fly volumes create qos_data --region iad --size 1
```

## Step 5: Deploy

```bash
fly deploy
```

## Useful Commands

```bash
# Check status
fly status

# View logs
fly logs

# SSH into container
fly ssh console

# Scale up
fly scale count 2
```
