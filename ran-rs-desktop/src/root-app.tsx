/**
 * 根应用组件
 *
 * 仅包含 <router-view>，作为 Vue Router 的根容器。
 * 各页面由路由配置决定渲染哪个组件。
 */

import { defineComponent } from "vue";

const RootApp = defineComponent({
  name: "RootApp",
  setup() {
    return () => (
      <router-view />
    );
  },
});

export default RootApp;
