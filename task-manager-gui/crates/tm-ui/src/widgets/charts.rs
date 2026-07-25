//! 图表 widget:area_chart(填充面积 + 顶线)与 sparkline(迷你折线)。
//!
//! 用竖向填充矩形实现「填充面积」(对任意数据都正确,不依赖多边形凸性),
//! 顶上再叠一条折线,视觉上接近 Win11 的面积图。

use std::collections::VecDeque;

use eframe::egui::{self, Color32, Pos2, Rect, Response, Stroke, Ui, Vec2};

/// 绘制填充面积图 + 顶部折线。返回占用区域(供 hover/布局)。
pub fn area_chart(
    ui: &mut Ui,
    history: &VecDeque<f32>,
    max: f32,
    line: Color32,
    fill: Color32,
    size: Vec2,
) -> Response {
    let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::hover());
    paint_series(ui.painter_at(rect), rect, history, max, fill, Some((line, Stroke::new(1.5_f32, line))));
    resp
}

/// 迷你折线图(资源列表项用)。无填充、无边框。
pub fn sparkline(ui: &mut Ui, history: &VecDeque<f32>, max: f32, color: Color32, size: Vec2) -> Response {
    let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::hover());
    paint_series(ui.painter_at(rect), rect, history, max, Color32::TRANSPARENT, Some((color, Stroke::new(1.2_f32, color))));
    resp
}

pub fn paint_series(
    painter: egui::Painter,
    rect: Rect,
    history: &VecDeque<f32>,
    max: f32,
    fill: Color32,
    line: Option<(Color32, Stroke)>,
) {
    let n = history.len();
    if n < 2 {
        return;
    }
    let max = if max <= 0.0 { 1.0 } else { max };
    let step = rect.width() / (n - 1) as f32;
    let val_y = |v: f32| -> f32 {
        let h = (v.clamp(0.0, max) / max) * rect.height();
        rect.bottom() - h
    };

    // 填充:每个采样一个竖向矩形(微重叠避免缝隙)。
    if fill != Color32::TRANSPARENT {
        let bar_w = rect.width() / n as f32 + 1.0;
        for (i, v) in history.iter().enumerate() {
            let y = val_y(*v);
            let r = Rect::from_min_size(Pos2::new(rect.left() + i as f32 * (rect.width() / n as f32), y), Vec2::new(bar_w, rect.bottom() - y));
            painter.rect_filled(r, 0.0, fill);
        }
    }

    // 顶部折线。
    if let Some((col, st)) = line {
        let pts: Vec<Pos2> = history
            .iter()
            .enumerate()
            .map(|(i, v)| Pos2::new(rect.left() + i as f32 * step, val_y(*v)))
            .collect();
        painter.add(egui::Shape::line(pts, st));
        let _ = col;
    }
}
