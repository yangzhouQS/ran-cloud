//! 用户页:用户/会话/状态/CPU/内存,支持搜索过滤。

use eframe::egui;
use tm_core::users::UserInfo;

use crate::theme;

pub fn show(ui: &mut egui::Ui, items: &[UserInfo], search: &str) {
    let q = search.trim().to_ascii_lowercase();
    ui.add_space(2.0);
    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Grid::new("users_grid")
                .num_columns(5)
                .striped(true)
                .min_col_width(60.0)
                .spacing([24.0, 4.0])
                .show(ui, |ui| {
                    ui.strong("用户");
                    ui.strong("会话 ID");
                    ui.strong("状态");
                    ui.strong("CPU");
                    ui.strong("内存");
                    ui.end_row();
                    for u in items.iter().filter(|u| {
                        q.is_empty() || u.name.to_ascii_lowercase().contains(&q)
                    }) {
                        ui.label(&u.name);
                        ui.label(format!("{}", u.session_id));
                        ui.label(&u.state);
                        ui.label(format!("{:.1}%", u.cpu));
                        ui.label(fmt_bytes(u.memory));
                        ui.end_row();
                    }
                });
        });
    ui.colored_label(theme::text_dim(), "提示:CPU/内存按用户名聚合自当前进程列表。");
}

fn fmt_bytes(b: u64) -> String {
    let f = b as f64;
    if f >= 1e9 {
        format!("{:.2} GB", f / 1e9)
    } else if f >= 1e6 {
        format!("{:.1} MB", f / 1e6)
    } else {
        format!("{:.0} KB", f / 1e3)
    }
}
