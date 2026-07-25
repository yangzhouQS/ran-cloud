//! 性能页:左侧资源列表(sparkline + 当前值)+ 右侧大图 + 详情面板。

use std::collections::VecDeque;

use eframe::egui;
use tm_core::models::SystemSnapshot;

use crate::theme;
use crate::widgets::charts;

#[derive(Clone, Copy, PartialEq)]
pub enum PerfResource {
    Cpu,
    Memory,
    Disk(usize),
    Network,
    Gpu,
}

/// 性能页资源列表项:(资源, 名称, 当前值, 历史曲线, 纵轴最大值, 颜色)。
type PerfItem = (PerfResource, String, String, VecDeque<f32>, f32, egui::Color32);

pub fn show(ui: &mut egui::Ui, snap: &SystemSnapshot, selected: &mut PerfResource) {
    let items = build_items(snap);

    egui::ScrollArea::both()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            ui.horizontal_top(|ui| {
                // 左:资源列表
                ui.allocate_ui(egui::vec2(210.0, ui.available_height()), |ui| {
                    egui::ScrollArea::vertical()
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            for (res, name, value_str, hist, max, color) in &items {
                                render_list_item(ui, selected, *res, name, value_str, hist, *max, *color);
                            }
                        });
                });

                ui.separator();

                // 右:大图 + 详情
                ui.allocate_ui(egui::vec2(ui.available_width() - 8.0, ui.available_height()), |ui| {
                    render_detail(ui, snap, selected, &items);
                });
            });
        });
}

fn build_items(snap: &SystemSnapshot) -> Vec<PerfItem> {
    let accent = theme::accent();
    let mut v: Vec<(PerfResource, String, String, VecDeque<f32>, f32, egui::Color32)> = Vec::new();

    v.push((
        PerfResource::Cpu,
        "CPU".into(),
        format!("{:.0}%", snap.cpu.overall_usage),
        snap.cpu.history.clone(),
        100.0,
        accent,
    ));

    v.push((
        PerfResource::Memory,
        "内存".into(),
        format!("{:.1} GB", snap.memory.used as f64 / 1e9),
        snap.memory.history.clone(),
        100.0,
        egui::Color32::from_rgb(0x9B, 0x6A, 0xE5),
    ));

    for (i, d) in snap.disks.iter().enumerate() {
        v.push((
            PerfResource::Disk(i),
            format!("磁盘 {}", d.name),
            format!("{:.0}%", d.activity_pct),
            d.history.clone(),
            100.0,
            egui::Color32::from_rgb(0x4C, 0xC2, 0x6B),
        ));
    }

    let net_total = snap.network.send_bps + snap.network.recv_bps;
    let net_max = snap
        .network
        .history
        .iter()
        .copied()
        .fold(1.0f32, f32::max)
        .max(1024.0);
    v.push((
        PerfResource::Network,
        "网络".into(),
        format!("{:.1} Mbps", net_total * 8.0 / 1e6),
        snap.network.history.clone(),
        net_max,
        egui::Color32::from_rgb(0xE2, 0xA0, 0x4A),
    ));

    v.push((
        PerfResource::Gpu,
        "GPU".into(),
        "暂不支持".into(),
        VecDeque::new(),
        1.0,
        egui::Color32::from_rgb(0x80, 0x80, 0x80),
    ));

    v
}

#[allow(clippy::too_many_arguments)]
fn render_list_item(
    ui: &mut egui::Ui,
    selected: &mut PerfResource,
    res: PerfResource,
    name: &str,
    value: &str,
    hist: &VecDeque<f32>,
    max: f32,
    color: egui::Color32,
) {
    let is_sel = *selected == res;
    let bg = if is_sel {
        theme::row_selected()
    } else {
        egui::Color32::TRANSPARENT
    };
    let resp = egui::Frame::default()
        .fill(bg)
        .rounding(egui::Rounding::same(6.0))
        .inner_margin(egui::Margin::symmetric(8.0, 4.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(egui::RichText::new(name).strong());
                    ui.label(egui::RichText::new(value).color(theme::text_dim()));
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if hist.len() >= 2 {
                        charts::sparkline(ui, hist, max, color, egui::vec2(80.0, 30.0));
                    }
                });
            });
        })
        .response;
    if resp.clicked() {
        *selected = res;
    }
}

