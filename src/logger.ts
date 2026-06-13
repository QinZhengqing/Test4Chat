import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { baseDir } from './paths';
import type { Config } from './config';

/**
 * 把单次请求落盘为一行 JSON（JSONL 格式），按天分文件，方便事后 diff。
 * 失败仅告警，不影响主流程。
 */
export function logRequest(cfg: Config, record: unknown): void {
  if (!cfg.logToFile) return;
  try {
    const dir = isAbsolute(cfg.logDir) ? cfg.logDir : join(baseDir(), cfg.logDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const file = join(dir, `requests-${day}.jsonl`);
    appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    console.error(`[logger] 写日志失败: ${(err as Error).message}`);
  }
}
