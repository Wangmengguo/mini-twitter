#!/bin/bash
# 快速测试脚本：验证环境变量配置是否正确

cd ~/repos/mini-twitter

echo "=== 环境变量加载测试 ==="
echo ""

# 加载 .env
if [ -f scripts/.env ]; then
    set -a
    source scripts/.env
    set +a
    echo "✅ .env 文件已加载"
else
    echo "❌ .env 文件不存在！请先运行："
    echo "   cp scripts/.env.example scripts/.env"
    echo "   nano scripts/.env"
    exit 1
fi

echo ""
echo "=== 检查环境变量 ==="
echo ""

# 检查每个 key 是否存在（不显示实际值，避免泄露）
check_key() {
    local var_name=$1
    local var_value="${!var_name}"
    
    if [ -z "$var_value" ]; then
        echo "❌ $var_name: 未设置"
        return 1
    elif [ "$var_value" == *"REPLACE-ME"* ]; then
        echo "⚠️  $var_name: 仍是示例值，需要替换"
        return 1
    else
        echo "✅ $var_name: 已设置 (${#var_value} 字符)"
        return 0
    fi
}

ALL_OK=1

check_key "CLIPROXY_LOCAL_KEY" || ALL_OK=0
check_key "GCLI2API_AG_KEY" || ALL_OK=0
check_key "OPENROUTER_API_KEY" || ALL_OK=0

echo ""
echo "=== 测试运行健康检查 ==="
echo ""

if [ $ALL_OK -eq 1 ]; then
    echo "环境变量配置正确，开始测试..."
    python3 scripts/check-model-health.py
    EXIT_CODE=$?
    
    echo ""
    if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 10 ]; then
        echo "✅ 测试成功！脚本运行正常。"
        if [ $EXIT_CODE -eq 10 ]; then
            echo "   (状态有变化，实际运行时会触发 rebuild)"
        else
            echo "   (状态无变化，实际运行时会跳过 rebuild)"
        fi
    else
        echo "❌ 测试失败！Exit code: $EXIT_CODE"
        exit 1
    fi
else
    echo "❌ 环境变量配置不完整，请先修复上述问题。"
    exit 1
fi

echo ""
echo "=== 下一步 ==="
echo ""
echo "1. 重启 systemd timer 让它使用新配置："
echo "   systemctl --user restart model-health-check.service"
echo "   systemctl --user status model-health-check.service"
echo ""
echo "2. 查看日志验证："
echo "   journalctl --user -u model-health-check.service -n 50"
echo ""
