#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "This setup expects an x86-64 EC2 instance and x86-64 application images." >&2
  exit 1
fi
if [[ ! -r /etc/os-release ]] || ! grep -q '^ID="*amzn"*' /etc/os-release || ! grep -q '^VERSION_ID="*2023"*' /etc/os-release; then
  echo "This setup script is intended for Amazon Linux 2023." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is missing. Install AWS CLI v2 before running this script." >&2
  echo "See https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
  exit 1
fi

sudo dnf install -y docker openssl
if ! command -v curl >/dev/null 2>&1; then
  sudo dnf install -y curl-minimal
fi
sudo systemctl enable --now docker

if ! sudo docker compose version >/dev/null 2>&1; then
  compose_version=v2.34.0
  compose_sha256=94a416c6f2836a0a1ba5eb3feb00f2e700a9d98311f062c4c61494ccbf3cd457
  tmp_file=$(mktemp)
  trap 'rm -f "$tmp_file"' EXIT
  curl --fail --location --silent --show-error \
    "https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-x86_64" \
    --output "$tmp_file"
  echo "${compose_sha256}  ${tmp_file}" | sha256sum --check --status
  sudo install -d /usr/local/lib/docker/cli-plugins
  sudo install -m 755 "$tmp_file" /usr/local/lib/docker/cli-plugins/docker-compose
fi

sudo docker compose version
aws --version
echo "Setup complete. Run deploy.sh with your domain and ECR repository URIs."
