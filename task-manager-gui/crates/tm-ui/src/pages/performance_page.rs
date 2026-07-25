//! 性能页:左侧资源列表(sparkline + 当前值)+ 右侧详情(Win11 风格:
//! 大标题数值叠加在大图左上角 + 下方两列统计网格)。

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

                // 右:Win11 风格详情
                ui.allocate_ui(egui::vec2(ui.available_width() - 8.0, ui.available_height()), |ui| {
                    render_detail(ui, snap, selected);
                });
            });
        });
}

fn build_items(snap: &SystemSnapshot) -> Vec<PerfItem> {
    let accent = theme::accent();
    let mut v: Vec<PerfItem> = Vec::new();

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

    if let Some(g) = snap.gpus.first() {
        v.push((
            PerfResource::Gpu,
            "GPU".into(),
            format!("{:.0}%", g.usage_pct.unwrap_or(0.0)),
            g.history.clone(),
            100.0,
            egui::Color32::from_rgb(0xE5, 0x6B, 0x6B),
        ));
    } else {
        v.push((
            PerfResource::Gpu,
            "GPU".into(),
            "不可用".into(),
            VecDeque::new(),
            1.0,
            egui::Color32::from_rgb(0x80, 0x80, 0x80),
        ));
    }

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
    let frame = egui::Frame::default()
        .fill(if is_sel {
            theme::row_selected()
        } else {
            egui::Color32::TRANSPARENT
        })
        .rounding(egui::Rounding::same(6.0))
        .inner_margin(egui::Margin::symmetric(8.0, 4.0));
    let inner = frame.show(ui, |ui| {
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
    });
    let resp = ui.interact(
        inner.response.rect,
        ui.id().with(("perfitem", resource_index(res))),
        egui::Sense::click(),
    );
    if !is_sel && resp.hovered() {
        ui.painter()
            .rect_filled(inner.response.rect, egui::Rounding::same(6.0), theme::row_hover());
    }
    if resp.clicked() {
        *selected = res;
    }
}

fn resource_index(r: PerfResource) -> u8 {
    match r {
        PerfResource::Cpu => 0,
        PerfResource::Memory => 1,
        PerfResource::Disk(i) => 2 + (i.min(10) as u8),
        PerfResource::Network => 200,
        PerfResource::Gpu => 201,
    }
}

/// Win11 风格详情:大标题数值叠加在大图左上角 + 下方两列统计网格。
fn render_detail(ui: &mut egui::Ui, snap: &SystemSnapshot, selected: &PerfResource) {
    let (title, headline, subtitle, hist, max, color, stats) = resolve(snap, selected);

    // 标题(硬件型号/资源名)
    ui.add_space(2.0);
    ui.label(egui::RichText::new(&title).strong().size(15.0));
    ui.add_space(6.0);

    // 图表区(大标题数值叠加在左上角)
    let width = ui.available_width();
    let chart_h = 190.0;
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, chart_h), egui::Sense::hover());
    let painter = ui.painter_at(rect);
    // 背景描边
    painter.rect_stroke(rect, egui::Rounding::same(4.0), egui::Stroke::new(1.0_f32, theme::separator()));
    // 大标题数值 + 小副标题(左上角叠加)
    painter.text(
        rect.left_top() + egui::vec2(10.0, 4.0),
        egui::Align2::LEFT_TOP,
        &headline,
        egui::FontId::proportional(30.0),
        color,
    );
    painter.text(
        rect.left_top() + egui::vec2(10.0, 40.0),
        egui::Align2::LEFT_TOP,
        &subtitle,
        egui::FontId::proportional(12.0),
        theme::text_dim(),
    );
    // 折线/面积(留出左上角标题空间,从 y=58 起)
    let plot_rect = egui::Rect::from_min_size(
        egui::pos2(rect.left() + 6.0, rect.top() + 58.0),
        egui::vec2(rect.width() - 12.0, rect.height() - 64.0),
    );
    if hist.len() >= 2 {
        let fill = egui::Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), 55);
        charts::paint_series(
            painter,
            plot_rect,
            &hist,
            max,
            fill,
            Some((color, egui::Stroke::new(1.6_f32, color))),
        );
    }

    ui.add_space(10.0);
    ui.separator();
    ui.add_space(4.0);

    // 两列统计网格(每行两对 标签|值)
    egui::Grid::new("perf_stats")
        .num_columns(4)
        .spacing([20.0, 6.0])
        .show(ui, |ui| {
            for pair in stats.chunks(2) {
                for (k, val) in pair {
                    ui.label(egui::RichText::new(*k).color(theme::text_dim()));
                    ui.label(val);
                }
                if pair.len() == 1 {
                    ui.label("");
                    ui.label("");
                }
                ui.end_row();
            }
        });
}

