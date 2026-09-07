import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/web/**/*.test.ts', 'src/web/**/*.test.tsx', 'src/shared/**/*.test.ts'],
          setupFiles: ['./test/setupWebStorage.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest(async () => {
            const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
            return {
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  SYNC_ENC_KEY: 'dGVzdC1rZXktMzItYnl0ZXMtbG9uZy0wMDAwMDAwMDA=',
                },
              },
            };
          }),
        ],
        test: {
          name: 'worker',
          include: ['src/worker/**/*.test.ts'],
          setupFiles: ['./test/apply-migrations.ts'],
        },
      },
    ],
  },
});
