use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use tokio::sync::mpsc::Sender;

use super::{
    audio::{notifier::Notification, IMMAudioDevice, Singleton},
    error::{APIError, UnexpectedErr},
};

pub type AudioDeviceMap = BTreeMap<String, IMMAudioDevice>;

#[derive(serde::Serialize, Debug, Clone)]
pub struct AudioSessionInfo {
    pub session_id: String,
    pub process_id: u32,
    pub process_name: String,
    pub volume: f32,
    pub muted: bool,
    pub display_name: String,
    pub icon_path: String,
    pub exe_path: String,
    pub icon_data: String,
}

impl AudioSessionInfo {
    pub fn from_session(session_id: String, process_id: u32, process_name: String, volume: f32, muted: bool, display_name: String, icon_path: String, exe_path: String, icon_data: String) -> Self {
        Self {
            session_id,
            process_id,
            process_name,
            volume,
            muted,
            display_name,
            icon_path,
            exe_path,
            icon_data,
        }
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct AudioDeviceInfo {
    id: String,
    name: String,
    volume: f32,
    muted: bool,
}

impl AudioDeviceInfo {
    fn from_audio(audio: &IMMAudioDevice) -> Result<Self> {
        Ok(Self {
            id: audio.id.clone(),
            name: audio.name.clone(),
            volume: audio.get_volume()?,
            muted: audio.get_mute_state()?,
        })
    }
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfoOut {
    pub id: String,
    pub name: String,
    pub volume: f32,
    pub muted: bool,
}

impl AudioDeviceInfoOut {
    fn from_audio(audio: &IMMAudioDevice) -> Result<Self> {
        Ok(Self {
            id: audio.id.clone(),
            name: audio.name.clone(),
            volume: audio.get_volume()?,
            muted: audio.get_mute_state()?,
        })
    }
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    pub default: String,
    pub audio_device_list: Vec<AudioDeviceInfoOut>,
}

impl AudioState {
    fn new(audio_dict: &AudioDeviceMap, default: String) -> Result<Self> {
        let audio_device_list = audio_dict
            .values()
            .map(|a| AudioDeviceInfoOut::from_audio(a))
            .collect::<Result<Vec<_>>>()?;

        Ok(Self {
            default,
            audio_device_list,
        })
    }
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioStateChangePayload {
    // preferred platform-agnostic field
    pub audio_state: AudioState,
    // legacy windows field for backward compatibility
    pub windows_audio_state: Option<AudioState>,
    pub notification: Option<Notification>,
}

pub async fn ipc_sender(
    is: &Arc<Singleton>,
    audio_dict: &Arc<Mutex<AudioDeviceMap>>,
    notification: Option<Notification>,
    tx: &Sender<AudioStateChangePayload>,
) -> Result<()> {
    let default = is.get_default_audio_id()?;
    let audio_state = {
        let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
            inner: UnexpectedErr::LockError,
        })?;
        AudioState::new(&dict, default)?
    };

    let payload = AudioStateChangePayload {
        audio_state: audio_state.clone(),
        windows_audio_state: Some(audio_state),
        notification,
    };

    tx.send(payload).await.map_err(|_| APIError::Unexpected {
        inner: UnexpectedErr::MPSCClosedError,
    })?;

    Ok(())
}
