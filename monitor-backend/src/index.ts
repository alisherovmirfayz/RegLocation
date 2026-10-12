import { loadConfig } from './config';
import { createContext, startServer, VERSION } from './app';
import { logger, setLogLevel } from './lib/logger';

async function main() {
  const config = loadConfig();
  setLogLevel(config.LOG_LEVEL);
  const ctx = createContext(config);
  await ctx.prisma.$connect();
  const running = await startServer(ctx);
  logger.info('RegLocation запущен', {
    port: config.PORT,
    version: VERSION,
    env: config.NODE_ENV,
    origins: config.allowedOrigins,
    storage: config.STORAGE_DRIVER,
    mail: config.MAIL_TRANSPORT,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('Остановка сервера', { signal });
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    try {
      await running.close();
      await ctx.prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (e) => logger.error('Unhandled rejection', { err: String((e as Error)?.stack ?? e) }));
}

main().catch((e) => {
  logger.error('Не удалось запустить сервер', { err: String((e as Error)?.stack ?? e) });
  process.exit(1);
});
