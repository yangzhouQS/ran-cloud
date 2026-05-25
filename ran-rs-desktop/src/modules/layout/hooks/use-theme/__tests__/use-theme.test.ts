import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { resolvedTheme, themeMode, useTheme } from "../index";

vi.mock("../../../../_shared/use-module-bus", () => ({
  useModuleBus: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  themeMode.value = "system";
  resolvedTheme.value = "light";
});

describe("use-theme - setTheme", () => {
  it("sets dark mode and applies dark class", () => {
    const { setTheme } = useTheme();
    setTheme("dark");
    expect(themeMode.value).toBe("dark");
    expect(resolvedTheme.value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("ran-rs-desktop-theme")).toBe("dark");
  });

  it("sets light mode and removes dark class", () => {
    const { setTheme } = useTheme();
    setTheme("dark");
    setTheme("light");
    expect(resolvedTheme.value).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("sets system mode and resolves based on matchMedia", () => {
    const { setTheme } = useTheme();
    setTheme("system");
    expect(themeMode.value).toBe("system");
    expect(resolvedTheme.value).toBe("light");
  });

  it("persists theme to localStorage", () => {
    const { setTheme } = useTheme();
    setTheme("dark");
    expect(localStorage.getItem("ran-rs-desktop-theme")).toBe("dark");
  });
});

describe("use-theme - toggleTheme", () => {
  it("cycles light -> dark -> system -> light", () => {
    const { setTheme, toggleTheme } = useTheme();
    setTheme("light");
    toggleTheme();
    expect(themeMode.value).toBe("dark");
    toggleTheme();
    expect(themeMode.value).toBe("system");
    toggleTheme();
    expect(themeMode.value).toBe("light");
  });
});

describe("use-theme - isDark (reactive)", () => {
  it("isDark becomes true after setting dark (nextTick)", async () => {
    const { setTheme, isDark } = useTheme();
    setTheme("dark");
    await nextTick();
    expect(isDark.value).toBe(true);
  });

  it("isDark becomes false after setting light (nextTick)", async () => {
    const { setTheme, isDark } = useTheme();
    setTheme("dark");
    await nextTick();
    setTheme("light");
    await nextTick();
    expect(isDark.value).toBe(false);
  });
});

describe("use-theme - resolvedTheme directly", () => {
  it("resolvedTheme is dark when set dark", () => {
    const { setTheme } = useTheme();
    setTheme("dark");
    expect(resolvedTheme.value).toBe("dark");
  });

  it("resolvedTheme is light when set light", () => {
    const { setTheme } = useTheme();
    setTheme("light");
    expect(resolvedTheme.value).toBe("light");
  });
});

describe("use-theme - setupTheme", () => {
  it("does not throw", async () => {
    const { setupTheme } = await import("../index");
    expect(() => setupTheme()).not.toThrow();
  });
});
