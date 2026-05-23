/**
 * sql-commands.test.ts — SQL 命令包装器测试（Tier 3）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @tauri-apps/api/core
const { mockCommand, clearMockCommands, invoke } = await import("../__mocks__/tauri");
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

// 动态导入被测模块（在 mock 之后）
const sqlCommands = await import("../../services/sql-commands");

describe("sQL Commands", () => {
  beforeEach(() => {
    clearMockCommands();
  });

  it("createConnection calls sql_connection_create", async () => {
    mockCommand("sql_connection_create", (args: any) => args.config.id);
    const id = await sqlCommands.createConnection({ id: "test", name: "Test" } as any);
    expect(id).toBe("test");
  });

  it("closeConnection calls sql_connection_close", async () => {
    const handler = vi.fn(() => undefined);
    mockCommand("sql_connection_close", handler);
    await sqlCommands.closeConnection("conn-1");
    expect(handler).toHaveBeenCalledWith({ id: "conn-1" });
  });

  it("listConnections calls sql_connection_list", async () => {
    const mockList = [{ id: "1", name: "Test", dbType: "sqlite", status: "connected" }];
    mockCommand("sql_connection_list", () => mockList);
    const result = await sqlCommands.listConnections();
    expect(result).toEqual(mockList);
  });

  it("testConnection calls sql_connection_test", async () => {
    mockCommand("sql_connection_test", () => true);
    const result = await sqlCommands.testConnection({ id: "x" } as any);
    expect(result).toBe(true);
  });

  it("saveConnection calls sql_connection_save", async () => {
    const handler = vi.fn(() => undefined);
    mockCommand("sql_connection_save", handler);
    await sqlCommands.saveConnection({ id: "x" } as any);
    expect(handler).toHaveBeenCalled();
  });

  it("deleteConnection calls sql_connection_delete", async () => {
    const handler = vi.fn(() => undefined);
    mockCommand("sql_connection_delete", handler);
    await sqlCommands.deleteConnection("conn-1");
    expect(handler).toHaveBeenCalledWith({ id: "conn-1" });
  });

  it("executeQuery calls sql_query_execute", async () => {
    const mockResult = { columns: [], rows: [], executionTimeMs: 10 };
    mockCommand("sql_query_execute", () => mockResult);
    const result = await sqlCommands.executeQuery({
      connectionId: "c1",
      sql: "SELECT 1",
    });
    expect(result).toEqual(mockResult);
  });

  it("loadSavedConnections calls sql_storage_load_connections", async () => {
    const mockConfigs = [{ id: "1", name: "Test" }];
    mockCommand("sql_storage_load_connections", () => mockConfigs);
    const result = await sqlCommands.loadSavedConnections();
    expect(result).toEqual(mockConfigs);
  });

  it("saveQueryHistory calls sql_storage_save_query_history", async () => {
    const handler = vi.fn(() => undefined);
    mockCommand("sql_storage_save_query_history", handler);
    await sqlCommands.saveQueryHistory({
      id: "h1",
      connectionId: "c1",
      sql: "SELECT 1",
      executedAt: "2024-01-01",
    });
    expect(handler).toHaveBeenCalled();
  });

  it("loadQueryHistory calls sql_storage_load_query_history", async () => {
    const mockHistory = [{ id: "h1", sql: "SELECT 1" }];
    mockCommand("sql_storage_load_query_history", () => mockHistory);
    const result = await sqlCommands.loadQueryHistory("c1", 10);
    expect(result).toEqual(mockHistory);
  });
});
