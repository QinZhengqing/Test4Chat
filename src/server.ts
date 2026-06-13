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

  // OpenAI 风格：/v1/chat/completions
  if (method === 'POST' && url.includes('/chat/completions')) {
    if (!authorized(req, cfg)) return unauthorized(res);
    const { body, raw } = await readJson(req);
    const analysis = printRequest(cfg, { method, url, body, raw });
    logRequest(cfg, { ts: new Date().toISOString(), api: 'openai', url, analysis, body });

    if (body?.stream) return streamReplyOpenAI(res, cfg);
    return jsonReplyOpenAI(res, cfg);
  }

  // Anthropic 风格：/v1/messages
  if (method === 'POST' && url.includes('/messages')) {
    if (!authorized(req, cfg)) return unauthorized(res, 'anthropic');
    const { body, raw } = await readJson(req);
    const analysis = printRequest(cfg, { method, url, body, raw });
    logRequest(cfg, { ts: new Date().toISOString(), api: 'anthropic', url, analysis, body });

    if (body?.stream) return streamReplyAnthropic(res, cfg);
    return jsonReplyAnthropic(res, cfg);
  }

  sendJson(res, 404, { error: `not found: ${method} ${url}` });
}

/* ---------- 鉴权 ---------- */

function authorized(req: IncomingMessage, cfg: Config): boolean {
  if (!cfg.apiKey) return true; // 留空则不校验
  // OpenAI 用 Authorization: Bearer；Anthropic 用 x-api-key。两者都接受。
  const bearer = header(req, 'authorization').replace(/^Bearer\s+/i, '').trim();
  const xKey = header(req, 'x-api-key').trim();
  return bearer === cfg.apiKey || xKey === cfg.apiKey;
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name] ?? '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function unauthorized(res: ServerResponse, style: 'openai' | 'anthropic' = 'openai'): void {
  if (style === 'anthropic') {
    return sendJson(res, 401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
  }
  sendJson(res, 401, { error: { message: 'Invalid API key', type: 'invalid_request_error' } });
}

/* ---------- 假响应：OpenAI 风格 ---------- */

function jsonReplyOpenAI(res: ServerResponse, cfg: Config): void {
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

function streamReplyOpenAI(res: ServerResponse, cfg: Config): void {
  startSse(res);
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

/* ---------- 假响应：Anthropic 风格 ---------- */

function jsonReplyAnthropic(res: ServerResponse, cfg: Config): void {
  sendJson(res, 200, {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: cfg.modelId,
    content: [{ type: 'text', text: cfg.replyText }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}

function streamReplyAnthropic(res: ServerResponse, cfg: Config): void {
  startSse(res);
  const id = `msg_${Date.now()}`;
  const send = (event: string, data: object) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  send('message_start', {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model: cfg.modelId,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });
  send('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  });
  send('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: cfg.replyText },
  });
  send('content_block_stop', { type: 'content_block_stop', index: 0 });
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 0 },
  });
  send('message_stop', { type: 'message_stop' });
  res.end();
}

function startSse(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}

/* ---------- 工具 ---------- */

async function readJson(req: IncomingMessage): Promise<{ body: any; raw: string }> {
  const raw = await readBody(req);
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    console.error(color.red('[server] 请求体非合法 JSON，按原样打印。'));
    console.log(raw);
  }
  return { body, raw };
}

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
