import type { Server } from 'node:http';
import { color } from './colors';
import { configPath, loadConfig, watchConfig, type Config } from './config';
import { createApp } from './server';

// 在 Windows 控制台输出 UTF-8，避免中文乱码（等价 chcp 65001）。
if (process.platform === 'win32') {
  try {
    process.stdout.setDefaultEncoding?.('utf8');
  } catch {
    /* 忽略 */
  }
}

function banner(cfg: Config): void {
  const shown = cfg.host === '0.0.0.0' ? '127.0.0.1' : cfg.host;
  console.log(color.bold(color.green('\n  Test4Chat 请求打印服务器')));
  console.log(color.gray('  ' + '─'.repeat(46)));
  console.log(`  监听     : ${color.cyan(`${cfg.host}:${cfg.port}`)}`);
  console.log(`  端点 URL : ${color.green(`http://${shown}:${cfg.port}/v1`)}`);
  console.log(`  API Key  : ${cfg.apiKey ? color.yellow(cfg.apiKey) : color.dim('（未设置，不校验）')}`);
  console.log(`  假模型   : ${color.magenta(cfg.modelId)}`);
  console.log(`  配置文件 : ${color.dim(configPath())}`);
  console.log(`  日志落盘 : ${cfg.logToFile ? color.green('开') : color.dim('关')}`);
  console.log(`  热重载   : ${cfg.hotReload ? color.green('开') : color.dim('关')}`);
  console.log(color.gray('  ' + '─'.repeat(46)));
  console.log(color.dim('  关闭此窗口或按 Ctrl+C 即可停止服务。\n'));
}

function main(): void {
  let cfg: Config;
  try {
    cfg = loadConfig();
  } catch (err) {
    fatal(`配置错误: ${(err as Error).message}`);
    return;
  }

  // 热重载只更新 cfg 引用；server 每次请求都读取最新 cfg。
  // host/port 变化需重启才生效，这里给出提示。
  const watcher = cfg.hotReload
    ? watchConfig((next) => {
        if (next.host !== cfg.host || next.port !== cfg.port) {
          console.log(color.yellow('  注意: host/port 变更需重启进程才生效。'));
        }
        cfg = next;
      })
    : null;

  const server: Server = createApp(() => cfg);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      fatal(`端口 ${cfg.port} 已被占用。请改 config.yml 的 port，或关闭占用该端口的程序。`);
    } else {
      fatal(`服务器启动失败: ${err.message}`);
    }
  });

  server.listen(cfg.port, cfg.host, () => banner(cfg));

  const shutdown = (signal: string) => {
    console.log(color.dim(`\n收到 ${signal}，正在关闭…`));
    watcher?.close();
    server.close(() => process.exit(0));
    // 兜底：2 秒内未正常关闭则强制退出。
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function fatal(msg: string): void {
  console.error(color.red(`\n  ✗ ${msg}\n`));
  // 打包成 exe 双击运行时，留出时间让用户看清错误再退出。
  const isPackaged = Boolean((process as unknown as { pkg?: unknown }).pkg);
  if (isPackaged) {
    console.error(color.dim('  （5 秒后自动关闭窗口）'));
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(1);
  }
}

main();
