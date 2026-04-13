# Deploy Qualixar OS to Kubernetes

## Manifests

Apply the following manifests to your cluster. Adjust namespace, image, and resource limits as needed.

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: qos
```

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: qos-secrets
  namespace: qos
type: Opaque
stringData:
  ANTHROPIC_API_KEY: "sk-ant-..."
  QOS_API_KEY: "your-bearer-token"
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: qos-config
  namespace: qos
data:
  NODE_ENV: "production"
  QOS_HTTP_PORT: "3000"
  QOS_MODE: "companion"
  QOS_LOG_LEVEL: "info"
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qos
  namespace: qos
  labels:
    app: qualixar-os
spec:
  replicas: 2
  selector:
    matchLabels:
      app: qualixar-os
  template:
    metadata:
      labels:
        app: qualixar-os
    spec:
      securityContext:
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
        - name: qualixar-os
          image: ghcr.io/qualixar/qualixar-os:latest
          ports:
            - containerPort: 3000
              name: http
            - containerPort: 3333
              name: dashboard
          envFrom:
            - configMapRef:
                name: qos-config
            - secretRef:
                name: qos-secrets
          volumeMounts:
            - name: qos-data
              mountPath: /home/qos/.qualixar-os
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 2Gi
          livenessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /api/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
      volumes:
        - name: qos-data
          persistentVolumeClaim:
            claimName: qos-pvc
```

### PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: qos-pvc
  namespace: qos
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: qos
  namespace: qos
spec:
  selector:
    app: qualixar-os
  ports:
    - name: http
      port: 80
      targetPort: 3000
    - name: dashboard
      port: 3333
      targetPort: 3333
  type: ClusterIP
```

### HorizontalPodAutoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: qos-hpa
  namespace: qos
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: qos
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Apply All

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/pvc.yaml
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml
kubectl apply -f deploy/k8s/hpa.yaml
```

## Verify

```bash
kubectl -n qos get pods
kubectl -n qos logs -f deployment/qualixar-os
kubectl -n qos port-forward svc/qualixar-os 3000:80
curl http://localhost:3000/api/health
```
