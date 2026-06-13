import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { color } from './colors';
import type { Config } from './config';
import { logRequest } from './logger';
import { printRequest } from './printer';

/**
 * 创建 HTTP 服务器。配置通过 getConfig() 动态读取，这样热重载后
 * 鉴权 Key、回复文本等立即生效，无需重建 server。
 */
export function createApp(getConfig: () => Config): Server {
  return createServer((req, res) => {
    handle(req, res, getConfig()).catch((err) => {
      console.error(color.red(`[server] 未捕获错误: ${(err as Error).message}`));
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    });
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, cfg: Config): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // 健康检查
  if (method === 'GET' && (url === '/' || url === '/health')) {
    return sendJson(res, 200, { ok: true, service: 'Test4Chat' });
  }

  // 假模型列表
  if (method === 'GET' && url.replace(/\/+$/, '').endsWith('/models')) {
    if (!authorized(req, cfg)) return unauthorized(res);
    return sendJson(res, 200, {
      object: 'list',
      data: [{ id: cfg.modelId, object: 'model', owned_by: 'test4chat' }],
    });
  }

  // 聊天补全：核心路径
  if (method === 'POST' && url.includes('/chat/completions')) {
    if (!authorized(req, cfg)) return unauthorized(res);

    const raw = await readBody(req);
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      console.error(color.red('[server] 请求体非合法 JSON，按原样打印。'));
      console.log(raw);
    }

    const analysis = printRequest(cfg, { method, url, body, raw });
    logRequest(cfg, { ts: new Date().toISOString(), url, analysis, body });

    if (body?.stream) return streamReply(res, cfg);
    return jsonReply(res, cfg);
  }

  sendJson(res, 404, { error: `not found: ${method} ${url}` });
}

/* ---------- 鉴权 ---------- */

function authorized(req: IncomingMessage, cfg: Config): boolean {
  if (!cfg.apiKey) return true; // 留空则不校验
  const auth = req.headers['authorization'] ?? '';
  const token = Array.isArray(auth) ? auth[0] : auth;
  return token.replace(/^Bearer\s+/i, '').trim() === cfg.apiKey;
}

function unauthorized(res: ServerResponse): void {
  sendJson(res, 401, { error: { message: 'Invalid API key', type: 'invalid_request_error' } });
}

/* ---------- 假响应 ---------- */

function jsonReply(res: ServerResponse, cfg: Config): void {
  sendJson(res, 200, {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: cfg.modelId,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: cfg.replyText },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

function streamReply(res: ServerResponse, cfg: Config): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model: cfg.modelId,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  res.write(chunk({ role: 'assistant' }, null));
  res.write(chunk({ content: cfg.replyText }, null));
  res.write(chunk({}, 'stop'));
  res.write('data: [DONE]\n\n');
  res.end();
}

/* ---------- 工具 ---------- */

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}
