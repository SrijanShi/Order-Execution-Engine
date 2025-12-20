# Kubernetes Deployment Guide

Production-grade Kubernetes deployment for DEX Order Engine.

## Quick Start

```bash
# Create namespace
kubectl create namespace dex-engine

# Apply configurations
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/api.yaml
kubectl apply -f k8s/ingress.yaml

# Verify deployment
kubectl get pods -n dex-engine
kubectl get services -n dex-engine
```

## Namespace Configuration

**File: k8s/namespace.yaml**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: dex-engine
  labels:
    name: dex-engine
    environment: production
```

## ConfigMap (Non-secret Environment Variables)

**File: k8s/configmap.yaml**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: dex-engine-config
  namespace: dex-engine
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  SLIPPAGE_TOLERANCE: "0.5"
  MAX_RETRIES: "3"
  QUEUE_CONCURRENCY: "5"
  CACHE_TTL: "3600"
  WEBSOCKET_ENABLED: "true"
  DATABASE_HOST: "postgres"
  DATABASE_PORT: "5432"
  DATABASE_NAME: "dex_order_engine"
  REDIS_HOST: "redis"
  REDIS_PORT: "6379"
```

## Secrets (Sensitive Data)

**File: k8s/secrets.yaml**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: dex-engine-secrets
  namespace: dex-engine
type: Opaque
stringData:
  DATABASE_USER: "postgres"
  DATABASE_PASSWORD: "secure_password_here"
  REDIS_PASSWORD: "redis_password_here"
  DATABASE_URL: "postgresql://postgres:password@postgres:5432/dex_order_engine"
  REDIS_URL: "redis://:password@redis:6379"
```

**Generate with base64:**

```bash
# Instead of stringData, use data with base64 values
echo -n "postgres" | base64  # => cG9zdGdyZXM=
echo -n "password" | base64  # => cGFzc3dvcmQ=
```

## PostgreSQL Deployment

**File: k8s/postgres.yaml**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: dex-engine
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 10Gi

---

apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: dex-engine
  labels:
    app: postgres
spec:
  ports:
    - port: 5432
      targetPort: 5432
  clusterIP: None
  selector:
    app: postgres

---

apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: dex-engine
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: dex-engine-secrets
              key: DATABASE_USER
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: dex-engine-secrets
              key: DATABASE_PASSWORD
        - name: POSTGRES_DB
          valueFrom:
            configMapKeyRef:
              name: dex-engine-config
              key: DATABASE_NAME
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        - name: init-scripts
          mountPath: /docker-entrypoint-initdb.d
        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U $(POSTGRES_USER)
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U $(POSTGRES_USER)
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
      - name: init-scripts
        configMap:
          name: postgres-init
```

## Redis Deployment

**File: k8s/redis.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: dex-engine
  labels:
    app: redis
spec:
  ports:
    - port: 6379
      targetPort: 6379
  clusterIP: None
  selector:
    app: redis

---

apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: dex-engine
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command:
          - redis-server
          - "--requirepass"
          - "$(REDIS_PASSWORD)"
          - "--appendonly"
          - "yes"
        ports:
        - containerPort: 6379
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: dex-engine-secrets
              key: REDIS_PASSWORD
        volumeMounts:
        - name: redis-data
          mountPath: /data
        livenessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 15
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
      volumes:
      - name: redis-data
        emptyDir: {}
```

## API Deployment

**File: k8s/api.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dex-engine-api
  namespace: dex-engine
  labels:
    app: dex-engine-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: dex-engine-api
  template:
    metadata:
      labels:
        app: dex-engine-api
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - dex-engine-api
              topologyKey: kubernetes.io/hostname
      containers:
      - name: api
        image: dex-order-engine:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        envFrom:
        - configMapRef:
            name: dex-engine-config
        - secretRef:
            name: dex-engine-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 15"]

---

apiVersion: v1
kind: Service
metadata:
  name: dex-engine-api
  namespace: dex-engine
  labels:
    app: dex-engine-api
spec:
  type: ClusterIP
  selector:
    app: dex-engine-api
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
```

