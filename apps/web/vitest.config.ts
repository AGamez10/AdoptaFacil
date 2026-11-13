import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { contractsSourceAlias } from './vite.config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: contractsSourceAlias },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
