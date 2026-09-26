#!/bin/bash
# deploy.sh — build and push Docker image, then deploy to EC2
set -e

REGION="${AWS_REGION:-us-east-1}"
IMAGE="${ECR_REPO:-systemdna-engine}:latest"

echo "Building Docker image..."
docker build -t "$IMAGE" .

echo "Pushing to ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$IMAGE"
docker push "$IMAGE"

echo "Deploying on EC2..."
ssh ec2-user@"$EC2_HOST" "cd /app/systemdna/engine && docker compose pull && docker compose up -d"

echo "Deploy complete."
