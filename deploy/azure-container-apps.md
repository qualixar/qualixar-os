# Deploy Qualixar OS to Azure Container Apps

## Prerequisites

- Azure CLI (`az`) installed and logged in
- Docker installed (for building the image)
- An Azure Container Registry (ACR) or Docker Hub account

## Step 1: Build and Push Image

```bash
# Login to Azure
az login

# Create a resource group (if needed)
az group create --name rg-qos --location eastus

# Create Azure Container Registry
az acr create --resource-group rg-qos --name qosacr --sku Basic
az acr login --name qosacr

# Build and push
docker build -t qosacr.azurecr.io/qualixar-os:latest .
docker push qosacr.azurecr.io/qualixar-os:latest
```

## Step 2: Create Container Apps Environment

```bash
az containerapp env create \
  --name qualixar-os-env \
  --resource-group rg-qos \
  --location eastus
```

## Step 3: Deploy the Container App

```bash
az containerapp create \
  --name qualixar-os \
  --resource-group rg-qos \
  --environment qos-env \
  --image qosacr.azurecr.io/qualixar-os:latest \
  --registry-server qosacr.azurecr.io \
  --target-port 3000 \
  --ingress external \
  --cpu 1.0 \
  --memory 2.0Gi \
  --min-replicas 1 \
  --max-replicas 5 \
  --env-vars \
    ANTHROPIC_API_KEY=secretref:anthropic-key \
    QOS_MODE=companion \
    QOS_HTTP_PORT=3000 \
    NODE_ENV=production
```

## Step 4: Configure Secrets

```bash
az containerapp secret set \
  --name qualixar-os \
  --resource-group rg-qos \
  --secrets anthropic-key=<your-api-key>
```

## Step 5: Custom Domain + TLS

```bash
# Add custom domain
az containerapp hostname add \
  --name qualixar-os \
  --resource-group rg-qos \
  --hostname qos.yourdomain.com

# Bind managed certificate (auto-TLS)
az containerapp hostname bind \
  --name qualixar-os \
  --resource-group rg-qos \
  --hostname qos.yourdomain.com \
  --environment qos-env \
  --validation-method CNAME
```

## Step 6: Scaling Configuration

```bash
# Scale based on HTTP concurrent requests
az containerapp update \
  --name qualixar-os \
  --resource-group rg-qos \
  --min-replicas 1 \
  --max-replicas 10 \
  --scale-rule-name http-scaling \
  --scale-rule-type http \
  --scale-rule-http-concurrency 50
```

## Monitoring

```bash
# View logs
az containerapp logs show --name qualixar-os --resource-group rg-qos --follow

# Check revision status
az containerapp revision list --name qualixar-os --resource-group rg-qos -o table
```
