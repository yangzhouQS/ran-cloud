//! 性能页(Win11 风格重写):左侧资源列表 + 右侧详情面板。
//!
//! 左列表:CPU/内存/磁盘×N/网络/GPU,每项含实时核心指标 + 迷你折线,点击切换。
//! 右详情:硬件型号标题 + 大面积图(当前数值叠加在左上角)+ 下方两列统计网格。
//! 图表支持右键菜单(图表范围 / 复制资源值)。

use std::collections::VecDeque;

use eframe::egui;
use tm_core::models::SystemSnapshot;

use crate::theme;
use crate::widgets::charts;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PerfResource {
    Cpu,
    Memory,
    Disk(usize),
    Network,
    Gpu,
}

pub fn show(
    ui: &mut egui::Ui,
    snap: &SystemSnapshot,
    selected: &mut PerfResource,
    chart_points: &mut usize,
) {
    let items = build_items(snap);

    ui.horizontal_top(|ui| {
        // 左:资源列表
        ui.allocate_ui(egui::vec2(200.0, ui.available_height()), |ui| {
            egui::ScrollArea::vertical()
                .auto_shrink([false, true])
                .show(ui, |ui| {
                    for it in &items {
                        list_item(ui, selected, it);
                    }
                });
        });

        ui.separator();

        // 右:详情面板
        ui.allocate_ui(egui::vec2(ui.available_width() - 4.0, ui.available_height()), |ui| {
            egui::ScrollArea::vertical()
                .auto_shrink([false, true])
                .show(ui, |ui| {
                    detail(ui, snap, *selected, chart_points);
                });
        });
    });
}

struct Item {
    res: PerfResource,
    name: String,
    value: String,
    hist: VecDeque<f32>,
    max: f32,
    color: egui::Color32,
}

fn build_items(snap: &SystemSnapshot) -> Vec<Item> {
    let mut v: Vec<Item> = Vec::new();
    v.push(Item {
        res: PerfResource::Cpu,
        name: "CPU".into(),
        value: format!("{:.0}%", snap.cpu.overall_usage),
        hist: snap.cpu.history.clone(),
        max: 100.0,
        color: theme::accent(),
    });
    let mem_total = snap.memory.total;
    let mem_pct = pct(snap.memory.used, mem_total);
    v.push(Item {
        res: PerfResource::Memory,
        name: "内存".into(),
        value: format!("{:.0}%", mem_pct),
        hist: snap.memory.history.clone(),
        max: 100.0,
        color: egui::Color32::from_rgb(0x9B, 0x6A, 0xE5),
    });
    for (i, d) in snap.disks.iter().enumerate() {
        v.push(Item {
            res: PerfResource::Disk(i),
            name: format!("磁盘 {}", d.name),
            value: format!("{:.0}%", d.activity_pct),
            hist: d.history.clone(),
            max: 100.0,
            color: egui::Color32::from_rgb(0x4C, 0xC2, 0x6B),
        });
    }
    let net_total = snap.network.send_bps + snap.network.recv_bps;
    let net_max = snap
        .network
        .history
        .iter()
        .copied()
        .fold(1.0f32, f32::max)
        .max(1024.0);
    v.push(Item {
        res: PerfResource::Network,
        name: "网络".into(),
        value: fmt_rate(net_total),
        hist: snap.network.history.clone(),
        max: net_max,
        color: egui::Color32::from_rgb(0xE2, 0xA0, 0x4A),
    });
    if let Some(g) = snap.gpus.first() {
        v.push(Item {
            res: PerfResource::Gpu,
            name: "GPU".into(),
            value: format!("{:.0}%", g.usage_pct.unwrap_or(0.0)),
            hist: g.history.clone(),
            max: 100.0,
            color: egui::Color32::from_rgb(0xE5, 0x6B, 0x6B),
        });
    }
    v
}

fn list_item(ui: &mut egui::Ui, selected: &mut PerfResource, it: &Item) {
    let is_sel = *selected == it.res;
    let frame = egui::Frame::default()
        .fill(if is_sel {
            theme::row_selected()
        } else {
            egui::Color32::TRANSPARENT
        })
        .rounding(egui::Rounding::same(6.0))
        .inner_margin(egui::Margin::symmetric(8.0, 5.0));
    let inner = frame.show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(egui::RichText::new(&it.name).strong());
                ui.label(egui::RichText::new(&it.value).color(theme::text_dim()));
            });
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if it.hist.len() >= 2 {
                    charts::sparkline(ui, &it.hist, it.max, it.color, egui::vec2(76.0, 30.0));
                }
            });
        });
    });
    let resp = ui.interact(
        inner.response.rect,
        ui.id().with(("perfsel", res_key(it.res))),
        egui::Sense::click(),
    );
    if !is_sel && resp.hovered() {
        ui.painter()
            .rect_filled(inner.response.rect, egui::Rounding::same(6.0), theme::row_hover());
    }
    if resp.clicked() {
        *selected = it.res;
    }
}

fn res_key(r: PerfResource) -> u32 {
    match r {
        PerfResource::Cpu => 0,
        PerfResource::Memory => 1,
        PerfResource::Disk(i) => 100 + i as u32,
        PerfResource::Network => 200,
        PerfResource::Gpu => 201,
    }
}

