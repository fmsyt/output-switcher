use anyhow::Result;
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use tauri::{App, Emitter, Manager, Wry};
use tokio::sync::mpsc::{channel, Receiver, Sender};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

use super::{
    audio::{notifier::Notification, IMMAudioDevice, Singleton},
    error::*,
    sender::{ipc_sender, AudioDeviceMap, AudioStateChangePayload},
};

type AudioDict = BTreeMap<String, IMMAudioDevice>;

#[derive(serde::Deserialize, Debug, Clone)]
#[serde(tag = "kind")]
pub enum IPCHandlers {
    AudioDictUpdate {
        notification: Notification,
    },
    AudioDict,
    DefaultAudioChange {
        id: String,
    },
    VolumeChange {
        id: String,
        volume: f32,
    },
    MuteStateChange {
        id: String,
        muted: bool,
    },
    #[serde(rename_all = "camelCase")]
    SessionVolumeChange {
        id: String,
        session_id: String,
        volume: f32,
    },
    #[serde(rename_all = "camelCase")]
    SessionMuteStateChange {
        id: String,
        session_id: String,
        muted: bool,
    },

    AudioSessionDict {
        id: String,
    },
}

const RECEIVE_INTERVAL: Duration = Duration::from_millis(100);

async fn spawn_relay_thread(
    mut backend_update_rx: Receiver<Notification>,
    ipc_tx: Sender<IPCHandlers>,
) -> Result<()> {
    while let Some(mut notification) = backend_update_rx.recv().await {
        loop {
            match timeout(RECEIVE_INTERVAL, backend_update_rx.recv()).await {
                Ok(Some(n)) => notification = n,
                _ => break,
            }
        }

        ipc_tx
            .send(IPCHandlers::AudioDictUpdate { notification })
            .await
            .map_err(|_| APIError::Unexpected {
                inner: UnexpectedErr::MPSCClosedError,
            })?;
    }

    Result::<()>::Ok(())
}

async fn spawn_backend_thread(
    mut query_rx: Receiver<IPCHandlers>,
    audio_dict: Arc<Mutex<AudioDeviceMap>>,
    is: Arc<Singleton>,
    frontend_update_tx: Sender<AudioStateChangePayload>,
) -> Result<(), APIError> {
    while let Some(q) = query_rx.recv().await {
        #[cfg(debug_assertions)]
        println!("Received IPC query: {:?}", q);

        match q {
            IPCHandlers::AudioDictUpdate { notification } => {
                use super::audio::notifier::Notification;

                let should_update_dict = matches!(
                    notification,
                    Notification::SessionCreated { .. } | Notification::SessionTerminated { .. }
                );

                if should_update_dict {
                    let mut dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
                        inner: UnexpectedErr::LockError,
                    })?;
                    *dict = get_audio_dictionary(&is).map_err(|e| APIError::SomethingWrong {
                        msg: format!("@get_audio_dict {:?}", e),
                    })?;
                }

                let e = ipc_sender(&is, &audio_dict, Some(notification), &frontend_update_tx).await;

                if let Err(e) = e {
                    log::error!("{:?}", e);
                }
            }
            IPCHandlers::AudioDict => {
                let e = ipc_sender(&is, &audio_dict, None, &frontend_update_tx).await;

                if let Err(e) = e {
                    log::error!("update_notifing_b2f {:?}", e);
                }
            }
            IPCHandlers::DefaultAudioChange { id } => {
                let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
                    inner: UnexpectedErr::LockError,
                })?;

                let audio_w = dict.get(&id).ok_or(APIError::SomethingWrong {
                    msg: format!("No such audio: {:?}", id),
                });

                let audio = match audio_w {
                    Ok(audio) => audio,
                    Err(e) => {
                        log::error!("{:?}", e);
                        continue;
                    }
                };

                let e = audio
                    .set_as_default()
                    .map_err(|e| APIError::SomethingWrong {
                        msg: format!("audio.set_as_default {:?}", e),
                    });

                if let Err(e) = e {
                    log::error!("{:?}", e);
                }
            }
            IPCHandlers::VolumeChange { id, volume } => {
                let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
                    inner: UnexpectedErr::LockError,
                })?;

                let audio_w = dict.get(&id).ok_or(APIError::SomethingWrong {
                    msg: format!("No such audio: {:?}", id),
                });

                let audio = match audio_w {
                    Ok(audio) => audio,
                    Err(e) => {
                        log::error!("{:?}", e);
                        continue;
                    }
                };

                let e = audio
                    .set_volume(volume)
                    .map_err(|e| APIError::SomethingWrong {
                        msg: format!("@audio.set_volume {:?}", e),
                    });

                if let Err(e) = e {
                    log::error!("{:?}", e);
                }
            }
            IPCHandlers::MuteStateChange { id, muted } => {
                let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
                    inner: UnexpectedErr::LockError,
                })?;

                let audio_w = dict.get(&id).ok_or(APIError::SomethingWrong {
                    msg: format!("No such audio: {:?}", id),
                });

                let audio = match audio_w {
                    Ok(audio) => audio,
                    Err(e) => {
                        log::error!("{:?}", e);
                        continue;
                    }
                };

                let e = audio
                    .set_mute_state(muted)
                    .map_err(|e| APIError::SomethingWrong {
                        msg: format!("@audio.set_mute {:?}", e),
                    });

                if let Err(e) = e {
                    log::error!("{:?}", e);
                }
            }
            IPCHandlers::SessionVolumeChange {
                id,
                session_id,
                volume,
            } => {
                let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
                    inner: UnexpectedErr::LockError,
                })?;

                let audio_w = dict.get(&id).ok_or(APIError::SomethingWrong {
                    msg: format!("No such audio: {:?}", id),
                });

                let audio = match audio_w {
                    Ok(audio) => audio,
                    Err(e) => {
                        log::error!("{:?}", e);
                        continue;
                    }
                };

                let e = audio.set_session_volume(&session_id, volume).map_err(|e| {
                    APIError::SomethingWrong {
                        msg: format!("@audio.set_session_volume {:?}", e),
                    }
                });

                if let Err(e) = e {
                    log::error!("{:?}", e);
                }
            }
            IPCHandlers::SessionMuteStateChange {
                id,
                session_id,
                muted,
            } => {
                let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
                    inner: UnexpectedErr::LockError,
                })?;

                let audio_w = dict.get(&id).ok_or(APIError::SomethingWrong {
                    msg: format!("No such audio: {:?}", id),
                });

                let audio = match audio_w {
                    Ok(audio) => audio,
                    Err(e) => {
                        log::error!("{:?}", e);
                        continue;
                    }
                };

                let e = audio
                    .set_session_mute_state(&session_id, muted)
                    .map_err(|e| APIError::SomethingWrong {
                        msg: format!("@audio.set_session_mute_state {:?}", e),
                    });

                if let Err(e) = e {
                    log::error!("{:?}", e);
                }
            }
            IPCHandlers::AudioSessionDict { id } => {
                let dict = audio_dict.lock().map_err(|_| APIError::Unexpected {
                    inner: UnexpectedErr::LockError,
                })?;

                let audio_w = dict.get(&id).ok_or(APIError::SomethingWrong {
                    msg: format!("No such audio: {:?}", id),
                });

                let audio = match audio_w {
                    Ok(audio) => audio,
                    Err(e) => {
                        log::error!("{:?}", e);
                        continue;
                    }
                };

                let e = audio
                    .get_session_list()
                    .map_err(|e| APIError::SomethingWrong {
                        msg: format!("@audio.get_session_list {:?}", e),
                    });

                if let Err(e) = e {
                    log::error!("{:?}", e);
                }
            }
        }
    }

    Result::<(), APIError>::Ok(())
}

