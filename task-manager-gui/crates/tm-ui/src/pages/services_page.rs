//! 服务页:名称/描述/状态/启动类型,支持搜索过滤;右键行可启动/停止。

use eframe::egui;
use tm_core::services::{ServiceInfo, ServiceStartType, ServiceState};

use crate::theme;

pub fn show(ui: &mut egui::Ui, items: &[ServiceInfo], search: &str) -> bool {
    let q = search.trim().to_ascii_lowercase();
    let invalidate = std::cell::Cell::new(false);
    ui.add_space(2.0);
    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Grid::new("services_grid")
                .num_columns(4)
                .striped(true)
                .min_col_width(80.0)
                .spacing([24.0, 4.0])
                .show(ui, |ui| {
                    ui.strong("名称");
                    ui.strong("描述");
                    ui.strong("状态");
                    ui.strong("启动类型");
                    ui.end_row();
                    for s in items.iter().filter(|s| matches_q(s, &q)) {
                        let name_resp = ui.label(&s.name);
                        ui.label(&s.display_name);
                        ui.label(state_str(s.status));
                        ui.label(start_str(s.start_type));
                        ui.end_row();

                        let nm = s.name.clone();
                        let st = s.status;
                        name_resp.context_menu(|ui| match st {
                            ServiceState::Running => {
                                if ui.button("停止").clicked() {
                                    let _ = tm_core::services::stop(&nm);
                                    invalidate.set(true);
                                    ui.close_menu();
                                }
                            }
                            ServiceState::Stopped => {
                                if ui.button("启动").clicked() {
                                    let _ = tm_core::services::start(&nm);
                                    invalidate.set(true);
                                    ui.close_menu();
                                }
                            }
                            _ => {
                                ui.label("当前状态不可操作");
                            }
                        });
                    }
                });
        });
    ui.label(format!("共 {} 个服务(右键行:启动/停止)", items.len()));
    let _ = theme::text_dim();
    invalidate.get()
}

fn matches_q(s: &ServiceInfo, q: &str) -> bool {
    q.is_empty()
        || s.name.to_ascii_lowercase().contains(q)
        || s.display_name.to_ascii_lowercase().contains(q)
}

fn state_str(s: ServiceState) -> egui::RichText {
    let (t, c) = match s {
        ServiceState::Running => ("正在运行", egui::Color32::from_rgb(0x4C, 0xC2, 0x6B)),
        ServiceState::Stopped => ("已停止", theme::text_dim()),
        ServiceState::Starting => ("启动中", egui::Color32::from_rgb(0xE2, 0xC0, 0x4A)),
        ServiceState::Stopping => ("停止中", egui::Color32::from_rgb(0xE2, 0xA0, 0x4A)),
        ServiceState::Paused => ("已暂停", theme::text_dim()),
        _ => ("其他", theme::text_dim()),
    };
    egui::RichText::new(t).color(c)
}

fn start_str(s: ServiceStartType) -> &'static str {
    match s {
        ServiceStartType::Auto => "自动",
        ServiceStartType::Manual => "手动",
        ServiceStartType::Disabled => "已禁用",
        ServiceStartType::System => "系统",
        _ => "其他",
    }
}