fn resource_name(r: PerfResource) -> &'static str {
    match r {
        PerfResource::Cpu => "CPU",
        PerfResource::Memory => "内存",
        PerfResource::Disk(_) => "磁盘",
        PerfResource::Network => "网络",
        PerfResource::Gpu => "GPU",
    }
}

fn detail(ui: &mut egui::Ui, snap: &SystemSnapshot, selected: PerfResource, chart_points: &mut usize) {
    let (title, big, subtitle, hist, max, color, stats) = resolve(snap, selected);

    // 标题行:资源名(粗) + 硬件型号(小/暗)
    ui.horizontal(|ui| {
        ui.label(egui::RichText::new(resource_name(selected)).strong().size(16.0));
        ui.label(egui::RichText::new(&title).color(theme::text_dim()).size(12.0));
    });
    ui.add_space(8.0);

    // 图表窗口(取最后 N 个点)
    let window = window_deque(&hist, *chart_points);

    // 大图:铺满整块,当前数值叠加在左上角
    let width = ui.available_width();
    let chart_h = 200.0;
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, chart_h), egui::Sense::hover());
    let painter = ui.painter_at(rect);
    painter.rect_filled(
        rect,
        egui::Rounding::same(4.0),
        egui::Color32::from_rgba_unmultiplied(255, 255, 255, 5),
    );
    painter.rect_stroke(
        rect,
        egui::Rounding::same(4.0),
        egui::Stroke::new(1.0_f32, theme::separator()),
    );
    if window.len() >= 2 {
        let fill = egui::Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), 50);
        charts::paint_series(
            painter.clone(),
            rect.shrink(6.0),
            &window,
            max,
            fill,
            Some((color, egui::Stroke::new(1.6_f32, color))),
        );
    }
    // 当前数值 + 副标题(压在图上)
    painter.text(
        rect.left_top() + egui::vec2(12.0, 6.0),
        egui::Align2::LEFT_TOP,
        &big,
        egui::FontId::proportional(30.0),
        color,
    );
    painter.text(
        rect.left_top() + egui::vec2(12.0, 42.0),
        egui::Align2::LEFT_TOP,
        &subtitle,
        egui::FontId::proportional(12.0),
        theme::text_dim(),
    );

    // 图表右键菜单
    let resp = ui.interact(rect, ui.id().with("perf_chart"), egui::Sense::click());
    let cp_cell = std::cell::Cell::new(*chart_points);
    resp.context_menu(|ui| {
        ui.label("图表时间范围");
        for n in [10usize, 30, 60] {
            if ui.selectable_label(cp_cell.get() == n, format!("{} 秒", n)).clicked() {
                cp_cell.set(n);
            }
        }
        ui.separator();
        if ui.button("将资源值复制为文本").clicked() {
            let mut text = format!("{}\n{}\n", resource_name(selected), title);
            for (k, val) in &stats {
                text.push_str(&format!("{}: {}\n", k, val));
            }
            ui.ctx().copy_text(text);
            ui.close_menu();
        }
        ui.separator();
        ui.add_enabled(false, egui::Button::new("资源监视器(待实现)"));
        ui.add_enabled(false, egui::Button::new("查看硬件详细信息(待实现)"));
    });
    *chart_points = cp_cell.get();

    ui.add_space(12.0);
    ui.separator();
    ui.add_space(6.0);

    // 两列统计网格(每行两对 标签|值)
    egui::Grid::new("perf_stats")
        .num_columns(4)
        .spacing([24.0, 8.0])
        .min_col_width(60.0)
        .show(ui, |ui| {
            for pair in stats.chunks(2) {
                for (k, val) in pair {
                    ui.label(egui::RichText::new(k).color(theme::text_dim()));
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

/// 取历史曲线的最后 n 个点作为图表窗口。
fn window_deque(hist: &VecDeque<f32>, n: usize) -> VecDeque<f32> {
    if n >= hist.len() {
        return hist.clone();
    }
    let mut v: Vec<f32> = hist.iter().rev().take(n).copied().collect();
    v.reverse();
    v.into_iter().collect()
}

#[allow(clippy::type_complexity)]
fn resolve(
    snap: &SystemSnapshot,
    selected: PerfResource,
) -> (String, String, String, VecDeque<f32>, f32, egui::Color32, Vec<(String, String)>) {
    match selected {
        PerfResource::Cpu => {
            let c = &snap.cpu;
            let title = if c.model_name.is_empty() {
                "CPU".to_string()
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
                    ("利用率".into(), format!("{:.0}%", c.overall_usage)),
                    ("速度".into(), format!("{:.2} GHz", c.speed_ghz)),
                    ("基准速度".into(), "—".into()),
                    ("进程".into(), snap.total_processes.to_string()),
                    ("线程".into(), c.threads.to_string()),
                    ("句柄".into(), c.handles.to_string()),
                    ("正常运行时间".into(), fmt_duration(c.up_time)),
                    ("内核(物理)".into(), c.physical_cores.to_string()),
                    ("逻辑处理器".into(), c.logical_cores.to_string()),
                    ("虚拟化".into(), "—".into()),
                    ("L1 缓存".into(), "—".into()),
                    ("L2/L3 缓存".into(), "—".into()),
                ],
            )
        }
        PerfResource::Memory => {
            let m = &snap.memory;
            (
                format!("{:.1} GB", m.total as f64 / 1e9),
                format!("{:.0}%", pct(m.used, m.total)),
                "内存使用率".into(),
                m.history.clone(),
                100.0,
                egui::Color32::from_rgb(0x9B, 0x6A, 0xE5),
                vec![
                    ("使用中".into(), fmt_bytes(m.used)),
                    ("可用".into(), fmt_bytes(m.available)),
                    ("已提交".into(), format!("{} / {}", fmt_bytes(m.used), fmt_bytes(m.total))),
                    ("已缓存".into(), "—".into()),
                    ("分页缓冲池".into(), "—".into()),
                    ("非分页缓冲池".into(), "—".into()),
                    ("速度".into(), "—".into()),
                    ("已使用的插槽".into(), "—".into()),
                    ("外形规格".into(), "—".into()),
                    ("为硬件保留".into(), "—".into()),
                    ("总量".into(), fmt_bytes(m.total)),
                ],
            )
        }
        PerfResource::Disk(i) => snap
            .disks
            .get(i)
            .map(|d| {
                (
                    d.name.clone(),
                    format!("{:.0}%", d.activity_pct),
                    "活动时间".into(),
                    d.history.clone(),
                    100.0,
                    egui::Color32::from_rgb(0x4C, 0xC2, 0x6B),
                    vec![
                        ("活动时间".into(), format!("{:.0}%", d.activity_pct)),
                        ("平均响应时间".into(), format!("{:.1} 毫秒", d.response_time_ms)),
                        ("读取速度".into(), fmt_rate(d.read_bps)),
                        ("写入速度".into(), fmt_rate(d.write_bps)),
                        ("容量".into(), fmt_bytes(d.total)),
                        ("已格式化".into(), fmt_bytes(d.total)),
                        ("系统磁盘".into(), "—".into()),
                        ("类型".into(), "SSD".into()),
                    ],
                )
            })
            .unwrap_or_else(|| empty("磁盘")),
        PerfResource::Network => {
            let n = &snap.network;
            let total = n.send_bps + n.recv_bps;
            let max = n.history.iter().copied().fold(1.0f32, f32::max).max(1024.0);
            (
                n.adapter.clone(),
                fmt_rate(total),
                "吞吐量".into(),
                n.history.clone(),
                max,
                egui::Color32::from_rgb(0xE2, 0xA0, 0x4A),
                vec![
                    ("发送".into(), fmt_rate(n.send_bps)),
                    ("接收".into(), fmt_rate(n.recv_bps)),
                    ("吞吐量".into(), fmt_rate(total)),
                    ("连接类型".into(), if n.adapter.is_empty() { "网络".into() } else { n.adapter.clone() }),
                    ("IPv4 地址".into(), "—".into()),
                    ("SSID".into(), "—".into()),
                ],
            )
        }
        PerfResource::Gpu => snap
            .gpus
            .first()
            .map(|g| {
                (
                    "GPU".into(),
                    format!("{:.0}%", g.usage_pct.unwrap_or(0.0)),
                    "利用率".into(),
                    g.history.clone(),
                    100.0,
                    egui::Color32::from_rgb(0xE5, 0x6B, 0x6B),
                    vec![
                        ("利用率".into(), format!("{:.1}%", g.usage_pct.unwrap_or(0.0))),
                        ("专用 GPU 内存".into(), fmt_bytes(g.dedicated_used.unwrap_or(0))),
                        ("共享 GPU 内存".into(), "—".into()),
                        ("温度".into(), "—".into()),
                        ("驱动版本".into(), "—".into()),
                        ("DirectX".into(), "—".into()),
                    ],
                )
            })
            .unwrap_or_else(|| empty("GPU")),
    }
}

#[allow(clippy::type_complexity)]
fn empty(
    name: &str,
) -> (String, String, String, VecDeque<f32>, f32, egui::Color32, Vec<(String, String)>) {
    (
        name.into(),
        "—".into(),
        "暂无数据".into(),
        VecDeque::new(),
        1.0,
        egui::Color32::from_rgb(0x80, 0x80, 0x80),
        Vec::new(),
    )
}

fn pct(used: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        used as f32 * 100.0 / total as f32
    }
}

fn fmt_bytes(b: u64) -> String {
    let f = b as f64;
    if f >= 1e12 {
        format!("{:.2} TB", f / 1e12)
    } else if f >= 1e9 {
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
        format!("{:.1} Mbps", mbps)
    } else {
        format!("{:.0} Kbps", bps * 8.0 / 1e3)
    }
}

fn fmt_duration(d: std::time::Duration) -> String {
    let s = d.as_secs();
    let days = s / 86400;
    let h = (s % 86400) / 3600;
    let m = (s % 3600) / 60;
    let sec = s % 60;
    format!("{}:{:02}:{:02}:{:02}", days, h, m, sec)
}
