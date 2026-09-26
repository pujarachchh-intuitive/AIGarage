#!/bin/bash
set -e

# Install Docker CE
apt-get update -y
apt-get install -y docker.io docker-compose-plugin

# Start Docker
systemctl enable docker && systemctl start docker

# Install Bob Shell
curl -fsSL https://install.bob.ai/shell | bash

# Clone repo
git clone https://github.com/pujarachchh-intuitive/AIGarage.git /app
cd /app

# Copy .env (user must provide this)
echo "Place your .env file in /app/systemdna/engine/.env"
echo "Then run: cd /app/systemdna/engine && docker compose up -d"
