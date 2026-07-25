//! App 状态:持有快照存储、命令通道、当前 Tab、Mica 标记、提权状态。

use std::time::Duration;

use crossbeam_channel::Sender;
use eframe::egui;
use tm_core::collector::{self, SnapshotStore};
use tm_core::models::Command;

use crate::pages::{PageKind, processes_page::ProcessesPage, Page};
use crate::shell;
use crate::theme;

pub struct App {
    pub store: SnapshotStore,
    pub cmd_tx: Sender<Command>,
    pub mica_applied: bool,
    pub current: PageKind,
    pub search: String,
    pub elevated: bool,
}

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let ctx = cc.egui_ctx.clone();
        let (store, cmd_tx) = collector::spawn(
            Duration::from_secs(1),
            false,
            Box::new(move || ctx.request_repaint()),
        );
        Self {
            store,
            cmd_tx,
            mica_applied: false,
            current: PageKind::Processes,
            search: String::new(),
            elevated: false,
        }
    }
}

impl eframe::App for App {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        theme::install(ctx);
        apply_mica_once(self, frame);

        shell::top_bar(ctx, self);

        let snap = self.store.read().clone();
        let cmd_tx = self.cmd_tx.clone();
        let search = self.search.clone();
        let current = self.current;

        egui::CentralPanel::default().show(ctx, |ui| {
            match current {
                PageKind::Processes => ProcessesPage.show(ui, &snap, &search, &cmd_tx),
                other => {
                    ui.add_space(20.0);
                    ui.heading(format!("{}(待实现 · 见后续阶段)", other.label()));
                    ui.label(format!("共 {} 个进程,当前未启用此视图。", snap.total_processes));
                }
            }
        });

        shell::status_bar(ctx, &snap);
    }
}

fn apply_mica_once(app: &mut App, frame: &mut eframe::Frame) {
    if app.mica_applied {
        return;
    }
    let _ = window_vibrancy::apply_mica(frame, Some(true));
    app.mica_applied = true;
}

/// 通过 ShellExecuteW "runas" 重启自身以管理员权限运行。
#[cfg(windows)]
pub fn request_elevation() {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let exe = std::env::current_exe().unwrap_or_default();
    let path = to_wide(exe.to_string_lossy().as_ref());
    let verb = to_wide("runas");
    unsafe {
        let _ = ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(path.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        );
    }
}

#[cfg(windows)]
fn to_wide(s: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}
