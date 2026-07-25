//! 外壳:顶部命令栏(导航/搜索/按钮)、底部状态栏。

use eframe::egui;
use tm_core::models::SystemSnapshot;

use crate::app::App;
use crate::pages::PageKind;
use crate::theme;

pub fn top_bar(ctx: &egui::Context, app: &mut App) {
    egui::TopBottomPanel::top("top_bar")
        .exact_height(46.0)
        .frame(
            egui::Frame::default()
                .fill(theme::bar_fill())
                .inner_margin(egui::Margin::symmetric(12.0, 7.0)),
        )
        .show_separator_line(false)
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
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
                    let enabled = matches!(k, PageKind::Processes | PageKind::Performance);
                    ui.add_enabled_ui(enabled, |ui| {
                        let sel = app.current == k;
                        let btn = egui::Button::new(k.label())
                            .fill(if sel {
                                theme::row_selected()
                            } else {
                                egui::Color32::TRANSPARENT
                            })
                            .min_size(egui::vec2(60.0, 30.0))
                            .rounding(egui::Rounding::same(6.0))
                            .stroke(egui::Stroke::NONE);
                        if ui.add(btn).clicked() {
                            app.current = k;
                        }
                    });
                }

                ui.separator();
                ui.add(
                    egui::TextEdit::singleline(&mut app.search)
                        .hint_text("搜索")
                        .desired_width(180.0),
                );

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.add_enabled_ui(!app.elevated, |ui| {
                        if ui.button("🔓 以管理员运行").clicked() {
                            #[cfg(windows)]
                            crate::app::request_elevation();
                        }
                    });
                    let _ = ui.button("▶ 运行新任务");
                    let _ = ui.button("⟳ 刷新");
                });
            });
        });
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
                    // 刷新速度下拉
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
                                if ui
                                    .selectable_label(*speed == s, s.label())
                                    .clicked()
                                {
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
