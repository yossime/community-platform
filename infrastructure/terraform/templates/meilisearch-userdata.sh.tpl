#!/bin/bash
# =============================================================================
# Meilisearch Node Setup — User Data Script
# =============================================================================
# Installs Meilisearch as a systemd service on Ubuntu 22.04 ARM64.
# Configures data directory, master key, and production environment.
# =============================================================================

set -euo pipefail

# Log all output for debugging via cloud-init
exec > >(tee /var/log/meilisearch-setup.log) 2>&1

echo "=== Meilisearch Node ${node_index} Setup (${environment}) ==="

# Update system packages
apt-get update -y
apt-get upgrade -y

# Install dependencies
apt-get install -y curl systemd

# Create meilisearch user and data directory
useradd --system --no-create-home --shell /usr/sbin/nologin meilisearch || true
mkdir -p /var/lib/meilisearch/data
chown -R meilisearch:meilisearch /var/lib/meilisearch

# Download and install Meilisearch binary
curl -L https://install.meilisearch.com | sh
mv ./meilisearch /usr/local/bin/meilisearch
chmod +x /usr/local/bin/meilisearch

# Create systemd service file
cat > /etc/systemd/system/meilisearch.service <<'SYSTEMD'
[Unit]
Description=Meilisearch Search Engine
Documentation=https://docs.meilisearch.com
After=network.target

[Service]
Type=simple
User=meilisearch
Group=meilisearch
ExecStart=/usr/local/bin/meilisearch
Environment=MEILI_ENV=production
Environment=MEILI_MASTER_KEY=${meilisearch_master_key}
Environment=MEILI_DB_PATH=/var/lib/meilisearch/data
Environment=MEILI_HTTP_ADDR=0.0.0.0:7700
Environment=MEILI_MAX_INDEXING_MEMORY=12GiB
Environment=MEILI_LOG_LEVEL=INFO
WorkingDirectory=/var/lib/meilisearch
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SYSTEMD

# Enable and start the service
systemctl daemon-reload
systemctl enable meilisearch
systemctl start meilisearch

# Wait for Meilisearch to be ready
echo "Waiting for Meilisearch to start..."
for i in $(seq 1 30); do
  if curl -s http://localhost:7700/health | grep -q "available"; then
    echo "Meilisearch node ${node_index} is healthy!"
    break
  fi
  echo "Attempt $i/30 — waiting..."
  sleep 2
done

echo "=== Meilisearch Node ${node_index} setup complete ==="
