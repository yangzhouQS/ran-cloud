//! 外壳:左侧导航边栏 + 主区顶部命令栏 + 底部状态栏(对齐 Win11 布局)。

use eframe::egui;
use tm_core::models::SystemSnapshot;

use crate::app::App;
use crate::pages::PageKind;
use crate::theme;

/// 每个导航页的小色块图标颜色。
fn page_color(k: PageKind) -> egui::Color32 {
    match k {
        PageKind::Processes => theme::accent(),
        PageKind::Performance => egui::Color32::from_rgb(0x9B, 0x6A, 0xE5),
        PageKind::AppHistory => egui::Color32::from_rgb(0x2E, 0xB8, 0xB8),
        PageKind::StartupApps => egui::Color32::from_rgb(0x4C, 0xC2, 0x6B),
        PageKind::Users => egui::Color32::from_rgb(0xE2, 0xA0, 0x4A),
        PageKind::Details => egui::Color32::from_rgb(0x6A, 0x9B, 0xD8),
        PageKind::Services => egui::Color32::from_rgb(0xE5, 0x6B, 0x6B),
    }
}

fn icon_square(ui: &mut egui::Ui, color: egui::Color32, size: f32) {
    let (rect, _) = ui.allocate_exact_size(egui::vec2(size, size), egui::Sense::hover());
    ui.painter()
        .rect_filled(rect.shrink(2.0), egui::Rounding::same(4.0), color);
}

/// 左侧导航边栏。
pub fn sidebar(ctx: &egui::Context, app: &mut App) {
    let collapsed = app.settings.nav_collapsed;
    let width = if collapsed { 56.0 } else { 210.0 };
    egui::SidePanel::left("nav")
        .resizable(false)
        .exact_width(width)
        .frame(
            egui::Frame::default()
                .fill(theme::bar_fill())
                .inner_margin(egui::Margin::symmetric(10.0, 10.0)),
        )
        .show_separator_line(false)
        .show(ctx, |ui| {
            // 顶部:汉堡(折叠)+ 搜索
            ui.horizontal(|ui| {
                if ui
                    .add(
                        egui::Button::new(if collapsed { "≡" } else { "≡  菜单" })
                            .fill(egui::Color32::TRANSPARENT)
                            .rounding(egui::Rounding::same(6.0))
                            .min_size(egui::vec2(ui.available_width(), 26.0)),
                    )
                    .clicked()
                {
                    app.settings.nav_collapsed = !app.settings.nav_collapsed;
                    crate::settings::save(&app.settings);
                }
            });
            if !collapsed {
                ui.add_space(4.0);
                ui.add(
                    egui::TextEdit::singleline(&mut app.search)
                        .hint_text("搜索")
                        .desired_width(ui.available_width()),
                );
            }
            ui.add_space(2.0);
            ui.separator();

            // 导航项
            let items = [
                PageKind::Processes,
                PageKind::Performance,
                PageKind::AppHistory,
                PageKind::StartupApps,
                PageKind::Users,
                PageKind::Details,
                PageKind::Services,
            ];
            for k in items {
                nav_item(ui, app, k, collapsed);
            }

            // 底部:账号(显式留白贴底,确保可见)
            let footer_h = 70.0;
            let gap = (ui.available_height() - footer_h).max(0.0);
            ui.add_space(gap);
            ui.separator();
            ui.horizontal(|ui| {
                let dot_color = if app.elevated {
                    egui::Color32::from_rgb(0xE2, 0xA0, 0x4A)
                } else {
                    theme::accent()
                };
                icon_square(ui, dot_color, 22.0);
                if !collapsed {
                    ui.vertical(|ui| {
                        ui.label(whoami());
                        ui.colored_label(
                            theme::text_dim(),
                            if app.elevated { "管理员" } else { "标准用户" },
                        );
                    });
                }
            });
        });
}

fn page_index(k: PageKind) -> u8 {
    match k {
        PageKind::Processes => 0,
        PageKind::Performance => 1,
        PageKind::AppHistory => 2,
        PageKind::StartupApps => 3,
        PageKind::Users => 4,
        PageKind::Details => 5,
        PageKind::Services => 6,
    }
}

fn nav_item(ui: &mut egui::Ui, app: &mut App, k: PageKind, collapsed: bool) {
    let selected = app.current == k;
    let frame = egui::Frame::default()
        .fill(if selected {
            theme::row_selected()
        } else {
            egui::Color32::TRANSPARENT
        })
        .rounding(egui::Rounding::same(6.0))
        .inner_margin(egui::Margin::symmetric(8.0, 6.0));
    let inner = frame.show(ui, |ui| {
        if collapsed {
            ui.horizontal_top(|ui| {
                ui.add_space(6.0);
                icon_square(ui, page_color(k), 18.0);
            });
        } else {
            ui.horizontal(|ui| {
                icon_square(ui, page_color(k), 16.0);
                ui.label(k.label());
            });
        }
    });
    // Frame 的 response 无点击 sense,需显式 interact 才能响应点击。
    let resp = ui.interact(
        inner.response.rect,
        ui.id().with(("navitem", page_index(k))),
        egui::Sense::click(),
    );
    if !selected && resp.hovered() {
        ui.painter()
            .rect_filled(inner.response.rect, egui::Rounding::same(6.0), theme::row_hover());
    }
    if resp.clicked() {
        app.current = k;
    }
}

