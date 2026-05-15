import { defineConfig } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginVue } from '@rsbuild/plugin-vue';
import { pluginVueJsx } from '@rsbuild/plugin-vue-jsx';

export default defineConfig({
  plugins: [pluginBabel({ include: /\.(jsx|tsx)$/ }), pluginVue(), pluginVueJsx()],
  source: {
    entry: {
      index: './src/main.ts',
    },
  },
  server: {
    port: 4420,
    strictPort: true,
  },
  html: {
    title: 'Ran RS Desktop',
    template: './index.html',
  },
  output: {
    distPath: {
      root: 'dist',
    },
    assetPrefix: '/',
  },
});
