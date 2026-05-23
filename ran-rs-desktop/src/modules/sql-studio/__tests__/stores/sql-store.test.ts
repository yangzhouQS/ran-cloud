import { createPinia, setActivePinia } from "pinia";
/**
 * sql-store.test.ts — SQL Studio Pinia store 测试（Tier 2）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCommand, clearMockCommands, invoke } = await import("../__mocks__/tauri");
vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

const { useSqlStore } = await import("../../stores/sql-store");

describe("sQL Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearMockCommands();
  });

  it("has correct initial state", () => {
    const store = useSqlStore();
    expect(store.connections).toEqual([]);
    expect(store.activeConnectionId).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.executing).toBe(false);
    expect(store.currentResult).toBeNull();
    expect(store.queryHistory).toEqual([]);
  });

  it("refreshConnections populates connections", async () => {
    const mockConns = [
      { id: "c1", name: "PG", dbType: "postgresql", status: "disconnected" },
    ];
    const mockConfigs = [
      { id: "c1", name: "PG", dbType: "postgresql", ssl: { enabled: false, rejectUnauthorized: false }, ssh: { enabled: false, host: "", port: 22, user: "" } },
    ];
    mockCommand("sql_connection_list", () => mockConns);
    mockCommand("sql_storage_load_connections", () => mockConfigs);

    const store = useSqlStore();
    await store.refreshConnections();

    expect(store.connections).toEqual(mockConns);
    expect(store.loading).toBe(false);
  });

  it("refreshConnections handles errors", async () => {
    mockCommand("sql_connection_list", () => {
      throw new Error("DB error");
    });

    const store = useSqlStore();
    await store.refreshConnections();

    expect(store.error).toContain("DB error");
  });

  it("executeQuery skips empty SQL", async () => {
    const handler = vi.fn();
    mockCommand("sql_query_execute", handler);

    const store = useSqlStore();
    store.activeConnectionId = "c1";
    await store.executeQuery("   ");

    expect(handler).not.toHaveBeenCalled();
  });

  it("executeQuery skips when no active connection", async () => {
    const handler = vi.fn();
    mockCommand("sql_query_execute", handler);

    const store = useSqlStore();
    await store.executeQuery("SELECT 1");

    expect(handler).not.toHaveBeenCalled();
  });

  it("executeQuery succeeds with result", async () => {
    const mockResult = {
      columns: [{ name: "id" }],
      rows: [{ id: 1 }],
      executionTimeMs: 5,
    };
    mockCommand("sql_query_execute", () => mockResult);
    mockCommand("sql_storage_save_query_history", () => undefined);

    const store = useSqlStore();
    store.activeConnectionId = "c1";
    await store.executeQuery("SELECT 1");

    expect(store.currentResult).toEqual(mockResult);
    expect(store.executing).toBe(false);
  });

  it("executeQuery handles failure", async () => {
    mockCommand("sql_query_execute", () => {
      throw new Error("SQL syntax error");
    });
    mockCommand("sql_storage_save_query_history", () => undefined);

    const store = useSqlStore();
    store.activeConnectionId = "c1";
    await store.executeQuery("BAD SQL");

    expect(store.queryError).toContain("SQL syntax error");
    expect(store.executing).toBe(false);
  });

  it("activeConnection computed returns correct connection", async () => {
    const mockConns = [
      { id: "c1", name: "PG", dbType: "postgresql", status: "connected" },
      { id: "c2", name: "MySQL", dbType: "mysql", status: "disconnected" },
    ];
    mockCommand("sql_connection_list", () => mockConns);
    mockCommand("sql_storage_load_connections", () => []);

    const store = useSqlStore();
    await store.refreshConnections();
    store.activeConnectionId = "c1";

    expect(store.activeConnection?.id).toBe("c1");
  });

  it("connectedList computed filters connected only", async () => {
    const mockConns = [
      { id: "c1", name: "PG", dbType: "postgresql", status: "connected" },
      { id: "c2", name: "MySQL", dbType: "mysql", status: "disconnected" },
    ];
    mockCommand("sql_connection_list", () => mockConns);
    mockCommand("sql_storage_load_connections", () => []);

    const store = useSqlStore();
    await store.refreshConnections();

    expect(store.connectedList.length).toBe(1);
    expect(store.connectedList[0].id).toBe("c1");
  });

  it("disconnect clears activeConnectionId if same", async () => {
    mockCommand("sql_connection_close", () => undefined);
    mockCommand("sql_connection_list", () => [
      { id: "c1", name: "PG", dbType: "postgresql", status: "disconnected" },
    ]);
    mockCommand("sql_storage_load_connections", () => []);

    const store = useSqlStore();
    store.activeConnectionId = "c1";
    await store.disconnect("c1");

    expect(store.activeConnectionId).toBeNull();
  });

  it("clearResult resets result state", () => {
    const store = useSqlStore();
    store.currentResult = { columns: [], rows: [], executionTimeMs: 0 };
    store.queryError = "some error";

    store.clearResult();

    expect(store.currentResult).toBeNull();
    expect(store.queryError).toBeNull();
  });
});