/// 解析当前选中资源的 标题/大标题数值/副标题/历史/最大值/颜色/统计行。
#[allow(clippy::type_complexity)]
fn resolve(
    snap: &SystemSnapshot,
    selected: &PerfResource,
) -> (
    String,
    String,
    String,
    VecDeque<f32>,
    f32,
    egui::Color32,
    Vec<(&'static str, String)>,
) {
    match selected {
        PerfResource::Cpu => {
            let c = &snap.cpu;
            let title = if c.model_name.is_empty() {
                "CPU".into()
            } else {
                c.model_name.clone()
            };
            (
                title,
                format!("{:.0}%", c.overall_usage),
                "利用率".into(),
                c.history.clone(),
                100.0,
                theme::accent(),
                vec![
                    ("利用率", format!("{:.0}%", c.overall_usage)),
                    ("速度", format!("{:.2} GHz", c.speed_ghz)),
                    ("进程", format!("{}", snap.total_processes)),
                    ("线程", format!("{}", c.threads)),
                    ("句柄", format!("{}", c.handles)),
                    ("逻辑处理器", format!("{}", c.logical_cores)),
                    ("物理内核", format!("{}", c.physical_cores)),
                    ("正常运行时间", fmt_duration(c.up_time)),
                ],
            )
        }
        PerfResource::Memory => {
            let m = &snap.memory;
            let pct = mem_pct(m.used, m.total);
            (
                format!("{:.1} GB", m.total as f64 / 1e9),
                format!("{:.0}%", pct),
                "内存使用率".into(),
                m.history.clone(),
                100.0,
                egui::Color32::from_rgb(0x9B, 0x6A, 0xE5),
                vec![
                    ("使用中", fmt_bytes(m.used)),
                    ("可用", fmt_bytes(m.available)),
                    ("已提交", format!("{} / {}", fmt_bytes(m.used), fmt_bytes(m.total))),
                    ("已缓存", "—".into()),
                    ("分页缓冲池", "—".into()),
                    ("非分页缓冲池", "—".into()),
                    ("为硬件保留", "—".into()),
                    ("总量", fmt_bytes(m.total)),
                ],
            )
        }
        PerfResource::Disk(i) => {
            if let Some(d) = snap.disks.get(*i) {
                (
                    d.name.clone(),
                    format!("{:.0}%", d.activity_pct),
                    "活动时间".into(),
                    d.history.clone(),
                    100.0,
                    egui::Color32::from_rgb(0x4C, 0xC2, 0x6B),
                    vec![
                        ("活动时间", format!("{:.0}%", d.activity_pct)),
                        ("平均响应时间", format!("{:.1} 毫秒", d.response_time_ms)),
                        ("读取速度", fmt_rate(d.read_bps)),
                        ("写入速度", fmt_rate(d.write_bps)),
                        ("容量", fmt_bytes(d.total)),
                        ("可用", fmt_bytes(d.total.saturating_sub(d.used))),
                        ("类型", "SSD".into()),
                        ("系统磁盘", "—".into()),
                    ],
                )
            } else {
                empty("磁盘".into())
            }
        }
        PerfResource::Network => {
            let n = &snap.network;
            let total = n.send_bps + n.recv_bps;
            let max = n.history.iter().copied().fold(1.0f32, f32::max).max(1024.0);
            (
                n.adapter.clone(),
                format!("{:.1} Mbps", total * 8.0 / 1e6),
                "吞吐量".into(),
                n.history.clone(),
                max,
                egui::Color32::from_rgb(0xE2, 0xA0, 0x4A),
                vec![
                    ("发送", fmt_rate(n.send_bps)),
                    ("接收", fmt_rate(n.recv_bps)),
                    ("吞吐量", fmt_rate(total)),
                    ("连接类型", n.adapter.clone()),
                ],
            )
        }
        PerfResource::Gpu => {
            if let Some(g) = snap.gpus.first() {
                (
                    "GPU".into(),
                    format!("{:.0}%", g.usage_pct.unwrap_or(0.0)),
                    "利用率".into(),
                    g.history.clone(),
                    100.0,
                    egui::Color32::from_rgb(0xE5, 0x6B, 0x6B),
                    vec![
                        ("利用率", format!("{:.1}%", g.usage_pct.unwrap_or(0.0))),
                        ("专用 GPU 内存", fmt_bytes(g.dedicated_used.unwrap_or(0))),
                        ("共享 GPU 内存", "—".into()),
                        ("温度", "—".into()),
                    ],
                )
            } else {
                empty("GPU".into())
            }
        }
    }
}

#[allow(clippy::type_complexity)]
fn empty(title: String) -> (String, String, String, VecDeque<f32>, f32, egui::Color32, Vec<(&'static str, String)>) {
    (
        title,
        "—".into(),
        "暂无数据".into(),
        VecDeque::new(),
        1.0,
        egui::Color32::from_rgb(0x80, 0x80, 0x80),
        vec![],
    )
}

fn mem_pct(used: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        used as f32 * 100.0 / total as f32
    }
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
        format!("{}d {}h {}m", days, h, m)
    } else {
        format!("{}:{:02}:{:02}:{}", h, m / 60, m % 60, sec)
    }
}
