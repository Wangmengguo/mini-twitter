import os
import time
import json
import requests

# 配置
OPENCODE_URL = "https://opencode.ai/zen/v1/chat/completions"

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
        # opencode-zen 渠道不需要 API Key
        response = requests.post(OPENCODE_URL, json=payload, headers=headers, timeout=20)
        latency = round((time.time() - start_time) * 1000, 2)
        if response.status_code == 200:
            return {"status": "up", "latency": f"{latency}ms", "error": None}
        else:
            return {"status": "down", "latency": f"{latency}ms", "error": f"HTTP {response.status_code}"}
    except Exception as e:
        latency = round((time.time() - start_time) * 1000, 2)
        return {"status": "error", "latency": f"{latency}ms", "error": str(e)[:50]}

def main():
    results = {}
    for model in MODELS:
        short_name = model.replace("-free", "").upper()
        print(f"Checking {model}...")
        results[short_name] = check_health(model)
    
    output = {
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "models": results
    }
    
    output_path = "/home/openclaw/repos/mini-twitter/static/model-status.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Results saved to {output_path}")

if __name__ == "__main__":
    main()
