import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { baseDir } from './paths';
import type { Config } from './config';

/** 同一毫秒内多次请求时用于文件名去重的计数器。 */
let seq = 0;

/** 把文件名里的非法字符替换掉（Windows 不允许 : 等）。 */
function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
  );
}

/**
 * 把单次请求落盘为**独立的一个文件**，内容为缩进展开的 JSON（便于直接阅读）。
 * 文件名形如：2026-06-13_11-08-27-342_0.json
 * 失败仅告警，不影响主流程。
 */
export function logRequest(cfg: Config, record: unknown): void {
  if (!cfg.logToFile) return;
  try {
    const dir = isAbsolute(cfg.logDir) ? cfg.logDir : join(baseDir(), cfg.logDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const name = `${stamp(new Date())}_${seq++}.json`;
    writeFileSync(join(dir, name), JSON.stringify(record, null, 2), 'utf8');
  } catch (err) {
    console.error(`[logger] 写日志失败: ${(err as Error).message}`);
  }
}
