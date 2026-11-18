#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: bash deploy.sh <domain> <client-ecr-repository> <server-ecr-repository> [tag]" >&2
  exit 1
fi

domain=$1
client_repo=$2
server_repo=$3
tag=${4:-v1}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
env_file="$script_dir/.env"

if [[ ${#domain} -gt 253 || ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ || "$domain" != *.* || "$domain" == *..* ]]; then
  echo "Provide a valid public domain name without a scheme, port, or path." >&2
  exit 1
fi
IFS='.' read -r -a labels <<< "$domain"
for label in "${labels[@]}"; do
  if [[ ${#label} -gt 63 || ! "$label" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$ ]]; then
    echo "Invalid domain label: $label" >&2
    exit 1
  fi
done
if [[ ! "$client_repo" =~ ^([0-9]{12}\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com)/[a-z0-9][a-z0-9._/-]*$ ]]; then
  echo "Provide a valid client ECR repository URI without a tag." >&2
  exit 1
fi
registry=${BASH_REMATCH[1]}
region=${BASH_REMATCH[2]}
if [[ "$server_repo" != "$registry/"* || ! "$server_repo" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9][a-z0-9._/-]*$ ]]; then
  echo "The server repository must be a valid URI in the same ECR registry as the client." >&2
  exit 1
fi
if [[ ! "$tag" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]]; then
  echo "Invalid image tag." >&2
  exit 1
fi

for command in aws docker openssl sudo flock; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing $command. Run setup.sh first." >&2
    exit 1
  fi
done
sudo docker compose version >/dev/null
sudo docker info >/dev/null

# Prevent two deployments from creating different secrets or updating the stack concurrently.
exec 9>"$script_dir/.deploy.lock"
if ! flock -n 9; then
  echo "Another deployment is already running." >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  volume_names=$(sudo docker volume ls --format '{{.Name}}')
  for volume in promanage_ec2_db_data promanage_ec2_uploads; do
    if grep -Fxq "$volume" <<< "$volume_names"; then
      echo "Existing data volume $volume found but $env_file is missing. Restore the original secrets before deploying." >&2
      exit 1
    fi
  done
  umask 077
  db_password=$(openssl rand -hex 32)
  jwt_secret=$(openssl rand -hex 32)
  printf 'POSTGRES_PASSWORD=%s\nJWT_SECRET=%s\n' "$db_password" "$jwt_secret" > "$env_file"
  unset db_password jwt_secret
  echo "Created secrets in $env_file. Back up this file securely."
fi
chmod 600 "$env_file"

docker_config=$(mktemp -d)
trap 'sudo rm -f "$docker_config/config.json"; rmdir "$docker_config"' EXIT
aws ecr get-login-password --region "$region" |
  sudo docker --config "$docker_config" login --username AWS --password-stdin "$registry" >/dev/null

compose() {
  sudo env "DOMAIN=$domain" "CLIENT_IMAGE=$client_repo:$tag" "SERVER_IMAGE=$server_repo:$tag" \
    docker --config "$docker_config" compose --project-name promanage-ec2 \
    --env-file "$env_file" -f "$script_dir/compose.yaml" "$@"
}

compose config --quiet
compose pull
compose up -d --force-recreate --wait --wait-timeout 180
compose ps
echo "Deployment started. After DNS and certificate issuance, open https://$domain"
