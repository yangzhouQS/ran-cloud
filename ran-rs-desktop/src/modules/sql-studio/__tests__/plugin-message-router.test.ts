/**
 * plugin-message-router.test.ts — postMessage 桥接测试（Tier 2）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Element Plus
vi.mock('element-plus', () => ({
  ElNotification: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}));

// Mock @tauri-apps/plugin-shell
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

const { mockCommand, clearMockCommands, invoke } = await import('./__mocks__/tauri');
vi.mock('@tauri-apps/api/core', () => ({
  invoke,
}));

// Mock plugin-commands
vi.mock('../plugin/services/plugin-commands', () => ({
  pluginApiCall: vi.fn(),
}));

import { PluginMessageRouter } from '../plugin/services/plugin-message-router';
import { pluginApiCall } from '../plugin/services/plugin-commands';
import { ElNotification, ElMessageBox } from 'element-plus';
import { open } from '@tauri-apps/plugin-shell';

function createMockIframe() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  return iframe;
}

function createMessageEvent(
  source: MessageEventSource | null,
  data: Record<string, unknown>,
): MessageEvent {
  return new MessageEvent('message', {
    data,
    source: source as Window,
  });
}

describe('PluginMessageRouter', () => {
  let router: PluginMessageRouter;

  beforeEach(() => {
    router = new PluginMessageRouter();
    router.start();
    clearMockCommands();
    vi.clearAllMocks();
  });

  afterEach(() => {
    router.stop();
  });

  it('registers and unregisters iframes', () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);
    // 注册后 source 映射存在
    expect(iframe.contentWindow).toBeTruthy();

    router.unregisterIframe(iframe);
    // 注销后不再处理该 iframe 的消息
  });

  it('ignores messages from unregistered sources', async () => {
    const event = createMessageEvent(null, {
      id: 'req-1', name: 'getTables', args: {},
    });
    // Should not throw
    window.dispatchEvent(event as any);
  });

  it('routes Rust API requests to pluginApiCall', async () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    const mockResponse = { id: 'req-1', name: 'getTables', result: [] };
    (pluginApiCall as any).mockResolvedValue(mockResponse);

    const postSpy = vi.spyOn(iframe.contentWindow!, 'postMessage');

    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        id: 'req-1', name: 'getTables', args: { schema: null },
      });
      window.dispatchEvent(event as any);
    }

    // Wait for async handling
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(pluginApiCall).toHaveBeenCalledWith(
      'plugin-1', 'conn-1',
      { id: 'req-1', name: 'getTables', args: { schema: null } },
    );
  });

  it('handles getViewContext frontend API', async () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    const postSpy = vi.spyOn(iframe.contentWindow!, 'postMessage');

    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        id: 'req-2', name: 'getViewContext', args: {},
      });
      window.dispatchEvent(event as any);
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-2',
        result: { pluginId: 'plugin-1', viewId: 'view-1' },
      }),
      '*',
    );
  });

  it('handles openExternal with valid URL', async () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        id: 'req-3', name: 'openExternal', args: { url: 'https://example.com' },
      });
      window.dispatchEvent(event as any);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(open).toHaveBeenCalledWith('https://example.com');
  });

  it('rejects openExternal with invalid URL', async () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    const postSpy = vi.spyOn(iframe.contentWindow!, 'postMessage');

    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        id: 'req-4', name: 'openExternal', args: { url: 'ftp://evil.com' },
      });
      window.dispatchEvent(event as any);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-4',
        error: expect.stringContaining('http'),
      }),
      '*',
    );
  });

  it('handles notyInfo notification', async () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    // Register listener BEFORE dispatching events
    const listener = vi.fn();
    document.addEventListener('custom-event', listener);

    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        name: 'windowEvent', args: { eventType: 'custom-event' },
      });
      window.dispatchEvent(event as any);
    }

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(listener).toHaveBeenCalled();
    document.removeEventListener('custom-event', listener);
  });

  it('handles pluginError notification', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        name: 'pluginError', args: { message: 'Something went wrong' },
      });
      window.dispatchEvent(event as any);
    }

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugin plugin-1'),
      'Something went wrong',
    );
    consoleSpy.mockRestore();
  });

  it('handles unknown notification gracefully', async () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    // Should not throw
    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        name: 'unknownNotification', args: {},
      });
      window.dispatchEvent(event as any);
    }

    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it('handles unknown frontend API method', async () => {
    const iframe = createMockIframe();
    router.registerIframe('plugin-1', 'view-1', 'conn-1', iframe);

    const postSpy = vi.spyOn(iframe.contentWindow!, 'postMessage');

    if (iframe.contentWindow) {
      const event = createMessageEvent(iframe.contentWindow, {
        id: 'req-5', name: 'unknownMethod', args: {},
      });
      window.dispatchEvent(event as any);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'req-5',
        error: expect.stringContaining('未知'),
      }),
      '*',
    );
  });
});
