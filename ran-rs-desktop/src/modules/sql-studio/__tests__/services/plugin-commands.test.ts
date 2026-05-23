/**
 * plugin-commands.test.ts — 插件命令包装器测试（Tier 3）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCommand, clearMockCommands, invoke } = await import("../__mocks__/tauri");
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

const pluginCommands = await import("../../plugin/services/plugin-commands");

describe("plugin Commands", () => {
  beforeEach(() => {
    clearMockCommands();
  });

  it("listPlugins calls plugin_list", async () => {
    const mockList = [{ manifest: { id: "p1" }, enabled: true }];
    mockCommand("plugin_list", () => mockList);
    const result = await pluginCommands.listPlugins();
    expect(result).toEqual(mockList);
  });

  it("getPluginManifest calls plugin_get_manifest", async () => {
    const mockManifest = { id: "p1", name: "Test" };
    mockCommand("plugin_get_manifest", (_args: any) => mockManifest);
    const result = await pluginCommands.getPluginManifest("p1");
    expect(result).toEqual(mockManifest);
  });

  it("enablePlugin calls plugin_enable", async () => {
    const handler = vi.fn(() => undefined);
    mockCommand("plugin_enable", handler);
    await pluginCommands.enablePlugin("p1");
    expect(handler).toHaveBeenCalledWith({ id: "p1" });
  });

  it("disablePlugin calls plugin_disable", async () => {
    const handler = vi.fn(() => undefined);
    mockCommand("plugin_disable", handler);
    await pluginCommands.disablePlugin("p1");
    expect(handler).toHaveBeenCalledWith({ id: "p1" });
  });

  it("pluginApiCall calls plugin_api_call with correct params", async () => {
    const mockResponse = { id: "r1", name: "getTables", result: [] };
    mockCommand("plugin_api_call", () => mockResponse);
    const request = { id: "r1", name: "getTables", args: {} };
    const result = await pluginCommands.pluginApiCall("p1", "c1", request);
    expect(result).toEqual(mockResponse);
  });
});
