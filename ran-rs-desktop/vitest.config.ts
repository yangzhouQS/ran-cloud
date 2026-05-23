import { defineConfig } from 'vitest/config';
import { pluginVue } from '@rsbuild/plugin-vue';
import { pluginVueJsx } from '@rsbuild/plugin-vue-jsx';

export default defineConfig({
  plugins: [
    pluginVue(),
    pluginVueJsx(),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
