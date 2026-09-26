# SystemDNA Engine  EC2 Deployment Guide

> **Ground truth:** This guide is written against the **actual files in this repo**.
> Every command references a file that exists. Nothing is invented.
>
> **What is real today (per `systemdna/STATUS.md`):**
> - Frontend (Next.js) + TypeScript scanner (`ts-scan.mjs`)  fully working on `master`
> - FastAPI server stub (`server/app.py`) + Docker Compose (`docker-compose.yml`)  exists on `arnav/agent-engine`
> - Bob integration, orchestrator, Python scanners, AWS infra  **not yet built**
>
> This guide covers what you do **right now** to get the engine running on EC2,
> and flags clearly what still needs to be built before the demo.

---

## Reality Check Before You Start

| Component | Status | Blocker if missing |
|---|---|---|
| `systemdna/engine/docker-compose.yml` | EXISTS |  |
| `systemdna/engine/Dockerfile` | EXISTS |  |
| `systemdna/engine/requirements.txt` | EXISTS |  |
| `systemdna/engine/server/app.py` | EXISTS |  |
| `systemdna/engine/deploy/bootstrap.sh` | EXISTS |  |
| `systemdna/engine/deploy/deploy.sh` | EXISTS |  |
| `systemdna/engine/hooks/permit_check.py` | EXISTS |  |
| `systemdna/engine/hooks/report.py` | EXISTS |  |
| Python scanners (python_scan, sql_scan) | NOT BUILT | Graph will be empty |
| Orchestrator | NOT BUILT | Agent waves won't run |
| Bob modes + Skill | NOT BUILT | Bob IDE can't drive changes |
| AWS infra (VPC, ALB, S3, DynamoDB) | NOT BUILT | No public URL |

**Minimum viable demo path (28 hours):**
You can deploy the API + Neo4j + Redis + Chroma stack to EC2 and point the existing
frontend at it TODAY. The frontend switches from demo mode to live mode automatically
when `NEXT_PUBLIC_API_URL` is set. Build scanners + orchestrator while the infra runs.

---

## Phase 0  Prerequisites (your laptop, 30 minutes)

### 0.1 Tools you need

```bash
# Check all of these exist before touching AWS
aws --version          # AWS CLI v2
docker --version       # Docker Desktop or Docker Engine
docker compose version # Compose v2 (ships with Docker Desktop)
git --version
ssh -V
node --version         # For the frontend build (Node 18+)
```

### 0.2 Secrets you need in hand

| Secret | Where to get it | Used by |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com | AG2 Cartographer, Fixer, Inspector agents |
| `GITHUB_TOKEN` | GitHub  Settings  Developer settings  Fine-grained tokens  Contents + PRs: Read/write | PR creation |
| `DEMO_TOKEN` | Make any strong random string (e.g. `sysdt-demo-2026`) | Protect write endpoints |
| AWS account + region | Your AWS console | Everything |
| EC2 key pair `.pem` | AWS Console  EC2  Key Pairs  Create | SSH access |

### 0.3 Create your `.env` file now (never commit this)

```bash
# Copy the template that already exists in the repo
cp systemdna/engine/.env.example systemdna/engine/.env   # if .env.example exists
# OR create it manually:
cat > systemdna/engine/.env << 'EOF'
GEMINI_API_KEY=your-gemini-key-here
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=pick-a-strong-password
CHROMA_HOST=chroma
REDIS_URL=redis://redis:6379
REPO_WORKSPACE=/workspace/shopflow
GITHUB_TOKEN=ghp_your-github-token
DEMO_TOKEN=sysdt-demo-2026
USE_DYNAMO=0
DYNAMO_TABLE=systemdna-events
S3_BUCKET=systemdna-artifacts
MAX_WORKERS=3
EOF
```

> **Why `USE_DYNAMO=0` for now?** DynamoDB is not provisioned yet. The server falls
> back to SQLite automatically when `USE_DYNAMO=0`. Switch to `1` after CP2 sets up
> the DynamoDB table.

Confirm `.env` is ignored by git:
```bash
git check-ignore -v systemdna/engine/.env
# Must print: .gitignore:... systemdna/engine/.env
```

---

## Phase 1  Provision the EC2 Instance (AWS Console or CLI)

### 1.1 Launch the instance

