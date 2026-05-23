//! SQL Studio 插件模型缺口测试
use ran_rs_desktop_lib::modules::sql_studio::plugin::models::*;

#[test]
fn plugin_view_type_rename() {
    let view = PluginView {
        id: "main".to_string(),
        name: "Main View".to_string(),
        view_type: "shell-tab".to_string(),
        entry: "index.html".to_string(),
    };
    let json = serde_json::to_string(&view).unwrap();
    // view_type field serializes as "type" due to #[serde(rename = "type")]
    assert!(json.contains("\"type\""));
    assert!(!json.contains("\"viewType\""));
    assert!(json.contains("\"shell-tab\""));
}

#[test]
fn plugin_menu_item_serde() {
    let item = PluginMenuItem {
        command: "cmd-1".to_string(),
        name: "Action".to_string(),
        view: "view-1".to_string(),
        placement: "toolbar".to_string(),
    };
    let json = serde_json::to_string(&item).unwrap();
    let back: PluginMenuItem = serde_json::from_str(&json).unwrap();
    assert_eq!(back.command, "cmd-1");
    assert_eq!(back.view, "view-1");
}

#[test]
fn plugin_capabilities_default_menu() {
    let json = r#"{"views":[{"type":"table","id":"main","name":"Main","entry":"index.html"}]}"#;
    let caps: PluginCapabilities = serde_json::from_str(json).unwrap();
    assert_eq!(caps.views.len(), 1);
    assert!(caps.menu.is_empty()); // default = empty vec
}

#[test]
fn plugin_metadata_serde() {
    let manifest = PluginManifest {
        id: "p1".to_string(),
        name: "Plugin One".to_string(),
        version: "1.0.0".to_string(),
        description: "Test plugin".to_string(),
        author: None,
        min_app_version: None,
        icon: Some("star".to_string()),
        manifest_version: 1,
        plugin_entry_dir: None,
        capabilities: PluginCapabilities {
            views: vec![],
            menu: vec![],
        },
    };
    let meta = PluginMetadata {
        manifest,
        enabled: true,
        loadable: true,
        install_path: "/plugins/p1".to_string(),
    };
    let json = serde_json::to_string(&meta).unwrap();
    assert!(json.contains("\"id\"")); // manifest.id stays as "id"
    let back: PluginMetadata = serde_json::from_str(&json).unwrap();
    assert!(back.enabled);
    assert!(back.loadable);
}

#[test]
fn plugin_api_request_default_args() {
    let json = r#"{"id":"req-1","name":"getTables"}"#;
    let req: PluginApiRequest = serde_json::from_str(json).unwrap();
    assert_eq!(req.id, "req-1");
    // args defaults to empty object
    assert_eq!(req.args, serde_json::json!({}));
}

#[test]
fn plugin_api_response_ok_constructor() {
    let req = PluginApiRequest { id: "r1".to_string(), name: "test".to_string(), args: Default::default() };
    let resp = PluginApiResponse::ok(&req, serde_json::json!([1, 2, 3]));
    assert_eq!(resp.id, "r1");
    assert!(resp.result.is_some());
    assert!(resp.error.is_none());
}

#[test]
fn plugin_api_response_err_constructor() {
    let req = PluginApiRequest { id: "r1".to_string(), name: "test".to_string(), args: Default::default() };
    let resp = PluginApiResponse::err(&req, "Something failed".to_string());
    assert_eq!(resp.id, "r1");
    assert!(resp.result.is_none());
    assert_eq!(resp.error.as_deref(), Some("Something failed"));
}

#[test]
fn plugin_notification_serde() {
    let notif = PluginNotification {
        name: "windowEvent".to_string(),
        args: serde_json::json!({"eventType": "click"}),
    };
    let json = serde_json::to_string(&notif).unwrap();
    let back: PluginNotification = serde_json::from_str(&json).unwrap();
    assert_eq!(back.name, "windowEvent");
}
