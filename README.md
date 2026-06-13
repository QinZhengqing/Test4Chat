# Test4Chat

一个极简的请求打印服务器：伪装成 OpenAI 兼容端点，把 SillyTavern 发来的
`/chat/completions` 请求体完整打印到控制台，用于验证 Cache4Chat 等脚本
对请求体的修改是否真实生效。

用 TypeScript 编写，可一键打包成单文件 `Test4Chat.exe` —— 双击即弹出独立
控制台窗口，关闭窗口（或 Ctrl+C）即停止服务。

## 功能

- **双端点**：同时支持 OpenAI 风格 `/v1/chat/completions`（Bearer 鉴权）
  与 Anthropic 风格 `/v1/messages`（`x-api-key` 鉴权），流式 / 非流式各自
  按对应协议返回，酒馆 OpenAI 源或 Claude 源都能连；
- **请求打印**：完整、可缩进美化地打印每次请求体；
- **cache_control 分析**：黄色高亮统计有多少处带 `cache_control` 标记
  （覆盖 messages 内容块与 Anthropic 顶层 `system` 块），
  并检测正文里是否残留 `<Cache_control>` 原始标签（剥离失败的信号）；
- **日志落盘**：每次请求落盘为独立 JSON 文件（缩进展开，便于直接阅读），
  文件名形如 `2026-06-13_11-08-27-342_anthropic_0.json`；
- **配置校验 + 热重载**：启动时校验 `config.yml`；运行中改配置（API Key / 回复
  文本 / 假模型名等）自动生效（`host`/`port` 变更需重启）；
- **假响应**：流式 / 非流式都返回一条固定回复，酒馆侧不报错。

## 直接使用（exe）

1. 双击 `build/Test4Chat.exe`，弹出独立控制台窗口；
2. 首次运行会在 exe 同目录生成 `config.yml` 和 `logs/`，按需修改 `config.yml`；
3. 关闭窗口即停止服务。

## 开发运行（源码）

```powershell
npm install
npm run dev      # 等价于 tsc && node dist/index.js
```

配置在项目根目录的 `config.yml`，可用项见 `config.default.yml` 注释。

## 打包成 exe

```powershell
npm run package  # tsc 编译后用 @yao-pkg/pkg 产出 build/Test4Chat.exe
```

目标平台在 `package.json` 的 `pkg.targets`（默认 `node22-win-x64`）。
`config.default.yml` 作为资源打进 exe，首次运行时释放到 exe 同目录。

## 配置项（config.yml）

| 键 | 说明 |
| --- | --- |
| `host` | 监听地址（仅本机填 `127.0.0.1`，局域网填 `0.0.0.0`） |
| `port` | 监听端口，需避开 Windows 保留区间 |
| `api_key` | 下游需携带的 Bearer Key；留空则不校验 |
| `reply_text` | 假响应的固定回复文本 |
| `model_id` | `/v1/models` 返回的假模型名 |
| `hot_reload` | 监听 config.yml 变化自动重载 |
| `log_to_file` | 是否把请求落盘到 `log_dir` |
| `log_dir` | 日志目录（相对 exe / 项目目录） |
| `pretty_body` | 控制台是否缩进美化请求体 JSON |

> 端口需避开 Windows 保留区间（`netsh interface ipv4 show excludedportrange protocol=tcp`
> 可查看）；控制台中文乱码时先执行 `chcp 65001` 切换为 UTF-8 代码页。

## 酒馆配置

两种源都支持，按你要验证的协议选其一：

- **OpenAI 源**：来源选 **Custom (OpenAI-compatible)**，端点 URL 填
  `http://127.0.0.1:8052/v1`，走 `/v1/chat/completions`；
- **Claude 源**：来源选 **Claude**，反代地址填 `http://127.0.0.1:8052`，
  走 `/v1/messages`（这是 `cache_control` 的原生场景）。

通用：

1. 端口同 `config.yml`（默认 8052）；
2. API Key 填 `config.yml` 中的 `api_key`（默认**留空 = 不校验**，可不填；
   若设置了非空 Key，OpenAI 源用 `Authorization: Bearer`、Claude 源用
   `x-api-key`，不匹配或未携带会返回 401）；
3. 连接后会列出假模型（默认 `Claude-Test`）；
4. 发送任意消息，控制台即打印完整请求体。

## 验证 Cache4Chat 的步骤

1. 启动本服务器，酒馆连上；
2. 在酒馆助手中启用 Cache4Chat 脚本；
3. 在消息/预设里写入 `<Cache_control>type: ephemeral</Cache_control>`；
4. 发送消息，确认控制台输出中：
   - 正文里**没有** `<Cache_control>` 字样（剥离成功，否则会有红色 ⚠ 告警）；
   - 对应消息**有** `cache_control × N` 黄色高亮（注入成功）。
