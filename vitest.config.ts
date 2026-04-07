import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**', '**/.next/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', '**/*.d.ts', 'src/lib/database.types.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/stubs/server-only.ts'),
      'dexie-react-hooks': path.resolve(__dirname, './src/test/stubs/dexie-react-hooks.ts'),
      'recharts': path.resolve(__dirname, './src/test/stubs/recharts.tsx'),
    },
  },
});
