#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';

const API_URL = process.env.DY_CAPTION_API_URL || 'https://api.dytext.cn';
const CONFIG_FILE = join(homedir(), '.dycaption');

const SUPABASE_URL = process.env.DY_CAPTION_SUPABASE_URL || 'https://wcedjbnfdlfnomzwtwlq.supabase.co';
const SUPABASE_ANON_KEY = process.env.DY_CAPTION_SUPABASE_ANON_KEY || '';

const colors = {
  red: (s) => `\x1b[0;31m${s}\x1b[0m`,
  green: (s) => `\x1b[0;32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[1;33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[0;36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function error(msg) {
  console.error(colors.red(`错误: ${msg}`));
  process.exit(1);
}

function success(msg) {
  console.log(colors.green(msg));
}

function info(msg) {
  console.log(msg);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: hidden ? undefined : process.stdout,
      terminal: hidden,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function loadConfig() {
  if (process.env.DY_CAPTION_API_KEY) return process.env.DY_CAPTION_API_KEY;
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const match = content.match(/^DY_CAPTION_API_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function saveConfig(apiKey) {
  writeFileSync(CONFIG_FILE, `DY_CAPTION_API_KEY=${apiKey}\n`, 'utf-8');
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Windows
  }
}

function getApiKey() {
  const key = loadConfig();
  if (!key) {
    error(`未配置 API Key\n\n  运行 ${colors.bold('dycaption setup')} 注册账号并自动配置\n  或设置环境变量: export DY_CAPTION_API_KEY="dy_xxxxx"`);
  }
  return key;
}

function requireSupabasePublicConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    error(
      `注册/登录需要 Supabase 公共配置\n\n` +
      `  export DY_CAPTION_SUPABASE_URL="https://wcedjbnfdlfnomzwtwlq.supabase.co"\n` +
      `  export DY_CAPTION_SUPABASE_ANON_KEY="your_supabase_anon_key"`
    );
  }
}

async function apiCall(method, path, body) {
  const apiKey = getApiKey();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(`${API_URL}${path}`, opts).catch(() => {
    error('请求失败，请检查网络连接');
  });

  const data = await resp.json().catch(() => {
    error('服务返回了非 JSON 响应');
  });

  if (!resp.ok || data.error) {
    const message = data.error || `请求失败 (${resp.status})`;
    error(message);
  }

  return data;
}

async function supabaseRequest(endpoint, body) {
  requireSupabasePublicConfig();

  const resp = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {
    error('认证请求失败，请检查网络连接');
  });

  return resp.json();
}

async function fetchApiKey(jwt) {
  requireSupabasePublicConfig();

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=api_key`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  }).catch(() => {
    error('获取 API Key 失败，请检查网络连接');
  });

  const data = await resp.json().catch(() => null);
  return data?.[0]?.api_key || null;
}

async function doRegister(email, password) {
  info('📧 注册中...');
  const resp = await supabaseRequest('/auth/v1/signup', { email, password });

  if (resp.msg) error(`注册失败: ${resp.msg}`);

  if (!resp.access_token) {
    success('✅ 注册成功！请查收邮箱确认邮件');
    info('');
    info(`   确认邮箱后运行: ${colors.bold('dycaption login')}`);
    process.exit(0);
  }

  const apiKey = await fetchApiKey(resp.access_token);
  if (!apiKey) error(`注册成功但未获取到 API Key，请稍后使用 ${colors.bold('dycaption login')} 登录`);

  saveConfig(apiKey);
  success('✅ 注册成功！');
  success(`✅ API Key 已保存到 ${CONFIG_FILE}`);

  return apiKey;
}

async function doLogin(email, password) {
  info('🔑 登录中...');
  const resp = await supabaseRequest('/auth/v1/token?grant_type=password', { email, password });

  if (resp.msg) error(`登录失败: ${resp.msg}`);
  if (!resp.access_token) error('登录失败，未获取到访问令牌');

  const apiKey = await fetchApiKey(resp.access_token);
  if (!apiKey) error('登录成功但未获取到 API Key');

  saveConfig(apiKey);
  success('✅ 登录成功！');
  success(`✅ API Key 已保存到 ${CONFIG_FILE}`);

  return apiKey;
}

async function cmdSetup() {
  info(colors.bold('dy-caption CLI - 账号配置'));
  console.log('');
  console.log('  1) 注册新账号');
  console.log('  2) 已有账号，直接登录');
  console.log('');
  const choice = await ask(colors.cyan('请选择 [1/2]: '));

  if (choice === '1') return cmdRegister();
  if (choice === '2') return cmdLogin();
  error('无效选择');
}

async function cmdRegister() {
  const email = await ask('📧 请输入邮箱: ');
  if (!email) error('邮箱不能为空');

  const password = await ask('🔒 请输入密码 (至少6位): ', { hidden: true });
  console.log('');
  if (!password || password.length < 6) error('密码不能少于6位');

  const password2 = await ask('🔒 请确认密码: ', { hidden: true });
  console.log('');
  if (password !== password2) error('两次密码不一致');

  const apiKey = await doRegister(email, password);
  if (apiKey) {
    console.log('');
    await cmdBalance();
  }
}

async function cmdLogin() {
  const email = await ask('📧 请输入邮箱: ');
  if (!email) error('邮箱不能为空');

  const password = await ask('🔒 请输入密码: ', { hidden: true });
  console.log('');
  if (!password) error('密码不能为空');

  const apiKey = await doLogin(email, password);
  if (apiKey) {
    console.log('');
    await cmdBalance();
  }
}

