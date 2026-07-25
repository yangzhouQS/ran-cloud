//! 进程页:分组(应用/后台/Windows)、搜索过滤、CPU 降序、行右键菜单、应用图标。

use std::collections::HashMap;

use eframe::egui;
use tm_core::models::{Command, PowerUsage, ProcColumn, ProcInfo, ProcKind, SortDir, SystemSnapshot};
use tm_core::sorting::sort_processes;

use crate::theme;

pub fn show(
    ui: &mut egui::Ui,
    snap: &SystemSnapshot,
    search: &str,
    cmd_tx: &crossbeam_channel::Sender<Command>,
    icons: &mut HashMap<String, Option<egui::TextureHandle>>,
) {
    let q = search.trim().to_ascii_lowercase();
    let mut rows: Vec<ProcInfo> = snap
        .processes
        .iter()
        .filter(|p| q.is_empty() || p.name.to_ascii_lowercase().contains(&q))
        .cloned()
        .collect();
    sort_processes(&mut rows, ProcColumn::Cpu, SortDir::Desc);

    column_header(ui);

    let groups: [(ProcKind, &str); 3] = [
        (ProcKind::App, "应用"),
        (ProcKind::Background, "后台进程"),
        (ProcKind::Windows, "Windows 进程"),
    ];

    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            for (kind, title) in groups {
                let list: Vec<&ProcInfo> = rows.iter().filter(|p| p.kind == kind).collect();
                if list.is_empty() {
                    continue;
                }
                let header = format!("{}  ({})", title, list.len());
                ui.add_space(4.0);
                ui.collapsing(header, |ui| {
                    for p in &list {
                        render_row(ui, p, cmd_tx, icons);
                    }
                });
            }
            ui.add_space(8.0);
        });
}

fn column_header(ui: &mut egui::Ui) {
    egui::Frame::default()
        .fill(theme::header_fill())
        .inner_margin(egui::Margin::symmetric(12.0, 6.0))
        .show(ui, |ui| {
            ui.set_min_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("名称").strong());
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(egui::RichText::new("PID").strong());
                    ui.label(egui::RichText::new("电源").strong());
                    ui.label(egui::RichText::new("内存").strong());
                    ui.label(egui::RichText::new("CPU").strong());
                });
            });
        });
    let (r, _) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 1.0), egui::Sense::hover());
    ui.painter()
        .line_segment([r.left_top(), r.right_top()], (1.0, theme::separator()));
}

fn render_row(
    ui: &mut egui::Ui,
    p: &ProcInfo,
    cmd_tx: &crossbeam_channel::Sender<Command>,
    icons: &mut HashMap<String, Option<egui::TextureHandle>>,
) {
    let resp = egui::Frame::default()
        .inner_margin(egui::Margin::symmetric(12.0, 4.0))
        .fill(egui::Color32::TRANSPARENT)
        .show(ui, |ui| {
            ui.set_min_width(ui.available_width());
            ui.horizontal(|ui| {
                // 应用图标(按 exe_path 缓存,失败用首字母色块)
                crate::icons::render(ui, icons, &p.exe_path, &p.name);
                ui.add_space(4.0);
                ui.label(&p.name);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(format!("{}", p.pid));
                    ui.label(power_label(p.power_usage));
                    ui.label(format!("{:.1} MB", p.memory_bytes as f64 / 1_000_000.0));
                    ui.label(format!("{:.1}%", p.cpu_usage));
                });
            });
        })
        .response;

    if resp.hovered() {
        ui.painter()
            .rect_filled(resp.rect, egui::Rounding::same(4.0), theme::row_hover());
    }

    resp.context_menu(|ui| {
        if ui.button("结束任务 (E)").clicked() {
            let _ = cmd_tx.send(Command::Kill(p.pid));
            ui.close_menu();
        }
        if ui.button("挂起").clicked() {
            let _ = cmd_tx.send(Command::Suspend(p.pid));
            ui.close_menu();
        }
        if ui.button("恢复").clicked() {
            let _ = cmd_tx.send(Command::Resume(p.pid));
            ui.close_menu();
        }
        let lbl = if p.efficiency_mode {
            "关闭效率模式"
        } else {
            "启用效率模式"
        };
        if ui.button(lbl).clicked() {
            let _ = cmd_tx.send(Command::SetEfficiencyMode(p.pid, !p.efficiency_mode));
            ui.close_menu();
        }
        ui.separator();
        if ui.button("打开文件位置").clicked() {
            #[cfg(windows)]
            {
                let _ = tm_core::process_ops::open_file_location(&p.exe_path);
            }
            ui.close_menu();
        }
    });
}

fn power_label(p: PowerUsage) -> egui::RichText {
    match p {
        PowerUsage::Low => egui::RichText::new("低").color(theme::text_dim()),
        PowerUsage::Medium => egui::RichText::new("中").color(egui::Color32::from_rgb(0xE2, 0xC0, 0x4A)),
        PowerUsage::High => egui::RichText::new("高").color(egui::Color32::from_rgb(0xE8, 0x6B, 0x4B)),
    }
}
