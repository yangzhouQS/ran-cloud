// 手动创建 Pinia 实例
import { createPinia, setActivePinia } from "pinia";

/**
 * plugin-store.test.ts — 插件 Pinia store 测试（Tier 2）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCommand, clearMockCommands, invoke } = await import("../__mocks__/tauri");
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

// 动态导入
const { usePluginStore } = await import("../../plugin/stores/plugin-store");

describe("plugin Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearMockCommands();
  });

  it("has correct initial state", () => {
    const store = usePluginStore();
    expect(store.plugins).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("refreshPlugins populates plugins", async () => {
    const mockPlugins = [
      { manifest: { id: "p1", name: "Plugin 1" }, enabled: true, loadable: true, installPath: "/p1" },
      { manifest: { id: "p2", name: "Plugin 2" }, enabled: false, loadable: true, installPath: "/p2" },
    ];
    mockCommand("plugin_list", () => mockPlugins);

    const store = usePluginStore();
    await store.refreshPlugins();

    expect(store.plugins).toEqual(mockPlugins);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("refreshPlugins handles errors", async () => {
    mockCommand("plugin_list", () => {
      throw new Error("Network error");
    });

    const store = usePluginStore();
    await store.refreshPlugins();

    expect(store.plugins).toEqual([]);
    expect(store.error).toContain("Network error");
    expect(store.loading).toBe(false);
  });

  it("togglePlugin enables a plugin", async () => {
    mockCommand("plugin_enable", () => undefined);
    mockCommand("plugin_list", () => [
      { manifest: { id: "p1", name: "P1" }, enabled: false, loadable: true, installPath: "/p1" },
    ]);

    const store = usePluginStore();
    await store.refreshPlugins();
    await store.togglePlugin("p1", true);

    expect(store.plugins[0].enabled).toBe(true);
  });

  it("togglePlugin disables a plugin", async () => {
    mockCommand("plugin_disable", () => undefined);
    mockCommand("plugin_list", () => [
      { manifest: { id: "p1", name: "P1" }, enabled: true, loadable: true, installPath: "/p1" },
    ]);

    const store = usePluginStore();
    await store.refreshPlugins();
    await store.togglePlugin("p1", false);

    expect(store.plugins[0].enabled).toBe(false);
  });

  it("enabledPlugins computed filters correctly", async () => {
    mockCommand("plugin_list", () => [
      { manifest: { id: "p1", name: "P1" }, enabled: true, loadable: true, installPath: "/p1" },
      { manifest: { id: "p2", name: "P2" }, enabled: true, loadable: false, installPath: "/p2" },
      { manifest: { id: "p3", name: "P3" }, enabled: false, loadable: true, installPath: "/p3" },
    ]);

    const store = usePluginStore();
    await store.refreshPlugins();

    expect(store.enabledPlugins.length).toBe(1);
    expect(store.enabledPlugins[0].manifest.id).toBe("p1");
  });

  it("disabledPlugins computed filters correctly", async () => {
    mockCommand("plugin_list", () => [
      { manifest: { id: "p1", name: "P1" }, enabled: true, loadable: true, installPath: "/p1" },
      { manifest: { id: "p2", name: "P2" }, enabled: false, loadable: true, installPath: "/p2" },
    ]);

    const store = usePluginStore();
    await store.refreshPlugins();

    expect(store.disabledPlugins.length).toBe(1);
    expect(store.disabledPlugins[0].manifest.id).toBe("p2");
  });
});
