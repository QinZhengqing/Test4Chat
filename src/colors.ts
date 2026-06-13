/**
 * 极简 ANSI 颜色工具。无第三方依赖，便于 pkg 打包。
 * 通过 NO_COLOR 环境变量可全局禁用着色（遵循 https://no-color.org/）。
 */

const enabled = !process.env.NO_COLOR;

function wrap(open: number, close: number) {
  return (s: string): string =>
    enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;
}

export const color = {
  reset: '\x1b[0m',
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  /** 黄底黑字高亮，用于突出 cache_control */
  hi: wrap(43, 30),
};
