// modules/sql_studio/plugin/protocol.rs — plugin:// 自定义协议处理器
// 从本地文件系统加载插件资源（HTML/JS/CSS），提供 iframe 沙箱隔离

use std::sync::Arc;

use tauri::{AppHandle, Manager, UriSchemeContext};
use tauri::http::{Request, Response, StatusCode, header};

use super::manager::PluginManager;

/// MIME 类型映射
fn mime_type_for_path(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".html") || lower.ends_with(".htm") {
        "text/html"
    } else if lower.ends_with(".js") || lower.ends_with(".mjs") {
        "application/javascript"
    } else if lower.ends_with(".css") {
        "text/css"
    } else if lower.ends_with(".json") {
        "application/json"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".ico") {
        "image/x-icon"
    } else if lower.ends_with(".wasm") {
        "application/wasm"
    } else if lower.ends_with(".map") {
        "application/json"
    } else if lower.ends_with(".woff") {
        "font/woff"
    } else if lower.ends_with(".woff2") {
        "font/woff2"
    } else if lower.ends_with(".ttf") {
        "font/ttf"
    } else {
        "application/octet-stream"
    }
}

/// 创建 plugin:// 协议处理器
/// Tauri v2 签名: Fn(UriSchemeContext, Request<Vec<u8>>) -> Response<Vec<u8>>
pub fn create_plugin_protocol<R: tauri::Runtime>() ->
    impl Fn(UriSchemeContext<'_, R>, Request<Vec<u8>>) -> Response<Vec<u8>>
{
    move |ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>| {
        handle_plugin_request(ctx.app_handle().clone(), &request)
    }
}

fn handle_plugin_request<R: tauri::Runtime>(
    app: AppHandle<R>,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri().to_string();

    // 解析 URI: 不同平台格式不同
    // - macOS/Linux: plugin://localhost/plugin-id/path
    // - Windows: http://plugin.localhost/plugin-id/path
    let path_part = uri
        .trim_start_matches("plugin://")
        .trim_start_matches("http://plugin.localhost")
        .trim_start_matches("plugin.localhost");

    // 去掉 localhost/ 前缀 (macOS/Linux)
    let path_part = if path_part.starts_with("localhost/") {
        &path_part["localhost/".len()..]
    } else if path_part.starts_with('/') {
        &path_part[1..]
    } else {
        path_part
    };

    // 分割 plugin_id 和相对路径
    let (plugin_id, relative_path) = match path_part.find('/') {
        Some(idx) => (&path_part[..idx], &path_part[idx + 1..]),
        None => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body("Invalid plugin URL".as_bytes().to_vec())
                .unwrap();
        }
    };

    let relative_path = if relative_path.is_empty() {
        "index.html"
    } else {
        relative_path
    };

    // 获取 PluginManager
    let manager = match app.try_state::<Arc<PluginManager>>() {
        Some(m) => m.inner().clone(),
        None => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body("Plugin manager not initialized".as_bytes().to_vec())
                .unwrap();
        }
    };

    // 解析安全路径
    let asset_path = match manager.resolve_asset_path(plugin_id, relative_path) {
        Ok(path) => path,
        Err(e) => {
            let status = match &e {
                crate::shared::error::AppError::Forbidden(_) => StatusCode::FORBIDDEN,
                crate::shared::error::AppError::NotFound(_) => StatusCode::NOT_FOUND,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            };
            // 不泄漏内部错误详情，仅返回通用错误信息
            let body = match status {
                StatusCode::FORBIDDEN => "Access denied",
                StatusCode::NOT_FOUND => "Not found",
                _ => "Internal error",
            };
            return Response::builder()
                .status(status)
                .body(body.as_bytes().to_vec())
                .unwrap();
        }
    };

    // 读取文件
    let bytes = match std::fs::read(&asset_path) {
        Ok(b) => b,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body("File not found".as_bytes().to_vec())
                .unwrap();
        }
    };

    let mime = mime_type_for_path(relative_path);

    // HTML 文件添加 CSP 头实现沙箱隔离
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header("Cache-Control", "no-cache");

    if mime == "text/html" {
        builder = builder.header(
            header::CONTENT_SECURITY_POLICY,
            "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self';"
        );
    }

    builder.body(bytes).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_html() { assert_eq!(mime_type_for_path("index.html"), "text/html"); }
    #[test]
    fn mime_htm() { assert_eq!(mime_type_for_path("page.htm"), "text/html"); }
    #[test]
    fn mime_js() { assert_eq!(mime_type_for_path("app.js"), "application/javascript"); }
    #[test]
    fn mime_mjs() { assert_eq!(mime_type_for_path("mod.mjs"), "application/javascript"); }
    #[test]
    fn mime_css() { assert_eq!(mime_type_for_path("style.css"), "text/css"); }
    #[test]
    fn mime_json() { assert_eq!(mime_type_for_path("data.json"), "application/json"); }
    #[test]
    fn mime_png() { assert_eq!(mime_type_for_path("img.png"), "image/png"); }
    #[test]
    fn mime_jpg() { assert_eq!(mime_type_for_path("img.jpg"), "image/jpeg"); }
    #[test]
    fn mime_jpeg() { assert_eq!(mime_type_for_path("img.jpeg"), "image/jpeg"); }
    #[test]
    fn mime_svg() { assert_eq!(mime_type_for_path("icon.svg"), "image/svg+xml"); }
    #[test]
    fn mime_gif() { assert_eq!(mime_type_for_path("anim.gif"), "image/gif"); }
    #[test]
    fn mime_ico() { assert_eq!(mime_type_for_path("favicon.ico"), "image/x-icon"); }
    #[test]
    fn mime_wasm() { assert_eq!(mime_type_for_path("module.wasm"), "application/wasm"); }
    #[test]
    fn mime_map() { assert_eq!(mime_type_for_path("app.js.map"), "application/json"); }
    #[test]
    fn mime_woff() { assert_eq!(mime_type_for_path("font.woff"), "font/woff"); }
    #[test]
    fn mime_woff2() { assert_eq!(mime_type_for_path("font.woff2"), "font/woff2"); }
    #[test]
    fn mime_ttf() { assert_eq!(mime_type_for_path("font.ttf"), "font/ttf"); }
    #[test]
    fn mime_unknown() { assert_eq!(mime_type_for_path("data.xyz"), "application/octet-stream"); }
    #[test]
    fn mime_case_insensitive() { assert_eq!(mime_type_for_path("INDEX.HTML"), "text/html"); }
    #[test]
    fn mime_empty() { assert_eq!(mime_type_for_path(""), "application/octet-stream"); }
}
