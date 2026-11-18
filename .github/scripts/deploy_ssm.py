import base64
import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path


def aws(*args, check=True):
    result = subprocess.run(
        ["aws", *args, "--output", "json", "--no-cli-pager"],
        text=True,
        capture_output=True,
    )
    if check and result.returncode:
        raise RuntimeError(f"AWS CLI failed: {result.stderr.strip()}")
    return result


def main():
    domain = os.environ["DOMAIN"]
    instance = os.environ["INSTANCE_ID"]
    tag = os.environ["GITHUB_SHA"]
    registry = os.environ["REGISTRY"]
    if not re.fullmatch(r"i-[0-9a-f]{8}(?:[0-9a-f]{9})?", instance):
        raise ValueError("EC2_INSTANCE_ID must be an EC2 instance ID")
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", domain) or "." not in domain:
        raise ValueError("DEPLOY_DOMAIN must be a public domain name")
    if not re.fullmatch(r"[0-9a-f]{40}", tag):
        raise ValueError("GITHUB_SHA must be a full commit SHA")
    if not re.fullmatch(r"[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com", registry):
        raise ValueError("Invalid ECR registry")

    commands = [
        "set -eu",
        "work=$(mktemp -d)",
        "trap 'rm -f \"$work\"/deploy.sh.b64 \"$work\"/compose.yaml.b64 "
        "\"$work\"/Caddyfile.b64 \"$work\"/deploy.sh \"$work\"/compose.yaml "
        "\"$work\"/Caddyfile; rmdir \"$work\"' EXIT",
    ]
    for name in ("deploy.sh", "compose.yaml", "Caddyfile"):
        encoded = base64.b64encode((Path("deploy") / "ec2" / name).read_bytes()).decode("ascii")
        for offset in range(0, len(encoded), 2000):
            commands.append(f"printf '%s' '{encoded[offset:offset + 2000]}' >> \"$work/{name}.b64\"")
        commands.append(f"base64 -d \"$work/{name}.b64\" > \"$work/{name}\"")

    commands.extend([
        "test -d /home/ec2-user/ec2",
        "install -o ec2-user -g ec2-user -m 644 \"$work/deploy.sh\" /home/ec2-user/ec2/deploy.sh",
        "install -o ec2-user -g ec2-user -m 644 \"$work/compose.yaml\" /home/ec2-user/ec2/compose.yaml",
        "install -o ec2-user -g ec2-user -m 644 \"$work/Caddyfile\" /home/ec2-user/ec2/Caddyfile",
        "sudo -H -u ec2-user bash /home/ec2-user/ec2/deploy.sh "
        + " ".join(shlex.quote(value) for value in (
            domain, f"{registry}/react-client", f"{registry}/node-backend", tag
        )),
    ])
    parameters = json.dumps({"commands": commands, "executionTimeout": ["900"]})
    result = aws(
        "ssm", "send-command", "--document-name", "AWS-RunShellScript",
        "--instance-ids", instance, "--timeout-seconds", "120",
        "--parameters", parameters,
    )
    command_id = json.loads(result.stdout)["Command"]["CommandId"]
    print(f"Systems Manager command: {command_id}", flush=True)

    for _ in range(120):
        time.sleep(10)
        result = aws("ssm", "get-command-invocation", "--command-id", command_id,
                     "--instance-id", instance, check=False)
        if result.returncode:
            if "InvocationDoesNotExist" in result.stderr:
                continue
            raise RuntimeError(f"Unable to check deployment: {result.stderr.strip()}")
        invocation = json.loads(result.stdout)
        status = invocation["Status"]
        if status in ("Pending", "InProgress", "Delayed", "Cancelling"):
            continue
        print(invocation.get("StandardOutputContent", ""), flush=True)
        print(invocation.get("StandardErrorContent", ""), file=sys.stderr, flush=True)
        if status != "Success":
            raise RuntimeError(f"EC2 deployment failed: {status}")
        print("EC2 deployment completed.")
        return
    raise TimeoutError("Timed out waiting for EC2 deployment; check the SSM command in AWS.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, RuntimeError, TimeoutError, OSError) as exc:
        print(f"Deployment error: {exc}", file=sys.stderr)
        sys.exit(1)
