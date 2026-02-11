#!/bin/bash

REPO_DIR="/home/openclaw/repos/mini-twitter"
cd "$REPO_DIR"

echo "[$(date)] Running model health check..."

# 加载环境变量（从 .env 文件）
if [ -f scripts/.env ]; then
    set -a
    source scripts/.env
    set +a
    echo "[$(date)] Loaded API keys from scripts/.env"
else
    echo "[$(date)] WARNING: scripts/.env not found! Using empty keys."
fi

# 运行探测脚本（允许 exit 10）
set +e
python3 scripts/check-model-health.py
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -eq 10 ]; then
    echo "[$(date)] Status changed! Building and pushing..."
    
    # 构建静态站点
    node scripts/build.js
    
    # 提交并推送（只提交模型状态相关文件）
    git add static/model-status.json static/model-health-state.json
    git add docs/static/model-status.json docs/static/model-health-state.json
    git commit -m "auto: update model health status (status changed)" || true
    git push origin main
    
    echo "[$(date)] Deploy complete."
elif [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] No change detected. Skipping push."
else
    echo "[$(date)] Error occurred (exit code $EXIT_CODE)"
    exit 1
fi
