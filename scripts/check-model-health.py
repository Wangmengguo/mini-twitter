import os
import time
import json
import requests
import sys

# 配置
OUTPUT_PATH = "/home/openclaw/repos/mini-twitter/static/model-status.json"

OPENCLAW_CONFIG_PATH = "/home/openclaw/.openclaw/openclaw.json"

# Provider 配置（注意：不要在 repo 里硬编码 API key）
PROVIDERS = {
    "cliproxy-local": {
        "name": "Local Proxy",
        "icon": "🔧",
        "baseUrl": "http://localhost:7861/v1",
        "apiKeyFromConfig": "cliproxy-local",
        "models": [
            {"id": "claude-opus-4-6-thinking", "display": "Opus 4.6", "critical": True, "star": True},
            {"id": "gemini-claude-sonnet-4-5", "display": "Sonnet 4.5", "critical": True}
        ]
    },
    "gcli2api-ag": {
        "name": "Remote API",
        "icon": "🌐",
        "baseUrl": "http://148.135.124.86:7861/antigravity/v1",
        "apiKeyFromConfig": "gcli2api-ag",
        "models": [
            {"id": "claude-opus-4-6", "display": "Opus 4.6", "critical": True},
            {"id": "claude-sonnet-4-5", "display": "Sonnet 4.5", "critical": True}
        ]
    },
    "opencode-zen": {
        "name": "OpenCode-Zen",
        "icon": "📡",
        "baseUrl": "https://opencode.ai/zen/v1",
        "apiKey": None,
        "models": [
            {"id": "kimi-k2.5-free", "display": "Kimi", "critical": False},
            {"id": "glm-4.7-free", "display": "GLM", "critical": False},
            {"id": "minimax-m2.1-free", "display": "Minimax", "critical": False}
        ]
    },
    "openrouter": {
        "name": "OpenRouter",
        "icon": "🌍",
        "baseUrl": "https://openrouter.ai/api/v1",
        "apiKeyFromConfig": "openrouter",
        "models": [
            {"id": "openrouter/pony-alpha", "display": "Pony Alpha", "critical": False}
        ]
    }
}

def load_openclaw_config():
    try:
        with open(OPENCLAW_CONFIG_PATH, 'r') as f:
            return json.load(f)
    except Exception:
        return None


def get_api_key(provider_cfg, openclaw_cfg):
    # explicit
    if provider_cfg.get('apiKey') is not None:
        return provider_cfg.get('apiKey')

    provider_id = provider_cfg.get('apiKeyFromConfig')
    if not provider_id:
        return None

    if not openclaw_cfg:
        return None

    try:
        return openclaw_cfg['models']['providers'][provider_id].get('apiKey')
    except Exception:
        return None


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
        else:
            # capture a short error snippet for diagnosis
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
    if not os.path.exists(OUTPUT_PATH):
        return None
    try:
        with open(OUTPUT_PATH, 'r') as f:
            return json.load(f)
    except:
        return None

def has_critical_change(old_data, new_data):
    """判断关键指标是否变化"""
    if not old_data or 'providers' not in old_data:
        return True
    
    old_providers = old_data.get('providers', {})
    new_providers = new_data.get('providers', {})
    
    for provider_key, provider_data in new_providers.items():
        old_provider = old_providers.get(provider_key, {})
        
        # 检查每个模型
        for model in provider_data.get('models', []):
            model_name = model['display']
            old_model = next((m for m in old_provider.get('models', []) if m['display'] == model_name), None)
            
            if not old_model:
                return True
            
            # 状态变化
            if old_model.get('status') != model.get('status'):
                print(f"[CHANGE] {provider_key}/{model_name}: {old_model.get('status')} → {model.get('status')}", file=sys.stderr)
                return True
            
            # 关键模型的延迟阈值变化
            if model.get('critical'):
                old_latency = parse_latency(old_model.get('latency', '0ms'))
                new_latency = parse_latency(model.get('latency', '0ms'))
                
                old_level = get_latency_level(old_latency)
                new_level = get_latency_level(new_latency)
                
                if old_level != new_level:
                    print(f"[CHANGE] {provider_key}/{model_name}: latency level {old_level} → {new_level}", file=sys.stderr)
                    return True
    
    return False

def parse_latency(latency_str):
    """解析延迟字符串为毫秒数"""
    try:
        return float(latency_str.replace('ms', ''))
    except:
        return 0

def get_latency_level(latency_ms):
    """延迟分级：good(<2000) / degraded(2000-5000) / bad(>5000)"""
    if latency_ms < 2000:
        return "good"
    elif latency_ms < 5000:
        return "degraded"
    else:
        return "bad"

def main():
    results = {"providers": {}}

    openclaw_cfg = load_openclaw_config()

    for provider_key, config in PROVIDERS.items():
        print(f"\n[{config['name']}]", file=sys.stderr)

        api_key = get_api_key(config, openclaw_cfg)

        provider_result = {
            "name": config["name"],
            "icon": config["icon"],
            "models": []
        }

        for model in config["models"]:
            print(f"  Checking {model['display']}...", file=sys.stderr)
            health = check_model_health(config["baseUrl"], api_key, model["id"])

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

    old_data = load_previous_status()
    changed = has_critical_change(old_data, results)

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
