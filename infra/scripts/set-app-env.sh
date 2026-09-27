#!/usr/bin/env bash
# Write the app's credentials into Secrets Manager, then restart the service so
# the task picks them up. Values come from infra/.env (copy infra/.env.example),
# or from your shell environment, which wins over the file. They are never passed
# as arguments and never enter Terraform state.
#
#   infra/scripts/set-app-env.sh
#
# Any value left empty is stored empty (that feature shows as "skipped" in the app).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
ENV_FILE="$ROOT/infra/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Load KEY=value lines without overriding variables already exported in the shell.
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    [[ -n "${!key:-}" ]] && continue
    value="${value%$'\r'}"
    [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]] && value="${BASH_REMATCH[1]}"
    export "$key=$value"
  done < <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE")
fi

# The task can't read a file on this machine: upload the .pem's contents instead.
if [[ -z "${GITHUB_APP_PRIVATE_KEY:-}" && -n "${GITHUB_APP_PRIVATE_KEY_PATH:-}" ]]; then
  pem="$GITHUB_APP_PRIVATE_KEY_PATH"
  [[ "$pem" = /* ]] || pem="$ROOT/infra/$pem"
  [[ -r "$pem" ]] || { echo "GITHUB_APP_PRIVATE_KEY_PATH: cannot read $pem" >&2; exit 1; }
  grep -q -- "-----BEGIN .*PRIVATE KEY-----" "$pem" || { echo "$pem does not look like a PEM private key" >&2; exit 1; }
  GITHUB_APP_PRIVATE_KEY="$(cat "$pem")"
  export GITHUB_APP_PRIVATE_KEY
fi

tf_out() { terraform -chdir="$TF_DIR" output -raw "$1"; }

REGION="$(terraform -chdir="$TF_DIR" console <<<'var.region' | tr -d '"')"
SECRET_ID="$(tf_out app_secret_id)"

payload="$(node -e '
  const keys = ["BOB_API_KEY", "GITHUB_TOKEN", "GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY"];
  process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((k) => [k, process.env[k] ?? ""]))));
')"

aws secretsmanager put-secret-value --region "$REGION" --secret-id "$SECRET_ID" \
  --secret-string file:///dev/stdin <<<"$payload" >/dev/null
echo "Updated $SECRET_ID"

aws ecs update-service --region "$REGION" --cluster "$(tf_out ecs_cluster)" --service "$(tf_out ecs_service)" \
  --force-new-deployment >/dev/null
echo "Restarting the service to load the new values..."
aws ecs wait services-stable --region "$REGION" --cluster "$(tf_out ecs_cluster)" --services "$(tf_out ecs_service)"
echo "Done."
