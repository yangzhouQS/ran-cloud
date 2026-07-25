//! 页面 trait 与路由。

use eframe::egui;
use tm_core::models::{Command, SystemSnapshot};

pub mod app_history_page;
pub mod details_page;
pub mod performance_page;
pub mod processes_page;
pub mod services_page;
pub mod startup_page;
pub mod users_page;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKind {
    Processes,
    Performance,
    AppHistory,
    StartupApps,
    Users,
    Details,
    Services,
}

impl PageKind {
    pub fn label(self) -> &'static str {
        match self {
            PageKind::Processes => "进程",
            PageKind::Performance => "性能",
            PageKind::AppHistory => "应用历史",
            PageKind::StartupApps => "启动应用",
            PageKind::Users => "用户",
            PageKind::Details => "详细信息",
            PageKind::Services => "服务",
        }
    }
}

pub trait Page {
    fn show(
        &self,
        ui: &mut egui::Ui,
        snap: &SystemSnapshot,
        search: &str,
        cmd_tx: &crossbeam_channel::Sender<Command>,
    );
}
