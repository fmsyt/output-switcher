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
        tokio::spawn(async move {
            use std::time::Duration;
            use tokio::time::sleep;

            let mut last_ids: Vec<String> = Vec::new();
            let mut last_default: Option<String> = None;

            loop {
                // enumerate device ids in blocking task
                let ids_res = tokio::task::spawn_blocking(|| list_device_ids()).await;
                if let Ok(ids) = ids_res {
                    // compare
                    if ids != last_ids {
                        // detect added/removed
                        for id in ids.iter() {
                            if !last_ids.contains(id) {
                                let _ = tx_clone
                                    .blocking_send(notifier::Notification::DeviceAdded { id: id.clone() });
                            }
                        }
                        for id in last_ids.iter() {
                            if !ids.contains(id) {
                                let _ = tx_clone
                                    .blocking_send(notifier::Notification::DeviceRemoved { id: id.clone() });
                            }
                        }

                        last_ids = ids;
                    }

                    // check default
                    let default_res = tokio::task::spawn_blocking(|| get_default_from_pactl()).await;
                    if let Ok(default_opt) = default_res {
                        if default_opt != last_default {
                            if let Some(d) = default_opt.clone() {
                                let _ = tx_clone.blocking_send(notifier::Notification::DefaultDeviceChanged { id: d });
                            }
                            last_default = default_opt;
                        }
                    }
                }

                sleep(Duration::from_millis(1000)).await;
            }
        });

        Ok(s)
    }

    pub fn get_active_audio_devices(self: &Arc<Self>) -> Result<Vec<IMMAudioDevice>> {
        // Try to call `pw-dump` and parse nodes
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

                                            let dev = IMMAudioDevice {
                                                is: Arc::clone(self),
                                                id,
                                                name,
                                                // placeholders
                                                session_control_map: HashMap::new(),
                                            };

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
        // Not implemented: return 1.0 as full volume
        Ok(1.0)
    }

    pub fn get_mute_state(&self) -> Result<bool> {
        Ok(false)
    }

    pub fn set_volume(&self, _volume: f32) -> Result<()> {
        // best-effort: try pactl set-sink-volume
        let _ = Command::new("pactl")
            .arg("set-sink-volume")
            .arg(&self.id)
            .arg("100%")
            .output();
        Ok(())
    }

    pub fn set_mute_state(&self, _mute_state: bool) -> Result<()> {
        let _ = Command::new("pactl")
            .arg("set-sink-mute")
            .arg(&self.id)
            .arg("0")
            .output();
        Ok(())
    }

    pub fn get_session_list(&self) -> Result<Vec<(String, u32, String, f32, bool, String, String, String)>> {
        // PipeWire session enumeration is not implemented yet. Return empty list.
        Ok(Vec::new())
    }

    pub fn set_session_volume(&self, _session_id: &str, _volume: f32) -> Result<()> {
        // Not supported in this shim
        Ok(())
    }

    pub fn set_session_mute_state(&self, _session_id: &str, _mute_state: bool) -> Result<()> {
        Ok(())
    }

    pub fn get_session_volume(&self, _session_id: &str) -> Result<f32> {
        Ok(0.0)
    }

    pub fn get_session_mute_state(&self, _session_id: &str) -> Result<bool> {
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
