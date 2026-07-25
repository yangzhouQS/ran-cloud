//! App 状态:持有快照存储、命令通道、运行时控件、当前 Tab、Mica 标记、提权状态。

use crossbeam_channel::Sender;
use eframe::egui;
use tm_core::collector::{self, Controls, SnapshotStore};
use tm_core::models::{Command, RefreshSpeed};

use crate::pages::performance_page::{self, PerfResource};
use crate::pages::{Page, PageKind, processes_page::ProcessesPage};
use crate::shell;
use crate::theme;

pub struct App {
    pub store: SnapshotStore,
    pub cmd_tx: Sender<Command>,
    pub controls: Controls,
    pub mica_applied: bool,
    pub current: PageKind,
    pub search: String,
    pub elevated: bool,
    pub speed: RefreshSpeed,
    pub perf_selected: PerfResource,
}

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        theme::install(&cc.egui_ctx); // 主题与字体仅设置一次(含 CJK 字体注入)
        let ctx = cc.egui_ctx.clone();
        let elevated = tm_core::privilege::is_elevated();
        let (store, cmd_tx, controls) = collector::spawn(
            elevated,
            RefreshSpeed::Normal,
            Box::new(move || ctx.request_repaint()),
        );
        Self {
            store,
            cmd_tx,
            controls,
            mica_applied: false,
            current: PageKind::Processes,
            search: String::new(),
            elevated,
            speed: RefreshSpeed::Normal,
            perf_selected: PerfResource::Cpu,
        }
    }
}

impl eframe::App for App {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        apply_mica_once(self, frame);

        shell::top_bar(ctx, self);

        let snap = self.store.read().clone();
        let cmd_tx = self.cmd_tx.clone();
        let search = self.search.clone();
        let current = self.current;
        let mut perf_selected = self.perf_selected;

        egui::CentralPanel::default().show(ctx, |ui| {
            match current {
                PageKind::Processes => ProcessesPage.show(ui, &snap, &search, &cmd_tx),
                PageKind::Performance => performance_page::show(ui, &snap, &mut perf_selected),
                other => {
                    ui.add_space(20.0);
                    ui.heading(format!("{}(待实现 · 见后续阶段)", other.label()));
                    ui.label(format!("共 {} 个进程,当前未启用此视图。", snap.total_processes));
                }
            }
        });
        self.perf_selected = perf_selected;

        shell::status_bar(ctx, &snap, &self.controls, &mut self.speed);
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
