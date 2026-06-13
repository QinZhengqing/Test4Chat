import { existsSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { color } from './colors';
import { baseDir } from './paths';

export interface Config {
  host: string;
  port: number;
  apiKey: string;
  replyText: string;
  modelId: string;
  hotReload: boolean;
  logToFile: boolean;
  logDir: string;
  prettyBody: boolean;
}

const DEFAULTS: Config = {
  host: '0.0.0.0',
  port: 8052,
  apiKey: '',
  replyText: '[Test4Chat] 请求已捕获并打印到控制台。',
  modelId: 'Claude-Test',
  hotReload: true,
  logToFile: true,
  logDir: 'logs',
  prettyBody: true,
};

/** 用户配置文件路径（exe / 项目根目录下的 config.yml） */
export function configPath(): string {
  return join(baseDir(), 'config.yml');
}

/**
 * 若 config.yml 不存在，则从打包进 exe 的 config.default.yml 释放一份。
 * 开发态下 config.default.yml 与脚本同处一目录的上层（项目根），直接复制即可。
 */
function ensureConfigFile(): void {
  const target = configPath();
  if (existsSync(target)) return;

  // pkg 会把 config.default.yml 作为 snapshot 资源打进 exe；__dirname 在
  // 打包态指向 snapshot 路径，开发态指向 dist/，二者上层都能找到默认文件。
  const candidates = [
    join(__dirname, '..', 'config.default.yml'),
    join(baseDir(), 'config.default.yml'),
  ];
  for (const src of candidates) {
    if (existsSync(src)) {
      writeFileSync(target, readFileSync(src));
      console.log(color.green(`已生成默认配置: ${target}`));
      return;
    }
  }
  // 兜底：写入内置默认值的简版（极少触发）
  writeFileSync(target, `host: ${DEFAULTS.host}\nport: ${DEFAULTS.port}\n`);
}

/** 读取并校验配置；校验失败抛出可读错误。 */
export function loadConfig(): Config {
  ensureConfigFile();
  const raw = parse(readFileSync(configPath(), 'utf8')) ?? {};

  const cfg: Config = {
    host: str(raw.host, DEFAULTS.host),
    port: num(raw.port, DEFAULTS.port),
    apiKey: str(raw.api_key, DEFAULTS.apiKey),
    replyText: str(raw.reply_text, DEFAULTS.replyText),
    modelId: str(raw.model_id, DEFAULTS.modelId),
    hotReload: bool(raw.hot_reload, DEFAULTS.hotReload),
    logToFile: bool(raw.log_to_file, DEFAULTS.logToFile),
    logDir: str(raw.log_dir, DEFAULTS.logDir),
    prettyBody: bool(raw.pretty_body, DEFAULTS.prettyBody),
  };

  validate(cfg);
  return cfg;
}

function validate(cfg: Config): void {
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    throw new Error(`port 非法: ${cfg.port}（需为 1-65535 的整数）`);
  }
  if (!cfg.host) throw new Error('host 不能为空');
}

/**
 * 监听 config.yml 变化并回调最新配置。重载失败（如 YAML 写坏）会打印
 * 错误并沿用旧配置，不致进程崩溃。返回关闭监听的函数。
 */
export function watchConfig(onChange: (cfg: Config) => void): FSWatcher | null {
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher;
  try {
    watcher = watch(configPath(), () => {
      // 编辑器保存常触发多次事件，去抖。
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          onChange(loadConfig());
          console.log(color.cyan('配置已热重载 ✓'));
        } catch (err) {
          console.error(
            color.red(`配置重载失败，沿用旧配置: ${(err as Error).message}`),
          );
        }
      }, 150);
    });
  } catch {
    return null;
  }
  return watcher;
}

function str(v: unknown, dflt: string): string {
  return v === undefined || v === null ? dflt : String(v);
}
function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function bool(v: unknown, dflt: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', '1', 'yes', 'on'].includes(v.toLowerCase());
  return dflt;
}