```bash
# Using AWS CLI (adjust region and key pair name):
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \  # Ubuntu 22.04 LTS us-east-1
  --instance-type t3.xlarge \
  --key-name your-key-pair-name \
  --security-group-ids sg-XXXXXXXX \
  --subnet-id subnet-XXXXXXXX \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
  --iam-instance-profile Name=systemdna-ec2-role \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=systemdna-engine}]'
```

**Instance spec (from `engine/PLAN.md`):**
- Type: `t3.xlarge` (4 vCPU, 16 GB RAM)
- OS: Ubuntu 22.04 LTS
- EBS: 50 GB gp3 (Docker images + repo workspace)
- Subnet: private (behind ALB) or public temporarily for initial setup
- Security group inbound: port 22 from your IP, ports 8080 + 3000 from ALB only

### 1.2 Minimum IAM role for the EC2 instance

Create a role named `systemdna-ec2-role` with these permissions and attach it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:ListBucket"],
     "Resource":["arn:aws:s3:::YOUR-BUCKET","arn:aws:s3:::YOUR-BUCKET/*"]},
    {"Effect":"Allow","Action":["dynamodb:PutItem","dynamodb:Query","dynamodb:GetItem"],
     "Resource":"arn:aws:dynamodb:REGION:ACCOUNT:table/systemdna-events"},
    {"Effect":"Allow","Action":"secretsmanager:GetSecretValue",
     "Resource":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:systemdna/*"},
    {"Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents"],
     "Resource":"*"},
    {"Effect":"Allow","Action":["ecr:GetAuthorizationToken","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],
     "Resource":"*"}
  ]
}
```

> **No access keys on disk.** The IAM role gives the EC2 instance permission
> automatically. Never run `aws configure` on the EC2 host.

---

## Phase 2  Run bootstrap.sh on the EC2 Host

### 2.1 SSH in and run the existing bootstrap script

```bash
# From your laptop:
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>

# On the EC2 host  run bootstrap.sh from the repo:
# The script (deploy/bootstrap.sh) does:
#   1. apt-get install docker.io docker-compose-plugin
#   2. systemctl enable + start docker
#   3. curl https://install.bob.ai/shell | bash   (Bob Shell)
#   4. git clone the repo to /app
#   5. Prints reminder to place .env

sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/pujarachchh-intuitive/AIGarage/arnav/agent-engine/systemdna/engine/deploy/bootstrap.sh)"
```

After bootstrap, verify:
```bash
docker --version          # Docker 24+
docker compose version    # v2
bob --version             # IBM Bob Shell (must be installed and signed in)
ls /app/systemdna/engine  # repo cloned
```

### 2.2 Sign Bob Shell into IBM (do this once on EC2)

```bash
cd /app
bob login
# Follow the interactive sign-in. Once signed in, test:
echo "hello" | bob -p "just say hi back" --max-turns 1
```

> **This is the hour-0 risk test from TEAM_PLAN.md.**
> If `bob -p` cannot run without a person present, fall back:
> AG2 Fixer agents replace `bob -p` workers (already supported in `orchestrator.py`).

---

## Phase 3  Copy Secrets to EC2

**From your laptop**  copy the `.env` file you created in Phase 0:

```bash
scp -i your-key.pem \
  systemdna/engine/.env \
  ubuntu@<EC2-IP>:/app/systemdna/engine/.env
```

Verify it is in place on EC2:
```bash
ssh -i your-key.pem ubuntu@<EC2-IP> \
  "head -3 /app/systemdna/engine/.env && echo OK"
# Should print the first 3 lines (without values if you want) and OK
```

> **Also store secrets in AWS Secrets Manager** for production access
> (containers will pull from there when `USE_DYNAMO=1`):
> ```bash
> aws secretsmanager create-secret --name systemdna/gemini \
>   --secret-string "{\"GEMINI_API_KEY\":\"$GEMINI_API_KEY\"}"
> aws secretsmanager create-secret --name systemdna/github \
>   --secret-string "{\"GITHUB_TOKEN\":\"$GITHUB_TOKEN\"}"
> aws secretsmanager create-secret --name systemdna/demo \
>   --secret-string "{\"DEMO_TOKEN\":\"$DEMO_TOKEN\"}"
> ```

---

## Phase 4  Start All 6 Docker Containers

The `docker-compose.yml` that exists in `systemdna/engine/` defines 6 services:

| Service | Image | Port | Role |
|---|---|---|---|
| `neo4j` | `neo4j:5` | 7474, 7687 | Knowledge graph store |
| `chroma` | `chromadb/chroma:latest` | 8000 | Vector store for semantic search |
| `redis` | `redis:7-alpine` | 6379 | LangGraph checkpoint store |
| `engine` | Built from `Dockerfile` | internal | Scanners + agent workload |
| `api` | Built from `Dockerfile` | **8080** | FastAPI REST + WebSocket |
| `mcp` | Built from `Dockerfile` | **3000** | FastMCP tools for Bob IDE |

```bash
# On the EC2 host:
cd /app/systemdna/engine

# Build and start everything
docker compose up -d --build

# Watch startup (Neo4j takes ~30s on first run)
docker compose logs -f --tail=50
```

### 4.1 Verify all containers are healthy

```bash
docker compose ps
```

Expected  all `running` or `healthy`:
```
NAME       STATUS           PORTS
neo4j      healthy          0.0.0.0:7474->7474/tcp, 0.0.0.0:7687->7687/tcp
chroma     healthy          0.0.0.0:8000->8000/tcp
redis      running          0.0.0.0:6379->6379/tcp
engine     running
api        healthy          0.0.0.0:8080->8080/tcp
mcp        running          0.0.0.0:3000->3000/tcp
```

If anything is unhealthy:
```bash
docker compose logs <service-name>   # see the error
docker compose restart <service-name>
```

---

## Phase 5  Smoke Tests (verify API is alive)

Run these from the EC2 host itself first, then from your laptop after the ALB is up.

```bash
# Test 1  API health
curl -s http://localhost:8080/health
# Expected: {"status":"ok"}

# Test 2  Graph endpoint (empty graph is fine at this stage)
curl -s http://localhost:8080/graph | python3 -m json.tool | head -20
# Expected: valid JSON with nodes:[] and edges:[] until scanners are built

# Test 3  Impact analysis (uses the real ImpactEngine once scanners produce a graph)
curl -s -X POST http://localhost:8080/changes \
  -H "Authorization: Bearer sysdt-demo-2026" \
  -H "Content-Type: application/json" \
  -d '{"node":"db:column:orders.cust_id","change":"rename","to":"customer_id"}' \
  | python3 -m json.tool
# Expected: {"change_id":"chg-...","report":{...}}

# Test 4  WebSocket (keep-alive ping test)
# Install wscat: npm install -g wscat
wscat -c ws://localhost:8080/ws
# Should connect. Type anything, connection stays open.

# Test 5  MCP health
curl -s http://localhost:3000/health
# Expected: {"status":"ok"} or similar
```

---

## Phase 6  Set Up ShopFlow on EC2

ShopFlow is the sample repo that the demo runs against. Until FDE2 builds the real
ShopFlow, use the test fixtures:

```bash
# Option A: if real ShopFlow exists
git clone https://github.com/your-org/shopflow.git /workspace/shopflow

# Option B: copy synthetic fixtures from the engine tests
cp -r /app/systemdna/engine/tests/fixtures/shopflow /workspace/shopflow

# Set the workspace path in .env (already set if you used the template above)
grep REPO_WORKSPACE /app/systemdna/engine/.env
# Should show: REPO_WORKSPACE=/workspace/shopflow
```

---

## Phase 7  Build the AWS Network (CP1  Hours 110)

> **This phase needs to happen in parallel with Phases 16.**
> CP1 owns this. The engine team can use a direct EC2 IP temporarily.

### 7.1 What to build

```
AWS Region (e.g. us-east-1)

 VPC: 10.0.0.0/16
    Public Subnet A (10.0.1.0/24)  ALB node 1
    Public Subnet B (10.0.2.0/24)  ALB node 2
    Private Subnet  (10.0.3.0/24)  EC2 engine host

 Application Load Balancer (ALB)
    ACM Certificate (HTTPS :443)
        /api/*      EC2:8080 (FastAPI)
        /ws         EC2:8080 (WebSocket  set idle timeout to 3600s)
        /mcp/*      EC2:3000 (FastMCP)
        /events     EC2:8080
        /*          CloudFront (dashboard)

 S3 Bucket: systemdna-dashboard   (CloudFront origin, static site)
 S3 Bucket: systemdna-artifacts   (graph.json, replays, reports  versioning ON)
 CloudFront Distribution          (HTTPS for dashboard)
 DynamoDB Table: systemdna-events (key: change_id, sort: ts, on-demand)
 Secrets Manager                  (systemdna/gemini, systemdna/github, systemdna/demo)
 CloudWatch Log Groups            (one per container: /systemdna/api, /systemdna/mcp, etc.)
 AWS Budgets Alert                (CREATE THIS FIRST  at $20 threshold)
 ECR Repository: systemdna-engine (Docker images)
```

### 7.2 Critical ALB WebSocket setting

The default ALB idle timeout is 60 seconds. A Bob agent run can last minutes.
**Set it to 3600 seconds or WebSocket will drop mid-run.**

```bash
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --attributes Key=idle_timeout.timeout_seconds,Value=3600
```

---

## Phase 8  Deploy the Frontend to S3 + CloudFront

The frontend lives in `systemdna/web/` on `master`. It switches from demo to live
mode automatically when `NEXT_PUBLIC_API_URL` is set.

```bash
# On your laptop, from the master branch:
cd systemdna/web

# Point the frontend at your EC2 API (or ALB URL once it's up)
echo "NEXT_PUBLIC_API_URL=https://your-alb-domain.com" > .env.local

# Build static files
npm install
npm run build
# Output goes to: out/

# Upload to S3
aws s3 sync out/ s3://systemdna-dashboard/ --delete

# Invalidate CloudFront cache so new files are served immediately
aws cloudfront create-invalidation \
  --distribution-id YOUR_CLOUDFRONT_ID \
  --paths "/*"
```

---

## Phase 9  CI/CD Pipeline (CP1  Hours 1014)

The `.github/workflows/` directory needs these jobs. Build them in this order:

### 9.1 Secret scan (build this FIRST  IBM disables accounts that leak keys)

```yaml
# .github/workflows/secret-scan.yml
- name: Run gitleaks
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 9.2 Test + build + push to ECR

```bash
# The deploy.sh script already exists: systemdna/engine/deploy/deploy.sh
# It does:
#   1. docker build -t $IMAGE .
#   2. aws ecr get-login-password | docker login
#   3. docker push $IMAGE
#   4. ssh ec2-user@$EC2_HOST "cd /app/systemdna/engine && docker compose pull && docker compose up -d"

# Set these in GitHub Actions secrets:
#   AWS_REGION, ECR_REPO, EC2_HOST, EC2_SSH_KEY
```

### 9.3 One-command deploy from your laptop

```bash
# Add these to the root Makefile (create it if it doesn't exist):
make deploy    # runs deploy.sh
make teardown  # removes all AWS resources after judging
```

---

## Phase 10  Connect `NEXT_PUBLIC_API_URL` and Verify Live Mode

Once the ALB is up and the API is healthy:

```bash
# In systemdna/web/.env.local (on your laptop):
NEXT_PUBLIC_API_URL=https://your-alb-domain.com

# Rebuild and upload:
npm run build && aws s3 sync out/ s3://systemdna-dashboard/ --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

Open the dashboard in a browser. The `STATUS.md` says the frontend switches from
`lib/simulator.ts` (demo mode) to live WebSocket mode when `NEXT_PUBLIC_API_URL` is
set and `change.mode === "live"`  which the API already sets in `server/app.py`.

---

## Phase 11  Full End-to-End Verification Checklist

Run this before the demo. Every line must pass.

```bash
# 1. All containers healthy
docker compose ps   # all "running" or "healthy"

# 2. API responds
curl -s http://<EC2-IP>:8080/health   # {"status":"ok"}

# 3. Graph has nodes (needs scanners to be built first)
curl -s http://<EC2-IP>:8080/graph | python3 -c "
import json,sys; g=json.load(sys.stdin)
print(f\"nodes: {len(g.get('nodes',[]))}, edges: {len(g.get('edges',[]))}\")"
# Target: nodes >= 30

# 4. Impact runs in under 1 second
time curl -s -X POST http://<EC2-IP>:8080/changes \
  -H "Authorization: Bearer sysdt-demo-2026" \
  -H "Content-Type: application/json" \
  -d '{"node":"db:column:orders.cust_id","change":"rename","to":"customer_id"}'
# Target: real < 1s, 17+ affected nodes in response

# 5. WebSocket streams events live
wscat -c ws://<EC2-IP>:8080/ws &
curl -s -X POST http://<EC2-IP>:8080/events \
  -H "Authorization: Bearer sysdt-demo-2026" \
  -H "Content-Type: application/json" \
  -d '{"ts":"2026-09-27T10:00:00Z","change_id":"chg-test","event":"tool_call","detail":"test"}'
# Target: wscat terminal shows the event JSON within 100ms

# 6. Bob hooks fire (needs Bob Shell installed)
echo '{"event":"PreToolUse","tool":"write_to_file","tool_input":{"path":"transforms/stg_orders.sql"}}' \
  | SYSTEMDNA_AGENT_ID=fix-test python systemdna/engine/hooks/permit_check.py
# Expected: exits 0 (or 2 if file not in permit  that means the hook works)

# 7. Out-of-permit edit is blocked
echo '{"event":"PreToolUse","tool":"write_to_file","tool_input":{"path":"backend/routes.py"}}' \
  | SYSTEMDNA_AGENT_ID=fix-stg-orders python systemdna/engine/hooks/permit_check.py
echo $?   # Must be 2  BLOCKED

# 8. Re-scan shows 0 dangling refs (after all waves complete)
curl -s http://<EC2-IP>:8080/changes/<change_id>/diff
# Target: {"before": N, "after": 0}

# 9. Dashboard shows live data
# Open browser  https://your-cloudfront-domain
# Agent City map must show real nodes (not the simulator)
# KPI tile must show "Dangling references: 0" at end of run
```

---

## Phase 12  Tear Down After Judging

```bash
# Stop containers on EC2
ssh -i your-key.pem ubuntu@<EC2-IP> \
  "cd /app/systemdna/engine && docker compose down -v"

# Remove all AWS resources (add this to Makefile as 'make teardown'):
aws cloudformation delete-stack --stack-name systemdna
# OR if using CDK:
cd systemdna/infra && cdk destroy --all

# Verify nothing is left running (to avoid surprise bills):
aws ec2 describe-instances --filters "Name=tag:Name,Values=systemdna-engine" \
  --query "Reservations[].Instances[].State.Name"
aws s3 ls | grep systemdna
aws dynamodb list-tables | grep systemdna
```

---

## Ports Reference

| Service | Port | Accessible from |
|---|---|---|
| FastAPI (REST + WS) | 8080 | ALB  public; EC2 internal |
| FastMCP | 3000 | ALB  public; EC2 internal |
| Neo4j browser | 7474 | EC2 internal only (never expose publicly) |
| Neo4j bolt | 7687 | EC2 internal only |
| ChromaDB | 8000 | EC2 internal only |
| Redis | 6379 | EC2 internal only |

---

## What Still Needs to Be Built Before the Demo

| Missing piece | Who builds it | Blocker? |
|---|---|---|
| Python scanner (`python_scan.py`) | FDE1 | Graph is empty without it |
| SQL scanner (`sql_scan.py`) | FDE1 | Alias trap won't be caught |
| Cross-layer linker (`linker.py`) | FDE1 | Cross-language edges missing |
| AG2 Cartographers (`cartographers.py`) | FDE3 | Dynamic SQL trap missed |
| Orchestrator waves (`orchestrator.py`) | FDE2 | Agent run is simulated |
| Bob custom modes (`.bob/modes/`) | FDE3 | Bob IDE can't drive changes |
| `propagate-rename` Skill | FDE3 | Fixer agents have no recipes |
| AWS infra (VPC, ALB, S3, DynamoDB) | CP1, CP2 | No public URL |
| ShopFlow sample repo | FDE2 | Scanner has nothing to scan |

> Until the Python scanners exist, the API returns an empty graph.
> The frontend will render a city with zero buildings.
> **Build ShopFlow fixtures + scanners before running the full smoke test.**

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `neo4j` container unhealthy | Slow startup (normal) | Wait 60s, then `docker compose restart neo4j` |
| `api` container exits immediately | Missing `.env` or wrong Neo4j password | Check `docker compose logs api`; fix `.env` |
| WebSocket disconnects after 60s | ALB idle timeout too low | Set ALB idle timeout to 3600s |
| `bob -p` hangs | Bob Shell not signed in | Run `bob login` on the EC2 host |
| `permit_check.py` exits 0 for everything | No permit file found | Orchestrator must write `.systemdna/permits/<agent_id>.json` first |
| Graph returns 0 nodes | Scanners not built yet | Expected  build FDE1's scanners |
| Frontend shows simulated data | `NEXT_PUBLIC_API_URL` not set | Set it in `systemdna/web/.env.local` and rebuild |
| Deploy fails: ECR login error | Wrong region or ECR_REPO var | Check `AWS_REGION` and `ECR_REPO` in `deploy.sh` |
