# dycaption-cli

抖音视频文案提取命令行工具。支持 npm 安装或零依赖 bash 脚本。

## 安装

```bash
# 直接使用，无需安装
npx dycaption setup

# 或全局安装
npm install -g dycaption
dycaption setup
```

需要 Node.js >= 18。

### bash 脚本（macOS/Linux）

```bash
curl -sL https://raw.githubusercontent.com/xwchris/dycaption-cli/main/dycaption -o /usr/local/bin/dycaption
chmod +x /usr/local/bin/dycaption
dycaption setup
```

## 快速开始

```bash
# 首次使用：交互式注册/登录
# 会自动保存 API Key 到 ~/.dycaption
dycaption setup

# 提取文案（支持抖音分享链接或包含链接的整段文案）
dycaption transcribe "https://v.douyin.com/xxxxx/"
```

## 命令

```bash
dycaption setup                           # 首次配置（注册或登录）
dycaption register                        # 注册新账号
dycaption login                           # 登录已有账号
dycaption transcribe <链接或分享文案> [语言] # 提交转写并轮询结果
dycaption status <taskId>                 # 查询任务状态
dycaption balance                         # 查询积分余额
dycaption history [数量]                  # 查询历史（默认 10）
dycaption help                            # 显示帮助
```

## 配置

API Key 默认保存在 `~/.dycaption`。

也可以通过环境变量配置（优先级高于配置文件）：

```bash
export DY_CAPTION_API_KEY="dy_xxxxx"
export DY_CAPTION_API_URL="https://api.dytext.cn"  # 可选
```

如果需要在 CLI 内使用 `register/login`，还需要提供 Supabase 公共配置：

```bash
export DY_CAPTION_SUPABASE_URL="https://wcedjbnfdlfnomzwtwlq.supabase.co"
export DY_CAPTION_SUPABASE_ANON_KEY="your_supabase_anon_key"
```

## 示例

```bash
dycaption setup
dycaption transcribe "https://v.douyin.com/xxxxx/"
dycaption transcribe "6.44 复制打开抖音，看看【xxx】 https://v.douyin.com/xxxxx/" zh-CN
dycaption balance
dycaption history 20
```

## License

MIT
