/**
 * 主题管理 Composable
 *
 * 功能：
 * - 浅色/深色/跟随系统 三种模式
 * - 主题偏好持久化到 localStorage
 * - 通过 CSS 变量 + Element Plus dark class 控制主题
 * - 通过模块总线广播主题变更事件
 */

import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useModuleBus } from '../../modules/_shared/use-module-bus';

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** localStorage 存储键 */
const THEME_STORAGE_KEY = 'ran-rs-desktop-theme';

/** 获取系统主题偏好 */
function getSystemTheme(): 'light' | 'dark' {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/** 获取存储的主题模式 */
function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

/** 应用主题到 DOM */
function applyTheme(resolvedTheme: 'light' | 'dark'): void {
  const html = document.documentElement;

  if (resolvedTheme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  // 更新 meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', resolvedTheme === 'dark' ? '#1a1a2e' : '#ffffff');
  }
}

/** 全局主题状态（单例） */
const themeMode = ref<ThemeMode>(getStoredTheme());
const resolvedTheme = ref<'light' | 'dark'>('light');

/** 系统主题变化监听器 */
let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null;

/** 初始化主题系统 */
function initTheme(): void {
  // 计算初始解析主题
  const systemTheme = getSystemTheme();
  resolvedTheme.value = themeMode.value === 'system' ? systemTheme : themeMode.value;
  applyTheme(resolvedTheme.value);

  // 监听系统主题变化
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemThemeHandler = (e: MediaQueryListEvent) => {
    if (themeMode.value === 'system') {
      resolvedTheme.value = e.matches ? 'dark' : 'light';
      applyTheme(resolvedTheme.value);
    }
  };
  mediaQuery.addEventListener('change', systemThemeHandler);
}

/** 主题管理 composable */
export function useTheme() {
  const bus = useModuleBus();

  /** 设置主题模式 */
  function setTheme(mode: ThemeMode): void {
    themeMode.value = mode;
    localStorage.setItem(THEME_STORAGE_KEY, mode);

    const systemTheme = getSystemTheme();
    resolvedTheme.value = mode === 'system' ? systemTheme : mode;
    applyTheme(resolvedTheme.value);

    // 广播主题变更事件
    bus.emit('app:theme:change', resolvedTheme.value);
  }

  /** 切换主题（light → dark → system → light） */
  function toggleTheme(): void {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIndex = modes.indexOf(themeMode.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    setTheme(modes[nextIndex]);
  }

  /** 是否为深色模式 */
  const isDark = ref(resolvedTheme.value === 'dark');

  // 监听解析主题变化
  const stopWatch = watch(resolvedTheme, (val) => {
    isDark.value = val === 'dark';
  });

  onUnmounted(() => {
    stopWatch();
  });

  return {
    /** 当前主题模式 */
    themeMode,
    /** 解析后的主题（light/dark） */
    resolvedTheme,
    /** 是否为深色模式 */
    isDark,
    /** 设置主题模式 */
    setTheme,
    /** 切换主题 */
    toggleTheme,
  };
}

/** 自动初始化主题（在 main.ts 中调用） */
export function setupTheme(): void {
  initTheme();
}

export { themeMode, resolvedTheme };
