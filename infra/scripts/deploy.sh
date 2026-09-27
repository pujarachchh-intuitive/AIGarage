#!/usr/bin/env bash
# Build the SystemDNA image, push it to ECR, and roll it out on ECS.
#
#   infra/scripts/deploy.sh            # tag = current git SHA
#   IMAGE_TAG=v1 infra/scripts/deploy.sh
#
# Needs: AWS credentials, docker, terraform, and `terraform apply` run once already.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"

tf_out() { terraform -chdir="$TF_DIR" output -raw "$1"; }

REGION="$(terraform -chdir="$TF_DIR" console <<<'var.region' | tr -d '"')"
REPO_URL="$(tf_out ecr_repository_url)"
REGISTRY="${REPO_URL%%/*}"
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"

if [[ -n "$(git -C "$ROOT" status --porcelain -- systemdna/web systemdna/core)" ]]; then
  echo "warning: uncommitted changes in systemdna/web or systemdna/core are included in this image" >&2
fi

echo "==> Logging in to $REGISTRY"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> Building $REPO_URL:$TAG (linux/amd64)"
docker build --platform linux/amd64 -t "$REPO_URL:$TAG" -f "$ROOT/systemdna/Dockerfile" "$ROOT/systemdna"

echo "==> Pushing"
# Large layers over a slow link can time out; layers already uploaded are skipped on retry.
for attempt in 1 2 3 4; do
  docker push "$REPO_URL:$TAG" && break
  [[ $attempt -eq 4 ]] && { echo "push failed after $attempt attempts" >&2; exit 1; }
  echo "push failed (attempt $attempt), retrying in 10s..." >&2
  sleep 10
done

echo "==> Rolling out"
# Remember the deployed tag, so a plain `terraform apply` later keeps running this image
# instead of falling back to the default tag. (*.tfvars is git-ignored.)
printf 'image_tag = "%s"\n' "$TAG" > "$TF_DIR/image.auto.tfvars"
terraform -chdir="$TF_DIR" apply -auto-approve
aws ecs wait services-stable --region "$REGION" --cluster "$(tf_out ecs_cluster)" --services "$(tf_out ecs_service)"

echo "==> Live at $(tf_out app_url)"
