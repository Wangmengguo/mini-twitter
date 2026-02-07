#!/usr/bin/env node
/**
 * Adam's Mind - 信息源读取工具
 * 
 * 用法：
 *   node scripts/sources.js twitter     # 读取 Twitter（时间线 + Arnold 的推文）
 *   node scripts/sources.js memory      # 读取 Arnold 的近期记忆
 *   node scripts/sources.js all         # 读取所有信息源
 * 
 * 输出：汇总的信息，供 Adam 思考和写作
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw/workspace/memory');
const ARNOLD_HANDLE = 'arnoldwang95';

// 执行 bird 命令
function runBird(args) {
    try {
        return execSync(`bird ${args} --plain 2>/dev/null`, {
            encoding: 'utf-8',
            timeout: 60000,
        });
    } catch (err) {
        return null;
    }
}

// 读取 Twitter 信息
async function readTwitter() {
    console.log('📱 读取 Twitter...\n');
    
    const results = {
        timeline: null,
        arnold: null,
        mentions: null,
    };
    
    // 1. Following 时间线（世界在聊什么）
    console.log('   → Following 时间线...');
    results.timeline = runBird('home --following --count 15');
    if (results.timeline) {
        console.log('   ✓ 获取成功');
    } else {
        console.log('   ✗ 获取失败');
    }
    
    // 2. Arnold 的推文（了解主人在想什么）
    console.log(`   → @${ARNOLD_HANDLE} 的推文...`);
    results.arnold = runBird(`user-tweets ${ARNOLD_HANDLE} --count 5`);
    if (results.arnold) {
        console.log('   ✓ 获取成功');
    } else {
        console.log('   ✗ 获取失败');
    }
    
    // 3. 提及 Arnold 的推文（互动内容）
    console.log(`   → @${ARNOLD_HANDLE} 的提及...`);
    results.mentions = runBird('mentions --count 10');
    if (results.mentions) {
        console.log('   ✓ 获取成功');
    } else {
        console.log('   ✗ 获取失败（可能没有新提及）');
    }
    
    console.log('');
    return results;
}

// 读取近期记忆（最近 3 天）
function readMemory() {
    console.log('🧠 读取近期记忆...\n');
    
    if (!fs.existsSync(MEMORY_DIR)) {
        console.log('   ✗ 记忆目录不存在\n');
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
    
    // Arnold 的推文（最重要）
    if (twitter?.arnold) {
        console.log('## Arnold 最近在想什么\n');
        console.log(twitter.arnold.slice(0, 1500));
        console.log('');
    }
    
    // 近期记忆
    if (memories && memories.length > 0) {
        console.log('## Arnold 的近期记忆\n');
        for (const mem of memories) {
            console.log(`### ${mem.date}\n`);
            const preview = mem.content.slice(0, 400);
            console.log(preview + (mem.content.length > 400 ? '\n...(更多内容已省略)' : ''));
            console.log('');
        }
    }
    
    // Following 时间线
    if (twitter?.timeline) {
        console.log('## Twitter 时间线（世界在聊什么）\n');
        console.log(twitter.timeline.slice(0, 2000));
        if (twitter.timeline.length > 2000) console.log('\n...(更多内容已省略)');
        console.log('');
    }
    
    // 提及
    if (twitter?.mentions) {
        console.log('## 有人 @ Arnold\n');
        console.log(twitter.mentions.slice(0, 1000));
        console.log('');
    }
    
    console.log('═'.repeat(60));
    console.log('💡 Adam 可以基于以上信息进行思考和写作');
    console.log('   优先级：Arnold 的想法 > 记忆 > 时间线 > 提及');
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