## Ingress Configuration

**File: k8s/ingress.yaml**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dex-engine-ingress
  namespace: dex-engine
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: dex-engine-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: dex-engine-api
            port:
              number: 80
```

## Database Initialization ConfigMap

**File: k8s/configmap-init.yaml**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init
  namespace: dex-engine
data:
  001_init_schema.sql: |
    -- Copy content from src/persistence/migration/001_init_schema.sql
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR(255) UNIQUE NOT NULL,
      token_in VARCHAR(100) NOT NULL,
      token_out VARCHAR(100) NOT NULL,
      amount_in DECIMAL(20,8) NOT NULL,
      slippage DECIMAL(5,4) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      executed_at TIMESTAMP,
      confirmed_at TIMESTAMP
    );

    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_orders_created_at ON orders(created_at);
```

## Horizontal Pod Autoscaling

**File: k8s/hpa.yaml**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: dex-engine-api-hpa
  namespace: dex-engine
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: dex-engine-api
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
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

## Monitoring & Observability

**File: k8s/monitoring.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: dex-engine-metrics
  namespace: dex-engine
  labels:
    app: dex-engine-api
spec:
  selector:
    app: dex-engine-api
  ports:
  - port: 9090
    targetPort: 3000
    name: metrics

---

apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: dex-engine
  namespace: dex-engine
spec:
  selector:
    matchLabels:
      app: dex-engine-api
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

## Network Policies

**File: k8s/network-policy.yaml**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: dex-engine-network-policy
  namespace: dex-engine
spec:
  podSelector:
    matchLabels:
      app: dex-engine-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

## Deployment Commands

```bash
# Create deployment structure
mkdir -p k8s

# Deploy everything
kubectl apply -f k8s/

# Check status
kubectl get all -n dex-engine

# View logs
kubectl logs -n dex-engine -l app=dex-engine-api -f

# Execute database migration
kubectl exec -it <postgres-pod-name> -n dex-engine -- \
  psql -U postgres -d dex_order_engine < src/persistence/migration/001_init_schema.sql

# Port forwarding for local testing
kubectl port-forward -n dex-engine svc/dex-engine-api 3000:80

# Scaling
kubectl scale deployment dex-engine-api -n dex-engine --replicas=5

# Rolling update
kubectl set image deployment/dex-engine-api \
  api=dex-order-engine:v2.0.0 \
  -n dex-engine

# Rollback
kubectl rollout undo deployment/dex-engine-api -n dex-engine

# Delete deployment
kubectl delete namespace dex-engine
```

## Helm Chart (Optional)

For enterprise deployments, consider using Helm:

```bash
# Create Helm chart structure
helm create dex-engine

# Install
helm install dex-engine ./dex-engine -n dex-engine

# Upgrade
helm upgrade dex-engine ./dex-engine -n dex-engine

# Uninstall
helm uninstall dex-engine -n dex-engine
```

## Resource Allocation

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| API (per pod) | 500m | 1000m | 512Mi | 1Gi |
| PostgreSQL | 250m | 500m | 256Mi | 512Mi |
| Redis | 100m | 200m | 128Mi | 256Mi |
| Total (3x API) | 1950m | 3500m | 1408Mi | 2560Mi |

## Production Checklist

- [ ] Cluster setup and configured
- [ ] Persistent volumes available
- [ ] Ingress controller installed
- [ ] TLS certificates configured
- [ ] Resource quotas set
- [ ] Network policies enforced
- [ ] Monitoring deployed
- [ ] Logging centralized
- [ ] Backups automated
- [ ] Disaster recovery tested
- [ ] RBAC configured
- [ ] Pod security policies enforced
- [ ] Health checks configured
- [ ] Scaling policies set
- [ ] Service mesh configured (Istio optional)

---

For simpler deployments, see [DEPLOYMENT.md](DEPLOYMENT.md) for Railway.app and Render.com guides.
