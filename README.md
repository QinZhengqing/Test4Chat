# Test4Chat

假 API 端点。把客户端请求原封不动打印出来，专门用来验证客户端的实际请求内容。

支持 OpenAI (`/v1/chat/completions`) 和 Anthropic (`/v1/messages`) 两种协议。
打包成单文件 exe，双击即用，关窗即停。

## 快速开始

```text
双击 Test4Chat.exe → 首次自动生成 config.yml → 客户端配置好API-url和Model → 连接并发送测试消息
```

酒馆端配置：

| 场景 | 来源 | 地址 |
| --- | --- | --- |
| 验证 OpenAI 格式 | Custom (OpenAI-compatible) | `http://127.0.0.1:8052/v1` |
| 验证 Anthropic 格式 | Claude（反代） | `http://127.0.0.1:8052` |

API Key 默认留空不校验，直接连。

## 它做了什么

1. 控制台彩色打印每次请求的摘要（model、消息数、stream 等）
2. `cache_control` 黄色高亮：统计有几处注入、各在什么位置
3. 检测正文残留的 `<Cache_control>` 标签 → 红色告警（说明剥离失败）
4. 每次请求打印为独立 JSON（原始 headers + body），文件名如 `2026-06-13_11-08-27-342_0.json`
5. 返回一条固定假回复

## 协同：验证 Cache4Chat

1. 酒馆连上本服务，启用 Cache4Chat 脚本
2. 预设里写 `<Cache_control>type: ephemeral</Cache_control>`，发送消息
3. 看控制台：
   - 无 `<Cache_control>` 字样 = 剥离成功
   - 有 `cache_control × N` 黄色高亮 = 注入成功

## 配置

文件：exe 同目录下的 `config.yml`（首次运行自动生成）。改完即时生效，不用重启（`host`/`port` 除外）。

```yaml
host: 0.0.0.0        # 监听地址
port: 8052           # 监听端口
api_key: ''          # 留空=不校验；设了则 Bearer / x-api-key 必须匹配
reply_text: '[Test4Chat] 请求已打印 ✓'
model_id: Claude-Test
hot_reload: true
log_to_file: true
log_dir: logs
pretty_body: true    # 控制台缩进美化请求体
```

## 从源码构建

```powershell
npm install
npm run dev          # 编译 + 运行
npm run package      # 产出 build/Test4Chat.exe（node22-win-x64）
```
