import eslintConfig from "@cs/js-eslint-config-library";

export default eslintConfig({
  ignores: ["dist", "src/web-content/assets"],
  /* 需要格式化文件 */
  formatters: {
    css: true,
    html: true,
    markdown: "prettier",
  },
  typescript: true,
  vue: true,
  stylistic: {
    /* indent: 2,
    quotes: "double",
    semi: true,
    jsx: true */
  },
  // 自定义验证规则
  rules: {
    "no-console": "off", /* 允许使用console.log */
  },
});
