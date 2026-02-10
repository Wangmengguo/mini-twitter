import os
import time
import json
import requests
import sys

# 配置
OPENCODE_URL = "https://opencode.ai/zen/v1/chat/completions"
OUTPUT_PATH = "/home/openclaw/repos/mini-twitter/static/model-status.json"

MODELS = [
    "glm-4.7-free",
    "minimax-m2.1-free",
    "kimi-k2.5-free"
]

def check_health(model):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5
    }
    headers = {
        "Content-Type": "application/json"
    }
    
    start_time = time.time()
    try:
        response = requests.post(OPENCODE_URL, json=payload, headers=headers, timeout=20)
        latency = round((time.time() - start_time) * 1000, 2)
        if response.status_code == 200:
            return {"status": "up", "latency": f"{latency}ms", "error": None}
        else:
            return {"status": "down", "latency": f"{latency}ms", "error": f"HTTP {response.status_code}"}
    except Exception as e:
        latency = round((time.time() - start_time) * 1000, 2)
        return {"status": "error", "latency": f"{latency}ms", "error": str(e)[:50]}

def load_previous_status():
    """读取上次的状态"""
    if not os.path.exists(OUTPUT_PATH):
        return None
    try:
        with open(OUTPUT_PATH, 'r') as f:
            return json.load(f)
    except:
        return None

def has_status_changed(old_data, new_data):
    """判断状态是否发生实质性变化（忽略延迟微小波动）"""
    if not old_data or 'models' not in old_data:
        return True
    
    old_models = old_data.get('models', {})
    new_models = new_data.get('models', {})
    
    # 比较每个模型的 status
    for name in new_models.keys():
        old_status = old_models.get(name, {}).get('status')
        new_status = new_models.get(name, {}).get('status')
        if old_status != new_status:
            return True
    
    return False

def main():
    results = {}
    for model in MODELS:
        short_name = model.replace("-free", "").upper()
        print(f"Checking {model}...", file=sys.stderr)
        results[short_name] = check_health(model)
    
    new_data = {
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "models": results
    }
    
    # 读取旧状态
    old_data = load_previous_status()
    
    # 判断是否变化
    changed = has_status_changed(old_data, new_data)
    
    # 无论如何都写入本地
    with open(OUTPUT_PATH, "w") as f:
        json.dump(new_data, f, indent=2)
    
    if changed:
        print("STATUS_CHANGED", file=sys.stderr)
        print(f"Status changed! Trigger rebuild and push.", file=sys.stderr)
        sys.exit(10)  # 特殊退出码表示需要 push
    else:
        print("NO_CHANGE", file=sys.stderr)
        print(f"No status change. Skip rebuild.", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
