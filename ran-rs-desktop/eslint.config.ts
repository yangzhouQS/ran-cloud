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
    /* 禁用：该规则会自动移除 JSX 中的 ref.value，但在 defineComponent render 函数中 ref 不会自动解包 */
    "vue/no-ref-as-operand": "off",
  },
});
