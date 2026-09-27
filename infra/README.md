# SystemDNA on AWS (ECS Fargate + Terraform)

Deploys the working product: the Next.js app in `systemdna/web`, which serves both the
UI and the APIs, together with the TypeScript scanner (`systemdna/core/scanner`), `git`
and IBM Bob Shell, all in one container. The Python engine (`systemdna/engine`) is not
deployed: the web app does not use it, and its scanners and orchestrator are still stubs.

```text
Internet ─► ALB (public subnets, :80 / :443, idle timeout 3600s)
              └─► ECS Fargate service "web" :3000 (private subnets, 2 tasks, autoscale 1–3)
                    ├─ EFS  /data        repos, graphs, run patches (SYSTEMDNA_DATA_DIR)
                    ├─ 50 GiB scratch     fresh clones for scans and change runs
                    ├─ Secrets Manager    systemdna/app-* → BOB_API_KEY, GITHUB_* env vars
                    └─ NAT ─► GitHub (clone, push, PR), IBM Bob API
```

Why these choices:

- **2 tasks, autoscaled 1–3 on CPU (60%).** EFS is shared, so repos, graphs and patches
  are visible from every task. Each change run streams over a single request, so it
  stays on one task, and ALB stickiness keeps each browser on the same task. Limits:
  the two-scans-at-a-time cap applies per task, and connecting two repos at the same
  moment on different tasks can drop one of them from the repo list. Scale-in waits
  15 minutes, because a stopped task cuts off runs still streaming on it.
- **ALB idle timeout of 3600s.** Change runs stream over one HTTP response for up to
  about 10 minutes. A Bob Fixer can be quiet for up to `BOB_TIMEOUT_MS` (4 minutes).
- **EFS** so connected repos and graphs survive restarts and deploys.
- **Secrets** are created with empty placeholders, and you add the real values from
  `infra/.env` with `set-app-env.sh`, so they never end up in Terraform state. Empty values mean "feature
  off": Bob and GitHub show as skipped in the app.

## First deploy

Needs: Terraform 1.6 or later, AWS CLI v2 with credentials, Docker, Node 22 (only used
by `set-app-env.sh`).

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # region, certificate_arn, allowed_cidrs, budget_email
terraform init
terraform apply              # about 5 minutes. The service waits for an image (next step)

cd ../..
infra/scripts/deploy.sh      # build → push to ECR → roll out with the git SHA as the tag

cp infra/.env.example infra/.env   # fill in BOB_API_KEY and GITHUB_TOKEN (git-ignored)
infra/scripts/set-app-env.sh       # writes the secret and restarts the task
```

Open `terraform output app_url`. **Settings** in the app shows whether Bob and GitHub
are ready.

After that, every release is just `infra/scripts/deploy.sh`.

## HTTPS and the GitHub App

The custom domain's DNS is hosted outside Route 53, so this takes two applies:

1. Set `domain_name` in `terraform.tfvars`, then run `terraform apply`. This requests the
   ACM certificate (the site is still HTTP).
2. At your DNS provider, add both records:
   - the one from `terraform output certificate_validation_records` (proves you own the domain)
   - the one from `terraform output domain_cname` (points the domain at the ALB)
3. Once `dig +short CNAME <validation name>` returns the value, set
   `certificate_validated = true` and run `terraform apply`. It waits for ACM to issue the
   certificate (usually a few minutes), then adds the 443 listener and the HTTP→HTTPS redirect.

Afterwards, update the GitHub App's Setup URL to
`https://<domain>/api/github/install/callback`.

## Operating it

```bash
aws logs tail /ecs/systemdna-web --follow
aws ecs execute-command --cluster systemdna --task <task-id> --container web --interactive --command sh
```

The `systemdna-web-unhealthy` CloudWatch alarm fires when no task is healthy. It has
no notification target yet: attach an SNS topic if you want alerts.

## Cost and teardown

Roughly per day, at us-east-1 prices (ap-south-1 is a little higher):

| Item | Cost per day |
| --- | --- |
| Fargate (2 vCPU, 8 GB), per task | ~$2.40 (x2 normally, up to x3) |
| NAT gateway | ~$1.10 plus data |
| ALB | ~$0.55 |
| EFS, logs, ECR, Secrets Manager | small |

Bob usage is billed separately in Bobcoins. To remove everything:

```bash
terraform -chdir=infra/terraform destroy
```

The secret is deleted immediately (its values live in `infra/.env`). Connected repos and
graphs on EFS are lost, though EFS backups stay in AWS Backup until they expire.

To rebuild from scratch:

1. `terraform apply`
2. `infra/scripts/deploy.sh`
3. `infra/scripts/set-app-env.sh`
4. Update the `systemdna-ibm` CNAME, because the new ALB gets a new DNS name. The ACM
   validation CNAME normally stays the same for the same domain and account, so keep it
   in DNS and the certificate re-validates on its own.

## Not included yet

- CI/CD (GitHub Actions running `deploy.sh`)
- Remote Terraform state (see the commented `backend "s3"` block in `versions.tf`)
- WAF
- A custom domain in Route 53
