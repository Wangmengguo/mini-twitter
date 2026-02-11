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

# 读取配置文件（只包含非敏感信息）
CONFIG_FILE = Path(__file__).parent / "secrets-config.json"
OUTPUT_PATH = Path(__file__).parent.parent / "static" / "model-status.json"
STATE_PATH = Path(__file__).parent.parent / "static" / "model-health-state.json"

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
    """真实调用模型获取延迟（TTFT 粗略近似）"""
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    start_time = time.time()
    try:
        response = requests.post(
            f"{base_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=20
        )
        latency = round((time.time() - start_time) * 1000, 2)
        if response.status_code == 200:
            return {"status": "up", "latency": f"{latency}ms"}
        elif response.status_code == 429:
            # Rate limit - not a service failure
            text = ''
            try:
                text = response.text[:160]
            except Exception:
                text = ''
            return {"status": "rate_limited", "latency": f"{latency}ms", "error": f"HTTP 429: {text}"}
        elif response.status_code >= 500:
            # Server error - provider issue
            text = ''
            try:
                text = response.text[:160]
            except Exception:
                text = ''
            return {"status": "server_error", "latency": f"{latency}ms", "error": f"HTTP {response.status_code}: {text}"}
        else:
            # Other errors
            text = ''
            try:
                text = response.text[:160]
            except Exception:
                text = ''
            return {"status": "down", "latency": f"{latency}ms", "error": f"HTTP {response.status_code}: {text}"}
    except Exception as e:
        latency = round((time.time() - start_time) * 1000, 2)
        return {"status": "error", "latency": f"{latency}ms", "error": str(e)[:160]}

def load_previous_status():
    """读取上次的状态"""
    if not OUTPUT_PATH.exists():
        return None
    try:
        with open(OUTPUT_PATH, 'r') as f:
            return json.load(f)
    except:
        return None

def load_state():
    """读取检测状态（用于免费模型降频）"""
    if not STATE_PATH.exists():
        return {"last_check": {}}
    try:
        with open(STATE_PATH, 'r') as f:
            return json.load(f)
    except:
        return {"last_check": {}}

def save_state(state):
    """保存检测状态"""
    try:
        STATE_PATH.parent.mkdir(exist_ok=True)
        with open(STATE_PATH, 'w') as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        print(f"Warning: Failed to save state: {e}", file=sys.stderr)

def has_critical_change_critical_only(old_data, new_data):
    """只检查关键模型的状态变化（免费模型跳过检测时不触发）"""
    if not old_data or 'providers' not in old_data:
        return True
    
    old_providers = old_data.get('providers', {})
    new_providers = new_data.get('providers', {})
    
    for provider_key, provider_data in new_providers.items():
        old_provider = old_providers.get(provider_key, {})
        
        # 只检查关键模型
        for model in provider_data.get('models', []):
            if not model.get('critical'):
                continue  # 跳过免费模型
            
            model_name = model['display']
            old_model = next((m for m in old_provider.get('models', []) if m['display'] == model_name), None)
            
            if not old_model:
                return True
            
            # 状态变化
            if old_model.get('status') != model.get('status'):
                print(f"[CHANGE] {provider_key}/{model_name}: {old_model.get('status')} → {model.get('status')}", file=sys.stderr)
                return True
    
    return False

def main():
    providers = load_config()
    results = {"providers": {}}
    
    state = load_state()
    
    # 免费模型检测间隔（秒）
    FREE_MODEL_INTERVAL = 1800  # 30 分钟

    for provider_key, config in providers.items():
        # 检查是否需要检测该 provider
        is_critical_provider = any(m.get('critical', False) for m in config['models'])
        
        if not is_critical_provider:
            # 免费模型：检查上次检测时间
            last_check = state.get('last_check', {}).get(provider_key, 0)
            elapsed = time.time() - last_check
            
            if elapsed < FREE_MODEL_INTERVAL:
                print(f"\n[{config['name']}] Skip (checked {int(elapsed)}s ago, < {FREE_MODEL_INTERVAL}s)", file=sys.stderr)
                # 复用上次的结果（如果存在）
                old_data = load_previous_status()
                if old_data and provider_key in old_data.get('providers', {}):
                    results["providers"][provider_key] = old_data['providers'][provider_key]
                continue
            
            # 更新检测时间
            if 'last_check' not in state:
                state['last_check'] = {}
            state['last_check'][provider_key] = time.time()
        
        print(f"\n[{config['name']}]", file=sys.stderr)

        provider_result = {
            "name": config["name"],
            "icon": config["icon"],
            "models": []
        }

        for model in config["models"]:
            print(f"  Checking {model['display']}...", file=sys.stderr)
            health = check_model_health(config["baseUrl"], config["apiKey"], model["id"])

            model_result = {
                "display": model["display"],
                "status": health["status"],
                "latency": health.get("latency"),
                "critical": model.get("critical", False)
            }

            if model.get("star"):
                model_result["star"] = True

            # include error snippet for debugging (UI can ignore)
            if health.get('error'):
                model_result['error'] = health.get('error')

            provider_result["models"].append(model_result)

        results["providers"][provider_key] = provider_result

    results["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    
    # 保存状态（免费模型检测时间）
    save_state(state)

    old_data = load_previous_status()
    
    # 只检查关键模型的变化（免费模型复用旧数据时不应触发 rebuild）
    changed = has_critical_change_critical_only(old_data, results)

    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    if changed:
        print("\n[STATUS_CHANGED] Trigger rebuild.", file=sys.stderr)
        sys.exit(10)
    else:
        print("\n[NO_CHANGE] Skip rebuild.", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
