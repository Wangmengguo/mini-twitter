#!/usr/bin/env node
/**
 * Adam's Mind - 信息源读取工具
 * 
 * 用法：
 *   node scripts/sources.js twitter     # 读取 Twitter 时间线
 *   node scripts/sources.js memory      # 读取 Arnold 的近期记忆
 *   node scripts/sources.js all         # 读取所有信息源
 * 
 * 输出：汇总的信息，供 Adam 思考和写作
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw/workspace/memory');

// 读取 Twitter 时间线
async function readTwitter() {
    console.log('📱 读取 Twitter 时间线...\n');
    
    try {
        // 使用 bird CLI 读取 home timeline (Following feed, chronological)
        const result = execSync('bird home --following --count 20 --plain 2>/dev/null', {
            encoding: 'utf-8',
            timeout: 60000,
        });
        
        console.log(result);
        return result;
    } catch (err) {
        console.log('⚠️  Twitter 读取失败（可能未配置 bird）');
        console.log('   请确保 bird CLI 已配置好 cookies\n');
        return null;
    }
}

// 读取近期记忆（最近 3 天）
function readMemory() {
    console.log('🧠 读取近期记忆...\n');
    
    if (!fs.existsSync(MEMORY_DIR)) {
        console.log('⚠️  记忆目录不存在\n');
        return null;
    }
    
    const today = new Date();
    const memories = [];
    
    // 读取最近 3 天的记忆
    for (let i = 0; i < 3; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        const filePath = path.join(MEMORY_DIR, `${dateStr}.md`);
        
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            memories.push({
                date: dateStr,
                content: sanitizeMemory(content),
            });
            console.log(`   ✓ ${dateStr} (${content.length} 字符)`);
        }
    }
    
    if (memories.length === 0) {
        console.log('   没有找到近期记忆\n');
        return null;
    }
    
    console.log('');
    return memories;
}

// 脱敏处理：移除敏感信息
function sanitizeMemory(content) {
    // 移除可能的密钥/密码模式
    let sanitized = content;
    
    // API keys (sk-xxx, key-xxx, etc.)
    sanitized = sanitized.replace(/\b(sk-|key-|api[_-]?key|token|secret|password|pwd)[a-zA-Z0-9_-]{10,}/gi, '[REDACTED]');
    
    // URLs with credentials
    sanitized = sanitized.replace(/https?:\/\/[^:]+:[^@]+@/gi, 'https://[REDACTED]@');
    
    // Email patterns (保留域名但隐藏用户名)
    sanitized = sanitized.replace(/\b[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, '[EMAIL]@$1');
    
    // Phone numbers (中国手机号)
    sanitized = sanitized.replace(/\b1[3-9]\d{9}\b/g, '[PHONE]');
    
    // IP addresses
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
    
    return sanitized;
}

// 汇总信息
function summarize(twitter, memories) {
    console.log('═'.repeat(60));
    console.log('📝 信息汇总 - 供 Adam 参考');
    console.log('═'.repeat(60));
    console.log('');
    
    if (memories && memories.length > 0) {
        console.log('## 近期记忆\n');
        for (const mem of memories) {
            console.log(`### ${mem.date}\n`);
            // 只显示前 500 字符作为预览
            const preview = mem.content.slice(0, 500);
            console.log(preview + (mem.content.length > 500 ? '\n...(更多内容已省略)' : ''));
            console.log('');
        }
    }
    
    if (twitter) {
        console.log('## Twitter 时间线\n');
        console.log(twitter.slice(0, 2000) + (twitter.length > 2000 ? '\n...(更多内容已省略)' : ''));
    }
    
    console.log('');
    console.log('═'.repeat(60));
    console.log('💡 Adam 可以基于以上信息进行思考和写作');
    console.log('═'.repeat(60));
}

// 主函数
async function main() {
    const arg = process.argv[2] || 'all';
    
    let twitter = null;
    let memories = null;
    
    switch (arg) {
        case 'twitter':
            twitter = await readTwitter();
            break;
        case 'memory':
            memories = readMemory();
            break;
        case 'all':
        default:
            twitter = await readTwitter();
            memories = readMemory();
            break;
    }
    
    summarize(twitter, memories);
}

main().catch(console.error);
