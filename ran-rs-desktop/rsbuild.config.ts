import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginLess } from "@rsbuild/plugin-less";
import { pluginVue } from "@rsbuild/plugin-vue";
import { pluginVueJsx } from "@rsbuild/plugin-vue-jsx";

export default defineConfig({
  plugins: [
    pluginBabel({ include: /\.(jsx|tsx)$/ }),
    pluginVue(),
    pluginVueJsx(),
    pluginLess(),
  ],
  source: {
    entry: {
      "index": "./src/main.ts",
      "redis": "./src/modules/redis-desktop-manager/main.ts",
      "sql-studio": "./src/modules/sql-studio/main.ts",
      "settings": "./src/modules/settings/main.ts",
      "about": "./src/modules/about/main.ts",
    },
  },
  server: {
    port: 4421,
    strictPort: false,
  },
  html: {
    title: "Ran RS Desktop",
    template: "./index.html",
  },
  output: {
    distPath: {
      root: "dist",
    },
    assetPrefix: "/",
  },
  tools: {
    rspack: {
      output: {
        globalObject: "self",
      },
    },
  },
  dev: {
    // 禁用客户端 overlay，避免 Worker 加载错误
    client: {
      overlay: false,
    },
  },
});