fn render_detail(
    ui: &mut egui::Ui,
    snap: &SystemSnapshot,
    selected: &PerfResource,
    items: &[PerfItem],
) {
    // 找到选中项的图表数据
    let entry = items.iter().find(|(r, _, _, _, _, _)| r == selected);
    let (title, hist, max, color) = match entry {
        Some((_, name, _, h, m, c)) => (name.as_str(), h.clone(), *m, *c),
        None => ("CPU", snap.cpu.history.clone(), 100.0, theme::accent()),
    };

    ui.add_space(4.0);
    ui.heading(title);
    ui.add_space(6.0);

    // 大图
    let chart_h = 180.0;
    let fill = egui::Color32::from_rgba_premultiplied(color.r(), color.g(), color.b(), 60);
    let width = ui.available_width();
    if hist.len() >= 2 {
        charts::area_chart(ui, &hist, max, color, fill, egui::vec2(width, chart_h));
    } else {
        ui.label("暂无数据(等待采样或该资源暂不支持)");
    }

    ui.add_space(8.0);
    ui.separator();
    ui.add_space(4.0);

    // 详情字段
    match selected {
        PerfResource::Cpu => {
            detail_row(ui, "利用率", &format!("{:.1}%", snap.cpu.overall_usage));
            detail_row(ui, "速度", &format!("{:.2} GHz", snap.cpu.speed_ghz));
            detail_row(ui, "逻辑核心", &snap.cpu.logical_cores.to_string());
            detail_row(ui, "物理核心", &snap.cpu.physical_cores.to_string());
            detail_row(ui, "进程", &snap.total_processes.to_string());
            detail_row(ui, "型号", &snap.cpu.model_name);
            detail_row(ui, "正常运行时间", &fmt_duration(snap.cpu.up_time));
        }
        PerfResource::Memory => {
            detail_row(ui, "在用", &fmt_bytes(snap.memory.used));
            detail_row(ui, "可用", &fmt_bytes(snap.memory.available));
            detail_row(ui, "总量", &fmt_bytes(snap.memory.total));
            detail_row(
                ui,
                "使用率",
                &format!(
                    "{:.1}%",
                    if snap.memory.total == 0 {
                        0.0
                    } else {
                        snap.memory.used as f32 * 100.0 / snap.memory.total as f32
                    }
                ),
            );
        }
        PerfResource::Disk(i) => {
            if let Some(d) = snap.disks.get(*i) {
                detail_row(ui, "名称", &d.name);
                detail_row(ui, "容量", &fmt_bytes(d.total));
                detail_row(ui, "已用", &fmt_bytes(d.used));
                detail_row(ui, "可用", &fmt_bytes(d.total.saturating_sub(d.used)));
                detail_row(ui, "使用率", &format!("{:.1}%", d.activity_pct));
                detail_row(ui, "读写速率", "需性能计数器(后续支持)");
            }
        }
        PerfResource::Network => {
            detail_row(ui, "发送", &fmt_rate(snap.network.send_bps));
            detail_row(ui, "接收", &fmt_rate(snap.network.recv_bps));
            detail_row(ui, "吞吐", &fmt_rate(snap.network.send_bps + snap.network.recv_bps));
            detail_row(ui, "适配器", &snap.network.adapter);
        }
        PerfResource::Gpu => {
            ui.label("GPU 利用率/显存:需要 DXGI/性能计数器,后续阶段支持(spec §2.3 best-effort)。");
        }
    }
}

fn detail_row(ui: &mut egui::Ui, label: &str, value: &str) {
    ui.horizontal(|ui| {
        ui.label(egui::RichText::new(label).color(theme::text_dim()));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(value);
        });
    });
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

fn fmt_rate(bps: f64) -> String {
    let mbps = bps * 8.0 / 1e6;
    if mbps >= 1.0 {
        format!("{:.2} Mbps", mbps)
    } else {
        format!("{:.1} Kbps", bps * 8.0 / 1e3)
    }
}

fn fmt_duration(d: std::time::Duration) -> String {
    let s = d.as_secs();
    let days = s / 86400;
    let h = (s % 86400) / 3600;
    let m = (s % 3600) / 60;
    let sec = s % 60;
    if days > 0 {
        format!("{}d {}h {}m {}s", days, h, m, sec)
    } else {
        format!("{}h {}m {}s", h, m, sec)
    }
}
