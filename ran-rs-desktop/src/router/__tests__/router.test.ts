/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";

// Mock all lazy-loaded component modules to avoid TSX compilation issues
vi.mock("../../app", () => ({ default: { name: "AppMock" } }));
vi.mock("../../modules/redis-desktop-manager", () => ({ default: { name: "RedisMock" } }));
vi.mock("../../pages/settings-page", () => ({ default: { name: "SettingsMock" } }));
vi.mock("../../pages/about-page", () => ({ default: { name: "AboutMock" } }));

describe("router - route definitions", () => {
  it("defines all 4 routes", async () => {
    const router = (await import("../index")).default;
    const routes = router.getRoutes();
    const paths = routes.map(r => r.path).sort();
    expect(paths).toEqual(["/", "/about", "/redis", "/settings"]);
  });

  it("home route has correct name and meta", async () => {
    const router = (await import("../index")).default;
    const r = router.getRoutes().find(r => r.path === "/");
    expect(r?.name).toBe("home");
    expect(r?.meta?.title).toBe("Ran RS Desktop");
  });

  it("redis route has correct name", async () => {
    const router = (await import("../index")).default;
    const r = router.getRoutes().find(r => r.path === "/redis");
    expect(r?.name).toBe("redis");
    expect(r?.meta?.title).toBe("Redis Desktop Manager");
  });

  it("settings route has correct name", async () => {
    const router = (await import("../index")).default;
    const r = router.getRoutes().find(r => r.path === "/settings");
    expect(r?.name).toBe("settings");
    expect(r?.meta?.title).toBe("设置");
  });

  it("about route has correct name", async () => {
    const router = (await import("../index")).default;
    const r = router.getRoutes().find(r => r.path === "/about");
    expect(r?.name).toBe("about");
    expect(r?.meta?.title).toBe("关于");
  });

  it("afterEach hook sets document title on navigation", async () => {
    const router = (await import("../index")).default;
    await router.push("/");
    await router.isReady();
    expect(document.title).toContain("Ran RS Desktop");
  });
});