fn whoami() -> String {
    std::env::var("USERNAME").unwrap_or_else(|_| "用户".to_string())
}

/// 主区顶部命令栏(兼作可拖拽标题栏 + 窗口控制按钮)。
pub fn command_bar(ctx: &egui::Context, app: &mut App) {
    egui::TopBottomPanel::top("command_bar")
        .exact_height(42.0)
        .frame(
            egui::Frame::default()
                .fill(theme::bar_fill())
                .inner_margin(egui::Margin::symmetric(8.0, 6.0)),
        )
        .show_separator_line(false)
        .show(ctx, |ui| {
            // 整栏可拖拽移动窗口(StartDrag 仅在真正拖动时触发,不影响按钮点击)。
            let bar_rect = ui.max_rect();
            let drag = ui.interact(
                bar_rect,
                ui.id().with("title_drag"),
                egui::Sense::drag(),
            );
            if drag.drag_started() {
                ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
            }

            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                // 窗口控制:关闭 / 最大化 / 最小化
                if titlebar_button(ui, "✕", "tb_close", egui::Color32::from_rgb(0xE8, 0x4B, 0x4B)) {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
                if titlebar_button(ui, "▢", "tb_max", theme::row_hover()) {
                    app.maximized = !app.maximized;
                    ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(app.maximized));
                }
                if titlebar_button(ui, "—", "tb_min", theme::row_hover()) {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true));
                }
                ui.separator();

                if ui.button("⚙ 设置").clicked() {
                    app.settings_open = true;
                }
                ui.add_enabled_ui(!app.elevated, |ui| {
                    if ui.button("🔓 以管理员运行").clicked() {
                        #[cfg(windows)]
                        crate::app::request_elevation();
                    }
                });
                ui.separator();
                if ui.button("⟳ 刷新").clicked() {
                    app.services_cache.at = None;
                    app.startup_cache.at = None;
                    app.users_cache.at = None;
                }
                if ui.button("▶ 运行新任务").clicked() {
                    app.run_dialog.open = true;
                }
            });
        });
}

/// 标题栏小按钮(allocate + hover 背景 + 居中字符)。
fn titlebar_button(
    ui: &mut egui::Ui,
    glyph: &str,
    id: &str,
    hover_color: egui::Color32,
) -> bool {
    let (rect, resp) =
        ui.allocate_exact_size(egui::vec2(40.0, 30.0), egui::Sense::click());
    if resp.hovered() {
        ui.painter()
            .rect_filled(rect, egui::Rounding::same(4.0), hover_color);
    }
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        glyph,
        egui::FontId::proportional(15.0),
        egui::Color32::WHITE,
    );
    let _ = id;
    resp.clicked()
}

pub fn status_bar(
    ctx: &egui::Context,
    snap: &SystemSnapshot,
    controls: &tm_core::collector::Controls,
    speed: &mut tm_core::models::RefreshSpeed,
) {
    egui::TopBottomPanel::bottom("status_bar")
        .exact_height(26.0)
        .frame(
            egui::Frame::default()
                .fill(theme::bar_fill())
                .inner_margin(egui::Margin::symmetric(12.0, 4.0)),
        )
        .show_separator_line(false)
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(format!("进程 {}", snap.total_processes));
                ui.separator();
                ui.label(format!("CPU {:.0}%", snap.cpu.overall_usage));
                ui.separator();
                let mem_gib = snap.memory.used as f64 / 1024.0 / 1024.0 / 1024.0;
                ui.label(format!("{:.1}%", mem_pct(snap)));
                ui.separator();
                ui.label(format!("{:.1} GiB", mem_gib));

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let badge = if snap.elevated { "管理员" } else { "标准" };
                    ui.colored_label(theme::text_dim(), badge);
                    ui.separator();
                    let speeds = [
                        tm_core::models::RefreshSpeed::Paused,
                        tm_core::models::RefreshSpeed::Low,
                        tm_core::models::RefreshSpeed::Normal,
                        tm_core::models::RefreshSpeed::High,
                    ];
                    egui::ComboBox::from_id_salt("refresh_speed")
                        .selected_text(speed.label())
                        .show_ui(ui, |ui| {
                            for s in speeds {
                                if ui.selectable_label(*speed == s, s.label()).clicked() {
                                    *speed = s;
                                    controls.set_speed(s);
                                }
                            }
                        });
                });
            });
        });
}

fn mem_pct(snap: &SystemSnapshot) -> f32 {
    if snap.memory.total == 0 {
        0.0
    } else {
        snap.memory.used as f32 * 100.0 / snap.memory.total as f32
    }
}
