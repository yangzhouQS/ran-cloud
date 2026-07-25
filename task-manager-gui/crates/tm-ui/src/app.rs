//! App 状态:持有快照存储、命令通道、运行时控件、当前 Tab、Mica 标记、提权状态。

use std::time::Instant;

use crossbeam_channel::Sender;
use eframe::egui;
use tm_core::collector::{self, Controls, SnapshotStore};
use tm_core::models::{Command, RefreshSpeed};
use tm_core::services::ServiceInfo;
use tm_core::startup::StartupEntry;
use tm_core::users::UserInfo;

use crate::pages::performance_page::{self, PerfResource};
use crate::pages::{Page, PageKind, processes_page::ProcessesPage};
use crate::shell;
use crate::theme;

/// 带最后更新时间的缓存(慢数据页用,~3s 节流)。
pub struct Timed<T> {
    pub value: T,
    pub at: Option<Instant>,
}

const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(3);

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
    pub run_dialog: RunDialog,
    pub services_cache: Timed<Vec<ServiceInfo>>,
    pub startup_cache: Timed<Vec<StartupEntry>>,
    pub users_cache: Timed<Vec<UserInfo>>,
}

/// 运行新任务对话框状态。
pub struct RunDialog {
    pub open: bool,
    pub input: String,
    pub elevated: bool,
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
            run_dialog: RunDialog {
                open: false,
                input: String::new(),
                elevated: false,
            },
            services_cache: Timed {
                value: Vec::new(),
                at: None,
            },
            startup_cache: Timed {
                value: Vec::new(),
                at: None,
            },
            users_cache: Timed {
                value: Vec::new(),
                at: None,
            },
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

        // 按当前页刷新慢数据缓存(节流)。
        match self.current {
            PageKind::Services => self.refresh_services(),
            PageKind::StartupApps => self.refresh_startup(),
            PageKind::Users => self.refresh_users(&snap),
            _ => {}
        }

        let cmd_tx = self.cmd_tx.clone();
        let search = self.search.clone();
        let current = self.current;
        let mut perf_selected = self.perf_selected;
        let services = &self.services_cache.value;
        let startup = &self.startup_cache.value;
        let users = &self.users_cache.value;

        egui::CentralPanel::default().show(ctx, |ui| {
            match current {
                PageKind::Processes => ProcessesPage.show(ui, &snap, &search, &cmd_tx),
                PageKind::Performance => performance_page::show(ui, &snap, &mut perf_selected),
                PageKind::Services => crate::pages::services_page::show(ui, services, &search),
                PageKind::StartupApps => crate::pages::startup_page::show(ui, startup, &search),
                PageKind::Users => crate::pages::users_page::show(ui, users, &search),
                PageKind::AppHistory => crate::pages::app_history_page::show(ui, &snap, &search),
                PageKind::Details => crate::pages::details_page::show(ui, &snap, &search),
            }
        });
        self.perf_selected = perf_selected;

        shell::status_bar(ctx, &snap, &self.controls, &mut self.speed);

        self.render_run_dialog(ctx);
    }
}

impl App {
    fn refresh_services(&mut self) {
        if self.services_cache.at.is_none_or(|t| t.elapsed() > CACHE_TTL) {
            self.services_cache = Timed {
                value: tm_core::services::enumerate(),
                at: Some(Instant::now()),
            };
        }
    }

    fn refresh_startup(&mut self) {
        if self.startup_cache.at.is_none_or(|t| t.elapsed() > CACHE_TTL) {
            self.startup_cache = Timed {
                value: tm_core::startup::enumerate(),
                at: Some(Instant::now()),
            };
        }
    }

    fn refresh_users(&mut self, snap: &tm_core::models::SystemSnapshot) {
        if self.users_cache.at.is_none_or(|t| t.elapsed() > CACHE_TTL) {
            self.users_cache = Timed {
                value: tm_core::users::enumerate(snap),
                at: Some(Instant::now()),
            };
        }
    }

    fn render_run_dialog(&mut self, ctx: &egui::Context) {
        if !self.run_dialog.open {
            return;
        }
        let mut open = self.run_dialog.open;
        let mut do_run = false;
        let mut cancel = false;
        egui::Window::new("运行新任务")
            .open(&mut open)
            .resizable(false)
            .default_width(440.0)
            .show(ctx, |ui| {
                ui.label("输入要打开的程序、文件夹、文档或 Internet 资源:");
                ui.add(
                    egui::TextEdit::singleline(&mut self.run_dialog.input)
                        .hint_text("例如:notepad / explorer")
                        .desired_width(420.0),
                );
                ui.checkbox(&mut self.run_dialog.elevated, "以此任务的管理员权限创建");
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    if ui.button("确定").clicked() {
                        do_run = true;
                    }
                    if ui.button("取消").clicked() {
                        cancel = true;
                    }
                });
            });
        if do_run {
            let _ = tm_core::run_task::run_new_task(&self.run_dialog.input, self.run_dialog.elevated);
            self.run_dialog.input.clear();
            self.run_dialog.elevated = false;
            open = false;
        }
        if cancel {
            self.run_dialog.input.clear();
            open = false;
        }
        self.run_dialog.open = open;
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
