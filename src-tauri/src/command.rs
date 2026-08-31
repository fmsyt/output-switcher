use crate::{icon_extractor, ipc};

use anyhow::Result;
use icon_extractor::{extract_icon_as_base64, extract_system_icon};
use ipc::{
    error::{APIError, UnexpectedErr},
    init::IPCHandlers,
    sender::{AudioDeviceMap, AudioSessionInfo},
};
use std::sync::{Arc, Mutex};
use tauri::async_runtime::Sender;
use tauri::State;

#[tauri::command]
pub async fn query(tx: State<'_, Sender<IPCHandlers>>, query: IPCHandlers) -> Result<(), APIError> {
    log::info!("query: {:?}", query);
    tx.send(query).await.map_err(|_| APIError::Unexpected {
        inner: UnexpectedErr::MPSCClosedError,
    })?;

    Ok(())
}

#[tauri::command]
pub async fn get_audio_sessions(
    audio_dict: State<'_, Arc<Mutex<AudioDeviceMap>>>,
    device_id: String,
) -> Result<Vec<AudioSessionInfo>, APIError> {
    let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
        inner: UnexpectedErr::LockError,
    })?;

    let audio = dict.get(&device_id).ok_or(APIError::SomethingWrong {
        msg: format!("No such audio device: {:?}", device_id),
    })?;

    let sessions = audio
        .get_session_list()
        .map_err(|e| APIError::SomethingWrong {
            msg: format!("@audio.get_session_list {:?}", e),
        })?;

    let session_infos = sessions
        .into_iter()
        .map(
            |(session_id, pid, name, volume, muted, display_name, icon_path, exe_path)| {
                // 実行ファイルからアイコンを抽出
                let icon_data = if pid == 0 {
                    // システム音の場合はシステムアイコンを使用
                    extract_system_icon(32).unwrap_or_default()
                } else if !exe_path.is_empty() {
                    extract_icon_as_base64(&exe_path, 32).unwrap_or_default()
                } else {
                    String::new()
                };

                AudioSessionInfo::from_session(
                    session_id,
                    pid,
                    name,
                    volume,
                    muted,
                    display_name,
                    icon_path,
                    exe_path,
                    icon_data,
                )
            },
        )
        .collect();

    Ok(session_infos)
}
