//! 持久化设置(暗/亮主题、置顶、默认页),存于 %APPDATA%\ran-task-manager\settings.txt。

use crate::pages::PageKind;

#[derive(Clone)]
pub struct Settings {
    pub dark_mode: bool,
    pub always_on_top: bool,
    pub default_page: PageKind,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            dark_mode: true,
            always_on_top: false,
            default_page: PageKind::Processes,
        }
    }
}

fn path() -> Option<std::path::PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let dir = std::path::PathBuf::from(appdata).join("ran-task-manager");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("settings.txt"))
}

pub fn load() -> Settings {
    let mut s = Settings::default();
    if let Some(p) = path() {
        if let Ok(txt) = std::fs::read_to_string(&p) {
            for line in txt.lines() {
                if let Some(v) = line.strip_prefix("dark=") {
                    s.dark_mode = v.trim() == "true";
                } else if let Some(v) = line.strip_prefix("aot=") {
                    s.always_on_top = v.trim() == "true";
                } else if let Some(v) = line.strip_prefix("default=") {
                    s.default_page = parse_page(v.trim());
                }
            }
        }
    }
    s
}

pub fn save(s: &Settings) {
    if let Some(p) = path() {
        let txt = format!(
            "dark={}\naot={}\ndefault={}\n",
            s.dark_mode,
            s.always_on_top,
            page_name(s.default_page)
        );
        let _ = std::fs::write(&p, txt);
    }
}

fn page_name(p: PageKind) -> &'static str {
    match p {
        PageKind::Processes => "processes",
        PageKind::Performance => "performance",
        PageKind::AppHistory => "apphistory",
        PageKind::StartupApps => "startup",
        PageKind::Users => "users",
        PageKind::Details => "details",
        PageKind::Services => "services",
    }
}

fn parse_page(s: &str) -> PageKind {
    match s {
        "performance" => PageKind::Performance,
        "apphistory" => PageKind::AppHistory,
        "startup" => PageKind::StartupApps,
        "users" => PageKind::Users,
        "details" => PageKind::Details,
        "services" => PageKind::Services,
        _ => PageKind::Processes,
    }
}
