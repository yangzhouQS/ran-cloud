import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './app';
import SettingsPage from './pages/settings-page';
import AboutPage from './pages/about-page';
import './assets/styles/index.css';

// 根据 URL hash 判断渲染哪个页面
const hash = window.location.hash || '#/';
let RootComponent;

if (hash === '#/settings') {
  RootComponent = SettingsPage;
} else if (hash === '#/about') {
  RootComponent = AboutPage;
} else {
  RootComponent = App;
}

const app = createApp(RootComponent);

// 注册 Element Plus
app.use(ElementPlus, { locale: zhCn });

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.mount('#root');
