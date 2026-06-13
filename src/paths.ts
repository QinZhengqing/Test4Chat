import { dirname } from 'node:path';

/**
 * 解析运行时的"基准目录"——用户可见、可编辑文件（config.yml、logs/）所在处。
 *
 * - 打包成 exe 后（pkg 注入 process.pkg）：基准目录 = exe 所在目录，
 *   这样用户能在 exe 旁边看到并编辑 config.yml。
 * - 开发态（node dist/index.js）：基准目录 = 当前工作目录（项目根）。
 */
export function baseDir(): string {
  const isPackaged = Boolean((process as unknown as { pkg?: unknown }).pkg);
  return isPackaged ? dirname(process.execPath) : process.cwd();
}
