import { color } from './colors';
import type { Config } from './config';

export interface CacheAnalysis {
  /** 带 cache_control 标记的位置数 */
  markedMessages: number;
  /** 命中的 cache_control 位置摘要（位置标签 + type） */
  hits: Array<{ label: string; type: string }>;
  /** 请求正文里是否仍残留 <Cache_control> 字样（剥离失败的信号） */
  leftoverTag: boolean;
}

const TAG_RE = /<\s*cache_control\b/i;

/** 扫描单个 content 字段（字符串或内容块数组），收集 cache_control 命中与残留标签。 */
function scanContent(
  content: unknown,
  label: string,
  result: CacheAnalysis,
): boolean {
  let marked = false;
  if (Array.isArray(content)) {
    for (const part of content as any[]) {
      if (part && typeof part === 'object' && part.cache_control) {
        marked = true;
        result.hits.push({ label, type: String(part.cache_control.type ?? '?') });
      }
      if (typeof part?.text === 'string' && TAG_RE.test(part.text)) {
        result.leftoverTag = true;
      }
    }
  } else if (typeof content === 'string' && TAG_RE.test(content)) {
    result.leftoverTag = true;
  }
  return marked;
}

/**
 * 扫描 OpenAI / Anthropic 风格请求体，统计 cache_control 注入情况，
 * 并检测正文里是否还残留 <Cache_control> 原始标签。
 * 同时覆盖 Anthropic 的顶层 system 块。
 */
export function analyzeCache(body: any): CacheAnalysis {
  const result: CacheAnalysis = { markedMessages: 0, hits: [], leftoverTag: false };

  // Anthropic 顶层 system（可为字符串或内容块数组）
  if (body?.system !== undefined) {
    if (scanContent(body.system, 'system', result)) result.markedMessages += 1;
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  messages.forEach((msg: any, index: number) => {
    let marked = false;
    // 消息级 cache_control（OpenAI 兼容写法常见）
    if (msg && typeof msg === 'object' && msg.cache_control) {
      marked = true;
      result.hits.push({ label: `msg#${index}`, type: String(msg.cache_control.type ?? '?') });
    }
    // content 内容块级
    if (scanContent(msg?.content, `msg#${index}`, result)) marked = true;
    if (marked) result.markedMessages += 1;
  });

  return result;
}

/** 打印一条请求的完整概况到控制台。 */
export function printRequest(cfg: Config, info: {
  method: string;
  url: string;
  body: any;
  raw: string;
}): CacheAnalysis {
  const ts = new Date().toLocaleTimeString();
  const analysis = analyzeCache(info.body);

  console.log(color.gray('─'.repeat(60)));
  console.log(
    `${color.dim(`[${ts}]`)} ${color.bold(color.green(info.method))} ${color.cyan(info.url)}`,
  );

  if (info.body?.model) console.log(`  model : ${color.magenta(String(info.body.model))}`);
  if (info.body?.system !== undefined) console.log(`  system: ${color.dim('有')}`);
  if (Array.isArray(info.body?.messages)) {
    console.log(`  msgs  : ${info.body.messages.length}`);
  }
  if (info.body?.stream !== undefined) {
    console.log(`  stream: ${info.body.stream ? color.yellow('true') : 'false'}`);
  }

  // cache_control 高亮摘要
  if (analysis.markedMessages > 0) {
    const summary = analysis.hits.map((h) => `${h.label}:${h.type}`).join(', ');
    console.log(
      `  ${color.hi(` cache_control × ${analysis.hits.length} `)} ${color.yellow(summary)}`,
    );
  } else {
    console.log(`  ${color.dim('cache_control: 无')}`);
  }
  if (analysis.leftoverTag) {
    console.log(
      color.red('  ⚠ 正文仍残留 <Cache_control> 标签 —— 剥离可能未生效！'),
    );
  }

  // 完整请求体
  const pretty = cfg.prettyBody
    ? JSON.stringify(info.body, null, 2)
    : info.raw;
  console.log(color.dim('  ── body ──'));
  console.log(indent(pretty, 2));

  return analysis;
}

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n);
  return s
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}