async function cmdTranscribe(input, language = 'zh-CN') {
  if (!input) error('请提供抖音分享链接或文案\n  用法: dycaption transcribe <链接或分享文案> [语言]');
  getApiKey();

  info(`📝 提交转写任务: ${colors.yellow(input.substring(0, 60))}`);
  info(`   语言: ${language}`);
  info('   提交中...');

  const resp = await apiCall('POST', '/api/v1/transcribe', { input, language });
  const taskId = resp.taskId;
  if (!taskId) error('创建任务失败，未返回 taskId');

  const timeout = 300;
  const interval = 3000;
  const start = Date.now();

  info(`   任务 ID: ${taskId}`);

  while (Date.now() - start < timeout * 1000) {
    await new Promise((r) => setTimeout(r, interval));
    const elapsed = Math.round((Date.now() - start) / 1000);

    const poll = await apiCall('GET', `/api/v1/transcribe/${taskId}`);

    if (poll.status === 'completed') {
      console.log('');
      success('✅ 转写完成！');
      if (poll.author) info(`   作者: ${poll.author}`);
      if (poll.videoDesc) info(`   视频文案: ${poll.videoDesc}`);
      if (poll.duration != null) info(`   时长: ${poll.duration} 分钟`);
      if (poll.creditCost != null) info(`   消耗积分: ${poll.creditCost}`);
      console.log('');
      info(colors.bold('提取文案:'));
      console.log(poll.resultText || '(空)');
      return;
    }
    if (poll.status === 'failed') {
      error(`转写失败: ${poll.errorMessage || '未知错误'}`);
    }

    info(`   等待中... (${elapsed}s)`);
  }

  error(`转写超时（${timeout}s），任务 ID: ${taskId}`);
}

async function cmdStatus(taskId) {
  if (!taskId) error('请提供 taskId\n  用法: dycaption status <taskId>');

  const task = await apiCall('GET', `/api/v1/transcribe/${taskId}`);

  success('📌 任务状态');
  info(`   taskId: ${task.taskId}`);
  info(`   status: ${task.status}`);
  if (task.duration != null) info(`   duration: ${task.duration} 分钟`);
  if (task.creditCost != null) info(`   creditCost: ${task.creditCost}`);
  if (task.author) info(`   author: ${task.author}`);
  if (task.videoDesc) info(`   videoDesc: ${task.videoDesc}`);
  if (task.errorMessage) info(`   error: ${task.errorMessage}`);
  if (task.resultText) {
    console.log('');
    info(colors.bold('resultText:'));
    console.log(task.resultText);
  }
}

async function cmdBalance() {
  const resp = await apiCall('GET', '/api/v1/credits');
  success('💰 积分余额');
  console.log(`   当前余额:   ${resp.balance}`);
  console.log(`   冻结余额:   ${resp.reservedBalance ?? 0}`);
  console.log(`   可用余额:   ${resp.availableBalance ?? resp.balance}`);
  console.log(`   已购买:     ${resp.totalPurchased ?? 0}`);
  console.log(`   已使用:     ${resp.totalUsed ?? 0}`);
}

async function cmdHistory(limit = 10) {
  info('📋 获取转写历史...');
  const resp = await apiCall('GET', '/api/v1/history');
  const tasks = (resp.tasks || []).slice(0, Math.max(1, limit));
  console.log('');
  info(`显示最近 ${tasks.length} 条：`);
  console.log('');

  if (tasks.length === 0) {
    info('   暂无记录');
    return;
  }

  for (const task of tasks) {
    const status = task.status === 'completed' ? colors.green('✓') : task.status === 'failed' ? colors.red('✗') : '…';
    const date = task.created_at ? new Date(task.created_at).toLocaleString('zh-CN') : '';
    const input = (task.input || '').replace(/\s+/g, ' ').substring(0, 36);
    console.log(`  ${status} ${input.padEnd(38)} ${date}`);
  }
}

function showHelp() {
  console.log(`dycaption-cli v1.0.0

用法:
  dycaption setup                           首次配置（注册或登录）
  dycaption register                        注册新账号
  dycaption login                           登录已有账号
  dycaption transcribe <链接或分享文案> [语言] 提交转写并轮询结果
  dycaption status <taskId>                 查询任务状态
  dycaption balance                         查询积分余额
  dycaption history [数量]                  查询历史（默认 10）
  dycaption help                            显示帮助

首次使用:
  dycaption setup

配置:
  API Key 保存在 ~/.dycaption，也可通过环境变量设置:
  export DY_CAPTION_API_KEY="dy_xxxxx"

环境变量:
  DY_CAPTION_API_URL             API 地址 (默认: https://api.dytext.cn)
  DY_CAPTION_API_KEY             API 密钥（优先级高于配置文件）
  DY_CAPTION_SUPABASE_URL        Supabase URL（注册/登录必需）
  DY_CAPTION_SUPABASE_ANON_KEY   Supabase anon key（注册/登录必需）

示例:
  dycaption setup
  dycaption transcribe "https://v.douyin.com/xxxxx/"
  dycaption transcribe "6.44 复制打开抖音，看看【xxx】 https://v.douyin.com/xxxxx/" zh-CN
  dycaption status 123e4567-e89b-12d3-a456-426614174000
  dycaption balance
  dycaption history 20

主页: https://dytext.cn
使用: npx dycaption setup`);
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'setup':
    await cmdSetup();
    break;
  case 'register':
    await cmdRegister();
    break;
  case 'login':
    await cmdLogin();
    break;
  case 'transcribe':
  case 'generate':
    await cmdTranscribe(args[1], args[2]);
    break;
  case 'status':
    await cmdStatus(args[1]);
    break;
  case 'balance':
  case 'credits':
    await cmdBalance();
    break;
  case 'history':
    await cmdHistory(parseInt(args[1], 10) || 10);
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (command) {
      await cmdTranscribe(command, args[1]);
    } else {
      showHelp();
    }
    break;
}
