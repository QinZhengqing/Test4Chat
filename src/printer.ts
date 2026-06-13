import { color } from './colors';
import type { Config } from './config';

export interface CacheAnalysis {
  /** 带 cache_control 标记的消息条数 */
  markedMessages: number;
  /** 命中的 cache_control 位置摘要（消息下标 + type） */
  hits: Array<{ index: number; type: string }>;
  /** 请求正文里是否仍残留 <Cache_control> 字样（剥离失败的信号） */
  leftoverTag: boolean;
}

const TAG_RE = /<\s*cache_control\b/i;

/**
 * 扫描 OpenAI/Anthropic 风格的消息数组，统计 cache_control 注入情况，
 * 并检测正文里是否还残留 <Cache_control> 原始标签。
 */
export function analyzeCache(body: any): CacheAnalysis {
  const result: CacheAnalysis = { markedMessages: 0, hits: [], leftoverTag: false };
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  messages.forEach((msg: any, index: number) => {
    let marked = false;

    if (msg && typeof msg === 'object' && msg.cache_control) {
      marked = true;
      result.hits.push({ index, type: String(msg.cache_control.type ?? '?') });
    }
    // content 可能是字符串，或 [{type:'text', text, cache_control}] 数组
    if (Array.isArray(msg?.content)) {
      for (const part of msg.content) {
        if (part && typeof part === 'object' && part.cache_control) {
          marked = true;
          result.hits.push({ index, type: String(part.cache_control.type ?? '?') });
        }
        if (typeof part?.text === 'string' && TAG_RE.test(part.text)) {
          result.leftoverTag = true;
        }
      }
    } else if (typeof msg?.content === 'string' && TAG_RE.test(msg.content)) {
      result.leftoverTag = true;
    }

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
  if (Array.isArray(info.body?.messages)) {
    console.log(`  msgs  : ${info.body.messages.length}`);
  }
  if (info.body?.stream !== undefined) {
    console.log(`  stream: ${info.body.stream ? color.yellow('true') : 'false'}`);
  }

  // cache_control 高亮摘要
  if (analysis.markedMessages > 0) {
    const summary = analysis.hits
      .map((h) => `#${h.index}:${h.type}`)
      .join(', ');
    console.log(
      `  ${color.hi(` cache_control × ${analysis.markedMessages} `)} ${color.yellow(summary)}`,
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