pub struct BackendPrepareRet {
    pub relay_thread: JoinHandle<Result<()>>,
    pub backend_thread: JoinHandle<Result<(), APIError>>,
    pub ipc_tx: Sender<IPCHandlers>,
    pub ipc_rx: Receiver<AudioStateChangePayload>,
    pub audio_dict: Arc<Mutex<AudioDeviceMap>>,
    pub singleton: Arc<Singleton>,
}

pub async fn prepare_backend() -> Result<BackendPrepareRet> {
    let (backend_update_tx, mut backend_update_rx) = channel(256);
    let (frontend_update_tx, ipc_rx) = channel(256);
    let (ipc_tx, mut query_rx) = channel(256);

    let relay_thread = tokio::spawn(spawn_relay_thread(backend_update_rx, ipc_tx.clone()));

    let is =
        Arc::new(
            Singleton::new(&backend_update_tx).map_err(|e| APIError::SomethingWrong {
                msg: format!("@InstantsSingleton::new {:?}", e),
            })?,
        );

    let audio_dict = Arc::new(Mutex::new(get_audio_dictionary(&(is)).map_err(|e| {
        APIError::SomethingWrong {
            msg: format!("@get_audio_dict {:?}", e),
        }
    })?));

    let is_clone = is.clone();
    let audio_dict_clone = audio_dict.clone();

    let backend_thread = tokio::spawn(spawn_backend_thread(
        query_rx,
        audio_dict,
        is,
        frontend_update_tx,
    ));

    Ok(BackendPrepareRet {
        relay_thread,
        backend_thread,
        ipc_tx,
        ipc_rx,
        audio_dict: audio_dict_clone,
        singleton: is_clone,
    })
}

pub fn setup(app: &mut App<Wry>, mut rx: Receiver<AudioStateChangePayload>) -> JoinHandle<()> {
    let main_window = app.get_webview_window("main").unwrap();

    let mw = main_window.clone();
    let notification_thread = tokio::spawn(async move {
        while let Some(unb2f) = rx.recv().await {
            let e = mw.emit("audio_state_change", unb2f);
            if let Err(e) = e {
                log::error!("{:?}", e);
            }
        }
    });

    notification_thread
}

fn get_audio_dictionary(is: &Arc<Singleton>) -> Result<AudioDict> {
    let res = Singleton::get_active_audio_devices(is)?
        .into_iter()
        .map(|a| (a.id.clone(), a))
        .collect();

    Ok(res)
}
