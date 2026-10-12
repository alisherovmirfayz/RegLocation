import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/reglocation_test?schema=public',
      MAIL_TRANSPORT: 'memory',
      INITIAL_DIRECTOR_EMAIL: 'owner@school.test',
      PUBLIC_MONITOR_URL: 'http://monitor.test',
      PUBLIC_APP_URL: 'http://app.test',
      STORAGE_DRIVER: 'database',
      SCHEDULER_INTERVAL_MS: '600000',
    },
  },
});
