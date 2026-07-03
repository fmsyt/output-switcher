use anyhow::Result;
use serde_json::Value;
use std::{collections::HashMap, process::Command, sync::Arc};
use tokio::sync::mpsc::Sender;

pub mod notifier {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(tag = "type")]
    pub enum Notification {
        DefaultDeviceChanged { id: String },
        DeviceAdded { id: String },
        DeviceRemoved { id: String },
        DeviceStateChanged { id: String, state: u32 },
        PropertyValueChanged { id: String, key: String },
        VolumeChanged { id: String, volume: f32, muted: bool },
        SessionVolumeChanged { process_id: u32, volume: f32, muted: bool },
        SessionCreated { device_id: String },
        SessionTerminated { device_id: String },
    }
}

/// Minimal PipeWire backend implementation using pw-dump (if available).
pub struct Singleton {
    tx: Sender<notifier::Notification>,
}

impl Singleton {
    pub fn new(tx: &Sender<notifier::Notification>) -> Result<Self> {
        let s = Singleton { tx: tx.clone() };

        // spawn a background poller to detect device/default changes
        let tx_clone = s.tx.clone();

        // initial emit: send current devices and default so frontend doesn't wait
        let tx_init = tx_clone.clone();
        tokio::spawn(async move {
            let ids_res = tokio::task::spawn_blocking(|| list_device_ids()).await;
            if let Ok(ids) = ids_res {
                for id in ids.iter() {
                    if let Err(e) = tx_init.send(notifier::Notification::DeviceAdded { id: id.clone() }).await {
                        log::error!("failed to send initial DeviceAdded: {:?}", e);
                    }
                }
            }

            let default_res = tokio::task::spawn_blocking(|| get_default_from_pactl()).await;
            if let Ok(default_opt) = default_res {
                if let Some(d) = default_opt {
                    if let Err(e) = tx_init.send(notifier::Notification::DefaultDeviceChanged { id: d }).await {
                        log::error!("failed to send initial DefaultDeviceChanged: {:?}", e);
                    }
                }
            }
        });

        tokio::spawn(async move {
            use std::time::Duration;
            use tokio::time::sleep;

            const POLL_INTERVAL_MS: u64 = 1000;
            const DEBOUNCE_MS: u64 = 300;

            let mut last_ids: Vec<String> = Vec::new();
            let mut last_default: Option<String> = None;

            loop {
                // enumerate device ids in blocking task
                let ids_res = tokio::task::spawn_blocking(|| list_device_ids()).await;
                let default_res = tokio::task::spawn_blocking(|| get_default_from_pactl()).await;

                let ids = match ids_res {
                    Ok(v) => v,
                    Err(_) => {
                        sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
                        continue;
                    }
                };

                let default_opt = match default_res {
                    Ok(v) => v,
                    Err(_) => None,
                };

                // Detect if anything changed compared to last known state
                let changed = ids != last_ids || default_opt != last_default;

                if changed {
                    // debounce/coalesce rapid changes
                    sleep(Duration::from_millis(DEBOUNCE_MS)).await;

                    // Re-query after debounce window
                    let ids_after_res = tokio::task::spawn_blocking(|| list_device_ids()).await;
                    let default_after_res = tokio::task::spawn_blocking(|| get_default_from_pactl()).await;

                    let ids_after = match ids_after_res {
                        Ok(v) => v,
                        Err(_) => ids.clone(),
                    };
                    let default_after = match default_after_res {
                        Ok(v) => v,
                        Err(_) => default_opt.clone(),
                    };

                    // compute diffs based on last_ids -> ids_after
                    for id in ids_after.iter() {
                        if !last_ids.contains(id) {
                            if let Err(e) = tx_clone.send(notifier::Notification::DeviceAdded { id: id.clone() }).await {
                                log::error!("failed to send DeviceAdded: {:?}", e);
                            }
                        }
                    }
                    for id in last_ids.iter() {
                        if !ids_after.contains(id) {
                            if let Err(e) = tx_clone.send(notifier::Notification::DeviceRemoved { id: id.clone() }).await {
                                log::error!("failed to send DeviceRemoved: {:?}", e);
                            }
                        }
                    }

                    // default change
                    if default_after != last_default {
                        if let Some(d) = default_after.clone() {
                            if let Err(e) = tx_clone.send(notifier::Notification::DefaultDeviceChanged { id: d }).await {
                                log::error!("failed to send DefaultDeviceChanged: {:?}", e);
                            }
                        }
                    }

                    last_ids = ids_after;
                    last_default = default_after;
                }

                sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
            }
        });

        Ok(s)
    }

