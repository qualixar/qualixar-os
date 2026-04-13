# Deploy Qualixar OS to Railway

## Prerequisites

- Railway CLI installed: `npm install -g @railway/cli`
- Logged in: `railway login`

## Step 1: Initialize Project

```bash
railway init
```

Select "Empty Project" when prompted.

## Step 2: Link to Repository

```bash
railway link
```

## Step 3: Set Environment Variables

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set NODE_ENV=production
railway variables set QOS_HTTP_PORT=3000
railway variables set QOS_MODE=companion
```

## Step 4: Deploy

```bash
railway up
```

Railway auto-detects the Dockerfile and builds from it.

## Step 5: Expose to the Internet

```bash
# Generate a public domain
railway domain
```

## Persistent Storage

Railway provides ephemeral storage by default. For persistent SQLite data, attach a volume:

1. Go to your project in the Railway dashboard
2. Click your service
3. Go to Settings > Volumes
4. Add a volume mounted at `/home/qos/.qualixar-os`

## Health Check

Railway auto-detects the `HEALTHCHECK` in the Dockerfile. The `/api/health` endpoint will be polled automatically.

## Useful Commands

```bash
# View logs
railway logs

# Open dashboard
railway open

# Restart service
railway service restart
```
