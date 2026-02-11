#!/usr/bin/env python3
"""
Model Health Check - Secure Version
从环境变量读取 API keys，绝不硬编码
"""
import os
import sys
import json
import time
import requests
from pathlib import Path
from datetime import datetime

# 读取配置文件（只包含非敏感信息）
CONFIG_FILE = Path(__file__).parent / "secrets-config.json"

def load_config():
    """从配置文件和环境变量加载 provider 配置"""
    with open(CONFIG_FILE) as f:
        config = json.load(f)
    
    providers = {}
    for key, provider in config["providers"].items():
        # 从环境变量读取 API key
        api_key_env = provider.get("apiKeyEnv")
        if api_key_env:
            api_key = os.getenv(api_key_env)
            if not api_key:
                print(f"⚠️  Warning: {api_key_env} not set in environment", file=sys.stderr)
                api_key = None
        else:
            api_key = None
        
        providers[key] = {
            "name": provider["name"],
            "icon": provider["icon"],
            "baseUrl": provider["baseUrl"],
            "apiKey": api_key,
            "models": provider["models"]
        }
    
    return providers

def check_model_health(base_url, api_key, model_id):
    """真实调用模型获取延迟"""
    try:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 10
        }
        
        start = time.time()
        resp = requests.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=5
        )
        latency = time.time() - start
        
        if resp.status_code == 200:
            return {"status": "up", "latency": round(latency, 2)}
        elif resp.status_code == 429:
            return {"status": "rate_limited", "latency": None}
        elif resp.status_code >= 500:
            return {"status": "server_error", "latency": None}
        else:
            return {"status": "down", "latency": None, "error": resp.status_code}
    except requests.Timeout:
        return {"status": "timeout", "latency": None}
    except Exception as e:
        return {"status": "down", "latency": None, "error": str(e)}

def main():
    providers = load_config()
    results = []
    
    for provider_id, config in providers.items():
        print(f"\n[{config['name']}]", file=sys.stderr)
        
        for model in config["models"]:
            print(f"  Checking {model['display']}...", file=sys.stderr)
            health = check_model_health(config["baseUrl"], config["apiKey"], model["id"])
            
            results.append({
                "provider": config["name"],
                "icon": config["icon"],
                "model": model["display"],
                "critical": model.get("critical", False),
                **health
            })
    
    # 输出到 JSON 文件
    output_file = Path(__file__).parent.parent / "static" / "model-status.json"
    output_file.parent.mkdir(exist_ok=True)
    
    output_data = {
        "timestamp": datetime.now().isoformat(),
        "models": results
    }
    
    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n✅ Health check complete: {output_file}", file=sys.stderr)
    
    # 检测状态变化（与上次对比）
    # ... (保留原来的状态变化检测逻辑)

if __name__ == "__main__":
    main()
