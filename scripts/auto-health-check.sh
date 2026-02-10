#!/bin/bash
set -e

REPO_DIR="/home/openclaw/repos/mini-twitter"
cd "$REPO_DIR"

echo "[$(date)] Running model health check..."

# 运行探测脚本
python3 scripts/check-model-health.py
EXIT_CODE=$?

if [ $EXIT_CODE -eq 10 ]; then
    echo "[$(date)] Status changed! Building and pushing..."
    
    # 构建静态站点
    node scripts/build.js
    
    # 提交并推送
    git add static/model-status.json docs/
    git commit -m "auto: update model health status (status changed)" || true
    git push origin main
    
    echo "[$(date)] Deploy complete."
elif [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] No change detected. Skipping push."
else
    echo "[$(date)] Error occurred (exit code $EXIT_CODE)"
    exit 1
fi