    pub fn get_active_audio_devices(self: &Arc<Self>) -> Result<Vec<IMMAudioDevice>> {
        // Prefer pactl sinks (pulse compatibility) so IDs match notifications like "alsa_output..."
        if let Ok(out) = Command::new("pactl").arg("list").arg("sinks").output() {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    // Parse sinks blocks: each block starts with "Sink #"
                    let mut devices = Vec::new();
                    let parts: Vec<&str> = text.split("Sink #").collect();
                    for part in parts.into_iter().skip(1) {
                        let mut name = None;
                        let mut desc = None;
                        for line in part.lines() {
                            let l = line.trim();
                            if l.starts_with("Name:") {
                                name = Some(l[5..].trim().to_string());
                            } else if l.starts_with("Description:") {
                                desc = Some(l[12..].trim().to_string());
                            }
                        }

                        if let Some(id) = name {
                            let display = desc.unwrap_or_else(|| id.clone());
                            let dev = IMMAudioDevice::new(Arc::clone(self), id.clone(), display)?;
                            devices.push(dev);
                        }
                    }

                    if !devices.is_empty() {
                        return Ok(devices);
                    }
                }
            }
        }

        // Fallback to pw-dump if pactl not available or returned nothing
        let out = Command::new("pw-dump").output();

        let mut devices = Vec::new();

        if let Ok(out) = out {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some(array) = json.as_array() {
                            for entry in array.iter() {
                                if let Some(t) = entry.get("type") {
                                    if t == "Node" {
                                        // media.class in props may indicate sink/source
                                        let props = entry.get("props").and_then(|p| p.as_object());
                                        let media_class = props
                                            .and_then(|p| p.get("media.class"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");

                                        if media_class.contains("Audio/Sink") {
                                            let id = entry
                                                .get("id")
                                                .and_then(|v| v.as_i64())
                                                .map(|i| format!("pw-{}", i))
                                                .unwrap_or_else(|| {
                                                    let millis = ::std::time::SystemTime::now()
                                                        .duration_since(::std::time::UNIX_EPOCH)
                                                        .map(|d| d.as_millis())
                                                        .unwrap_or(0);
                                                    format!("pw-unknown-{}", millis)
                                                });

                                            let name = props
                                                .and_then(|p|
                                                    p.get("node.description")
                                                        .or_else(|| p.get("node.name")))
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("Unknown")
                                                .to_string();

                                            let dev = IMMAudioDevice::new(Arc::clone(self), id.clone(), name.clone())?;

                                            devices.push(dev);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // If no devices found, return empty vector (frontend shows spinner)
        Ok(devices)
    }

    pub fn get_default_audio_id(&self) -> Result<String> {
        // Try pactl fallback
        if let Ok(out) = Command::new("pactl").arg("info").output() {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    for line in text.lines() {
                        if line.starts_with("Default Sink:") || line.starts_with("Default Server Name:") {
                            if let Some(pos) = line.find(":") {
                                let v = line[pos + 1..].trim();
                                if !v.is_empty() {
                                    return Ok(v.to_string());
                                }
                            }
                        }
                        if line.starts_with("Default Sink: ") {
                            let v = line[14..].trim();
                            if !v.is_empty() {
                                return Ok(v.to_string());
                            }
                        }
                    }
                }
            }
        }

        Err(anyhow::anyhow!("No default device found"))
    }
}

// Helper: list device ids using pw-dump
fn list_device_ids() -> Vec<String> {
    let mut ids = Vec::new();
    if let Ok(out) = Command::new("pw-dump").output() {
        if out.status.success() {
            if let Ok(text) = String::from_utf8(out.stdout) {
                if let Ok(json) = serde_json::from_str::<Value>(&text) {
                    if let Some(array) = json.as_array() {
                        for entry in array.iter() {
                            if let Some(t) = entry.get("type") {
                                if t == "Node" {
                                    let props = entry.get("props").and_then(|p| p.as_object());
                                    let media_class = props
                                        .and_then(|p| p.get("media.class"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");

                                    if media_class.contains("Audio/Sink") {
                                        let id = entry
                                            .get("id")
                                            .and_then(|v| v.as_i64())
                                            .map(|i| format!("pw-{}", i))
                                            .unwrap_or_else(|| {
                                                let millis = ::std::time::SystemTime::now()
                                                    .duration_since(::std::time::UNIX_EPOCH)
                                                    .map(|d| d.as_millis())
                                                    .unwrap_or(0);
                                                format!("pw-unknown-{}", millis)
                                            });

                                        ids.push(id);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    ids
}

// Helpers: resolve executable & icon paths for sessions
fn exe_path_for_pid(pid: u32) -> Option<String> {
    let p = format!("/proc/{}/exe", pid);
    match std::fs::read_link(p) {
        Ok(pathbuf) => pathbuf.to_str().map(|s| s.to_string()),
        Err(_) => None,
    }
}

fn resolve_icon_name(icon: &str) -> Option<String> {
    use std::path::Path;
    if icon.contains('/') {
        // absolute or relative path
        if Path::new(icon).exists() {
            return Some(icon.to_string());
        }
    } else {
        let exts = ["png", "svg", "xpm"];
        // check /usr/share/pixmaps
        for ext in &exts {
            let cand = format!("/usr/share/pixmaps/{}.{}", icon, ext);
            if Path::new(&cand).exists() {
                return Some(cand);
            }
        }

        // check hicolor icons common locations
        if let Ok(entries) = std::fs::read_dir("/usr/share/icons/hicolor") {
            for entry in entries.flatten() {
                let size_dir = entry.path();
                let apps_dir = size_dir.join("apps");
                if apps_dir.exists() && apps_dir.is_dir() {
                    for ext in &exts {
                        let cand = apps_dir.join(format!("{}.{}", icon, ext));
                        if cand.exists() {
                            return cand.to_str().map(|s| s.to_string());
                        }
                    }
                }
            }
        }

        // fallback: search /usr/share/icons recursively shallow
        if let Ok(entries) = std::fs::read_dir("/usr/share/icons") {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    if let Ok(subs) = std::fs::read_dir(&p) {
                        for s in subs.flatten() {
                            let apps = s.path().join("apps");
                            for ext in &exts {
                                let cand = apps.join(format!("{}.{}", icon, ext));
                                if cand.exists() {
                                    return cand.to_str().map(|s| s.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn find_icon_for_process(exe_path: &Option<String>, process_name: &str) -> Option<String> {
    use std::path::Path;
    // Try desktop files
    let candidates = vec![
        std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join(".local/share/applications")),
        Some(std::path::PathBuf::from("/usr/share/applications")),
    ];

    for maybe_dir in candidates.into_iter().flatten() {
        if let Ok(entries) = std::fs::read_dir(&maybe_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("desktop") {
                    if let Ok(text) = std::fs::read_to_string(&path) {
                        let mut icon_field: Option<String> = None;
                        let mut exec_field: Option<String> = None;
                        let mut name_field: Option<String> = None;
                        for line in text.lines() {
                            if line.starts_with("Icon=") {
                                icon_field = Some(line[5..].trim().to_string());
                            } else if line.starts_with("Exec=") {
                                exec_field = Some(line[5..].trim().to_string());
                            } else if line.starts_with("Name=") {
                                name_field = Some(line[5..].trim().to_string());
                            }
                        }

                        let mut matched = false;
                        if let Some(exec) = &exec_field {
                            if let Some(exe) = exe_path {
                                if exec.contains(exe.as_str()) || exec.contains(std::path::Path::new(exe).file_name().and_then(|s| s.to_str()).unwrap_or("")) {
                                    matched = true;
                                }
                            } else if let Some(bn) = exec.split_whitespace().next() {
                                if bn == process_name {
                                    matched = true;
                                }
                            }
                        }
                        if !matched {
                            if let Some(namef) = &name_field {
                                if namef == process_name {
                                    matched = true;
                                }
                            }
                        }

                        if matched {
                            if let Some(ic) = icon_field {
                                if let Some(path) = resolve_icon_name(&ic) {
                                    return Some(path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // fallback: try pixmaps by process name or exe basename
    let exename = exe_path.as_ref().and_then(|e| std::path::Path::new(e).file_name().and_then(|s| s.to_str())).map(|s| s.to_string()).unwrap_or(process_name.to_string());
    let exts = ["png", "svg", "xpm"];
    for ext in &exts {
        let cand = format!("/usr/share/pixmaps/{}.{}", exename, ext);
        if Path::new(&cand).exists() {
            return Some(cand);
        }
    }

    None
}

// Helper: get default sink name via pactl
fn get_default_from_pactl() -> Option<String> {
    if let Ok(out) = Command::new("pactl").arg("info").output() {
        if out.status.success() {
            if let Ok(text) = String::from_utf8(out.stdout) {
                for line in text.lines() {
                    if line.starts_with("Default Sink:") || line.starts_with("Default Server Name:") {
                        if let Some(pos) = line.find(":") {
                            let v = line[pos + 1..].trim();
                            if !v.is_empty() {
                                return Some(v.to_string());
                            }
                        }
                    }
                    if line.starts_with("Default Sink: ") {
                        let v = line[14..].trim();
                        if !v.is_empty() {
                            return Some(v.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

unsafe impl Send for Singleton {}
unsafe impl Sync for Singleton {}

pub struct IMMAudioDevice {
    pub(crate) is: Arc<Singleton>,

    pub id: String,
    pub name: String,

    // session map placeholder
    pub(crate) session_control_map: HashMap<String, String>,
}

unsafe impl Send for IMMAudioDevice {}
unsafe impl Sync for IMMAudioDevice {}

impl IMMAudioDevice {
    pub fn new(is: Arc<Singleton>, id: String, name: String) -> Result<Self> {
        Ok(IMMAudioDevice {
            is,
            id,
            name,
            session_control_map: HashMap::new(),
        })
    }

    pub fn set_as_default(&self) -> Result<()> {
        // best-effort: try pactl set-default-sink
        if let Ok(_out) = Command::new("pactl").arg("set-default-sink").arg(&self.id).output() {
            // ignore errors for now
        }
        Ok(())
    }

    pub fn get_volume(&self) -> Result<f32> {
        // Try to parse 'pactl list sinks' and find matching Name: entry
        if let Ok(out) = Command::new("pactl").arg("list").arg("sinks").output() {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    let parts: Vec<&str> = text.split("Sink #").collect();
                    for part in parts.into_iter().skip(1) {
                        let mut name_match = false;
                        let mut vol = None;
                        for line in part.lines() {
                            let l = line.trim();
                            if l.starts_with("Name:") {
                                let name = l[5..].trim();
                                if name == self.id {
                                    name_match = true;
                                }
                            }
                            if name_match && l.starts_with("Volume:") {
                                if let Some(pos) = l.find('%') {
                                    let slice = &l[..pos];
                                    if let Some(num_str) = slice.split_whitespace().last() {
                                        if let Ok(pct) = num_str.parse::<f32>() {
                                            vol = Some(pct / 100.0);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if name_match {
                            if let Some(v) = vol {
                                return Ok(v);
                            } else {
                                return Ok(1.0);
                            }
                        }
                    }
                }
            }
        }
        Ok(1.0)
    }

    pub fn get_mute_state(&self) -> Result<bool> {
        if let Ok(out) = Command::new("pactl").arg("list").arg("sinks").output() {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    let parts: Vec<&str> = text.split("Sink #").collect();
                    for part in parts.into_iter().skip(1) {
                        let mut name_match = false;
                        for line in part.lines() {
                            let l = line.trim();
                            if l.starts_with("Name:") {
                                let name = l[5..].trim();
                                if name == self.id {
                                    name_match = true;
                                }
                            }
                            if name_match && l.starts_with("Mute:") {
                                return Ok(l[5..].trim().starts_with("yes"));
                            }
                        }
                        if name_match {
                            break;
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    pub fn set_volume(&self, volume: f32) -> Result<()> {
        // pactl expects percentage
        let pct = format!("{}%", (volume * 100.0).round() as i32);
        let _ = Command::new("pactl")
            .arg("set-sink-volume")
            .arg(&self.id)
            .arg(&pct)
            .output();
        Ok(())
    }

    pub fn set_mute_state(&self, mute_state: bool) -> Result<()> {
        let m = if mute_state { "1" } else { "0" };
        let _ = Command::new("pactl")
            .arg("set-sink-mute")
            .arg(&self.id)
            .arg(m)
            .output();
        Ok(())
    }

    pub fn get_session_list(&self) -> Result<Vec<(String, u32, String, f32, bool, String, String, String)>> {
        // Use pactl (PulseAudio compatibility) to list sink inputs (streams)
        let out = Command::new("pactl").arg("list").arg("sink-inputs").output();
        let mut sessions = Vec::new();

        if let Ok(out) = out {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    // split by "Sink Input #"
                    let parts: Vec<&str> = text.split("Sink Input #").collect();
                    for part in parts.into_iter().skip(1) {
                        // first token starts with id number
                        let mut lines = part.lines();
                        if let Some(first_line) = lines.next() {
                            let id_str = first_line.trim().split_whitespace().next().unwrap_or("0");
                            let session_id = id_str.to_string();

                            let mut pid: u32 = 0;
                            let mut process_name = String::new();
                            let mut volume = 0.0f32;
                            let mut muted = false;
                            let mut display_name = String::new();

                            for line in lines {
                                let l = line.trim();
                                if l.starts_with("Mute:") {
                                    muted = l[5..].trim().starts_with("yes");
                                } else if l.starts_with("Volume:") {
                                    // find percentage
                                    if let Some(pos) = l.find('%') {
                                        // scan backwards to find number start
                                        let slice = &l[..pos];
                                        if let Some(num_str) = slice.split_whitespace().last() {
                                            if let Ok(pct) = num_str.parse::<f32>() {
                                                volume = pct / 100.0;
                                            }
                                        }
                                    }
                                } else if l.starts_with("application.process.id =") {
                                    // format: application.process.id = "1234"
                                    if let Some(eq_pos) = l.find('=') {
                                        let val = l[eq_pos + 1..].trim().trim_matches('"').trim().to_string();
                                        if let Ok(v) = val.parse::<u32>() {
                                            pid = v;
                                        }
                                    }
                                } else if l.starts_with("application.process.binary =") {
                                    if let Some(eq_pos) = l.find('=') {
                                        process_name = l[eq_pos + 1..].trim().trim_matches('"').to_string();
                                    }
                                } else if l.starts_with("application.name =") {
                                    if display_name.is_empty() {
                                        if let Some(eq_pos) = l.find('=') {
                                            display_name = l[eq_pos + 1..].trim().trim_matches('"').to_string();
                                        }
                                    }
                                } else if l.starts_with("media.name =") {
                                    if display_name.is_empty() {
                                        if let Some(eq_pos) = l.find('=') {
                                            display_name = l[eq_pos + 1..].trim().trim_matches('"').to_string();
                                        }
                                    }
                                }
                            }

                            let exe_opt = if pid != 0 { exe_path_for_pid(pid) } else { None };
                            let exe_str = exe_opt.clone().unwrap_or_default();
                            let icon_opt = find_icon_for_process(&exe_opt, if display_name.is_empty() { &process_name } else { &display_name });
                            let icon_str = icon_opt.unwrap_or_default();

                            sessions.push((
                                session_id,
                                pid,
                                process_name,
                                volume,
                                muted,
                                display_name,
                                exe_str,
                                icon_str,
                            ));
                        }
                    }
                }
            }
        }

        Ok(sessions)
    }

    pub fn set_session_volume(&self, session_id: &str, volume: f32) -> Result<()> {
        // pactl expects percentage
        let pct = format!("{}%", (volume * 100.0).round() as i32);
        let _ = Command::new("pactl")
            .arg("set-sink-input-volume")
            .arg(session_id)
            .arg(&pct)
            .output();
        Ok(())
    }

    pub fn set_session_mute_state(&self, session_id: &str, mute_state: bool) -> Result<()> {
        let m = if mute_state { "1" } else { "0" };
        let _ = Command::new("pactl")
            .arg("set-sink-input-mute")
            .arg(session_id)
            .arg(m)
            .output();
        Ok(())
    }

    pub fn get_session_volume(&self, session_id: &str) -> Result<f32> {
        // ask pactl list sink-inputs and find matching id
        if let Ok(out) = Command::new("pactl").arg("list").arg("sink-inputs").output() {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    let parts: Vec<&str> = text.split("Sink Input #").collect();
                    for part in parts.into_iter().skip(1) {
                        if part.trim_start().starts_with(session_id) {
                            for line in part.lines() {
                                let l = line.trim();
                                if l.starts_with("Volume:") {
                                    if let Some(pos) = l.find('%') {
                                        let slice = &l[..pos];
                                        if let Some(num_str) = slice.split_whitespace().last() {
                                            if let Ok(pct) = num_str.parse::<f32>() {
                                                return Ok(pct / 100.0);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(0.0)
    }

    pub fn get_session_mute_state(&self, session_id: &str) -> Result<bool> {
        if let Ok(out) = Command::new("pactl").arg("list").arg("sink-inputs").output() {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    let parts: Vec<&str> = text.split("Sink Input #").collect();
                    for part in parts.into_iter().skip(1) {
                        if part.trim_start().starts_with(session_id) {
                            for line in part.lines() {
                                let l = line.trim();
                                if l.starts_with("Mute:") {
                                    return Ok(l[5..].trim().starts_with("yes"));
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    pub fn get_process_name(&self, _process_id: u32) -> Result<String> {
        Ok("システム音".to_string())
    }

    pub fn get_session_display_name(&self, _session_id: &str) -> Option<String> {
        None
    }

    pub fn get_session_icon_path(&self, _session_id: &str) -> Option<String> {
        None
    }

    pub fn get_session_exe_path(&self, _session_id: &str) -> Option<String> {
        None
    }
}
