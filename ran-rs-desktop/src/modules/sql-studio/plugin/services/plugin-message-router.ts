/**
 * PluginMessageRouter — postMessage ↔ Tauri 桥接
 *
 * 核心职责：
 * 1. 监听 window message 事件，识别来自插件 iframe 的消息
 * 2. 将 Rust API 请求转发到 Tauri 后端（plugin_api_call）
 * 3. 将 UI API 请求在前端直接处理（剪贴板/通知/确认框）
 * 4. 将响应/通知回传到插件 iframe
 */

import type { PluginApiResponse, PluginNotification } from "../types/api";
import { open } from "@tauri-apps/plugin-shell";
import { ElMessageBox, ElNotification } from "element-plus";
import { isRustApi } from "../types/api";
import * as pluginCommands from "./plugin-commands";

/** iframe 注册信息 */
interface IframeRegistration {
  pluginId: string;
  viewId: string;
  connectionId: string;
  iframe: HTMLIFrameElement;
}

/**
 * 插件消息路由器（单例）
 * 管理所有插件 iframe 的消息通信
 */
class PluginMessageRouter {
  /** iframe 注册表：以 contentWindow 为 key */
  private iframes = new Map<MessageEventSource, IframeRegistration>();

  /** 绑定后的消息处理函数（用于移除监听） */
  private boundHandler: ((event: MessageEvent) => void) | null = null;

  /** 启动消息监听 */
  start(): void {
    if (this.boundHandler) {
      return;
    }
    this.boundHandler = this.handleMessage.bind(this);
    window.addEventListener("message", this.boundHandler);
  }

  /** 停止消息监听 */
  stop(): void {
    if (this.boundHandler) {
      window.removeEventListener("message", this.boundHandler);
      this.boundHandler = null;
    }
  }

  /** 注册插件 iframe */
  registerIframe(
    pluginId: string,
    viewId: string,
    connectionId: string,
    iframe: HTMLIFrameElement,
  ): void {
    if (iframe.contentWindow) {
      this.iframes.set(iframe.contentWindow, { pluginId, viewId, connectionId, iframe });
    }
  }

  /** 注销插件 iframe */
  unregisterIframe(iframe: HTMLIFrameElement): void {
    if (iframe.contentWindow) {
      this.iframes.delete(iframe.contentWindow);
    }
  }

  /** 向指定 iframe 发送消息 */
  postToIframe(iframe: HTMLIFrameElement, data: PluginApiResponse | PluginNotification): void {
    iframe.contentWindow?.postMessage(data, "*");
  }

  /** 向同一插件的所有 iframe 广播通知 */
  broadcast(pluginId: string, notification: PluginNotification): void {
    for (const [, reg] of this.iframes) {
      if (reg.pluginId === pluginId) {
        this.postToIframe(reg.iframe, notification);
      }
    }
  }

  /** 消息处理函数 */
  private async handleMessage(event: MessageEvent): Promise<void> {
    const data = event.data;
    if (!data || typeof data !== "object") {
      return;
    }

    // 查找发送消息的 iframe
    const registration = this.iframes.get(event.source as MessageEventSource);
    if (!registration) {
      return;
    }

    // 区分请求和通知
    if (data.id !== undefined && typeof data.id === "string") {
      // 有 id → 请求
      await this.handleRequest(registration, data);
    } else {
      // 无 id → 通知
      this.handleNotification(registration, data);
    }
  }

  /** 处理插件 API 请求 */
  private async handleRequest(
    reg: IframeRegistration,
    request: { id: string; name: string; args: Record<string, unknown> },
  ): Promise<void> {
    try {
      let response: PluginApiResponse;

      if (isRustApi(request.name)) {
        // Rust 后端 API：通过 Tauri invoke 转发
        response = await pluginCommands.pluginApiCall(
          reg.pluginId,
          reg.connectionId,
          request,
        );
      } else {
        // 前端 API：直接处理
        response = await this.handleFrontendApi(reg, request);
      }

      this.postToIframe(reg.iframe, response);
    } catch (e) {
      // Tauri invoke 失败
      const errorResponse: PluginApiResponse = {
        id: request.id,
        name: request.name,
        error: String(e),
      };
      this.postToIframe(reg.iframe, errorResponse);
    }
  }

  /** 处理前端 API 请求 */
  private async handleFrontendApi(
    reg: IframeRegistration,
    request: { id: string; name: string; args: Record<string, unknown> },
  ): Promise<PluginApiResponse> {
    const { id, name, args } = request;
    let result: unknown;
    let error: string | undefined;

    try {
      switch (name) {
        case "clipboardReadText": {
          result = await navigator.clipboard.readText();
          break;
        }
        case "clipboardWriteText": {
          await navigator.clipboard.writeText(String(args.text ?? ""));
          result = true;
          break;
        }
        case "notyInfo": {
          ElNotification.info({ message: String(args.message ?? "") });
          result = true;
          break;
        }
        case "notySuccess": {
          ElNotification.success({ message: String(args.message ?? "") });
          result = true;
          break;
        }
        case "notyError": {
          ElNotification.error({ message: String(args.message ?? "") });
          result = true;
          break;
        }
        case "notyWarning": {
          ElNotification.warning({ message: String(args.message ?? "") });
          result = true;
          break;
        }
        case "confirm": {
          try {
            await ElMessageBox.confirm(
              String(args.message ?? ""),
              String(args.title ?? "确认"),
              { confirmButtonText: "确定", cancelButtonText: "取消" },
            );
            result = true;
          } catch {
            result = false;
          }
          break;
        }
        case "getViewContext": {
          result = {
            pluginId: reg.pluginId,
            viewId: reg.viewId,
          };
          break;
        }
        case "openExternal": {
          const url = String(args.url ?? args.link ?? "");
          if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
            await open(url);
            result = true;
          } else {
            error = "仅允许打开 http/https 链接";
          }
          break;
        }
        default:
          error = `未知的 API 方法: ${name}`;
      }
    } catch (e) {
      error = String(e);
    }

    const response: PluginApiResponse = { id, name };
    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }
    return response;
  }

  /** 处理插件通知 */
  private handleNotification(
    reg: IframeRegistration,
    notification: { name: string; args: Record<string, unknown> },
  ): void {
    switch (notification.name) {
      case "windowEvent": {
        const { eventType, eventInitOptions } = notification.args;
        // 安全限制：仅允许 CustomEvent，防止任意构造函数调用
        if (eventType && typeof eventType === "string") {
          try {
            document.dispatchEvent(new CustomEvent(String(eventType), eventInitOptions as EventInit));
          } catch {
            // 忽略无效事件
          }
        }
        break;
      }
      case "broadcast": {
        this.broadcast(reg.pluginId, {
          name: "broadcast",
          args: { ...notification.args, fromViewId: reg.viewId },
        });
        break;
      }
      case "pluginError": {
        console.error(`[Plugin ${reg.pluginId}]`, notification.args.message ?? notification.args);
        break;
      }
      default:
        // 忽略未知通知
        break;
    }
  }
}

// 全局单例
let instance: PluginMessageRouter | null = null;

/** 获取 PluginMessageRouter 单例 */
export function getPluginMessageRouter(): PluginMessageRouter {
  if (!instance) {
    instance = new PluginMessageRouter();
    instance.start();
  }
  return instance;
}

export { PluginMessageRouter };
