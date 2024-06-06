use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use tokio::sync::mpsc::Sender;
use windows::{
    core::Interface,
    Win32::Media::Audio::{IAudioSessionControl, IAudioSessionControl2},
};

use super::{
    audio::{get_process_name_by_id, notifier::Notification, IMMAudioDevice, Singleton},
    error::{APIError, UnexpectedErr},
};

pub type AudioDeviceMap = BTreeMap<String, IMMAudioDevice>;

#[derive(serde::Serialize, Debug, Clone)]
pub struct AudioDeviceInfo {
    id: String,
    name: String,
    volume: f32,
    muted: bool,
    sessions: Vec<SessionInfo>,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub pid: u32,
    pub name: Option<String>,
    pub volume: f32,
    pub muted: bool,
}

// impl from
impl From<&IAudioSessionControl> for SessionInfo {
    fn from(session_control: &IAudioSessionControl) -> Self {
        unsafe {
            let session_control2: IAudioSessionControl2 = session_control.cast().unwrap();

            let pid = session_control2.GetProcessId().unwrap();
            println!("pid: {:?}", pid);

            let mut name = None;
            if let Ok(n) = get_process_name_by_id(pid) {
                name = Some(n);
                println!("name: {:?}", name);
            }

            let identifier = session_control2
                .GetSessionIdentifier()
                .unwrap()
                .to_string()
                .unwrap();

            let id = session_control2
                .GetSessionInstanceIdentifier()
                .unwrap()
                .to_string()
                .unwrap();

            Self {
                id,
                pid,
                name,
                volume: 0.0,
                muted: false,
            }
        }
    }
}

impl AudioDeviceInfo {
    fn from_audio(audio: &IMMAudioDevice) -> Result<Self> {
        Ok(Self {
            id: audio.id.clone(),
            name: audio.name.clone(),
            volume: audio.get_volume()?,
            muted: audio.get_mute_state()?,
            sessions: audio
                .session_control_map
                .values()
                .map(|s| SessionInfo::from(s))
                .collect(),
        })
    }
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowsAudioState {
    audio_device_list: Vec<AudioDeviceInfo>,
    default: String,
}

impl WindowsAudioState {
    fn new(audio_dict: &AudioDeviceMap, default: String) -> Result<Self> {
        let audio_device_list = audio_dict
            .values()
            .map(|a| AudioDeviceInfo::from_audio(a))
            .collect::<Result<Vec<_>>>()?;

        Ok(Self {
            audio_device_list,
            default,
        })
    }
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioStateChangePayload {
    windows_audio_state: WindowsAudioState,
    notification: Option<Notification>,
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
        WindowsAudioState::new(&dict, default)?
    };

    let payload = AudioStateChangePayload {
        windows_audio_state: audio_state,
        notification,
    };

    tx.send(payload).await.map_err(|_| APIError::Unexpected {
        inner: UnexpectedErr::MPSCClosedError,
    })?;

    Ok(())
}
