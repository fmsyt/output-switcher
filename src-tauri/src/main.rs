// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod config;
pub mod ipc;

use tauri::State;
use tauri::{
    async_runtime::Sender,
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use anyhow::Result;
use ipc::{
    error::{APIError, UnexpectedErr},
    init::{prepare_backend, setup, BackendPrepareRet, IPCHandlers},
    quit,
    sender::{AudioDeviceMap, AudioSessionInfo},
};
use std::sync::{Arc, Mutex};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn query(tx: State<'_, Sender<IPCHandlers>>, query: IPCHandlers) -> Result<(), APIError> {
    log::info!("query: {:?}", query);
    tx.send(query).await.map_err(|_| APIError::Unexpected {
        inner: UnexpectedErr::MPSCClosedError,
    })?;

    Ok(())
}

#[tauri::command]
async fn get_audio_sessions(
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
        .map(|(session_id, pid, name, volume, muted)| AudioSessionInfo::from_session(session_id, pid, name, volume, muted))
        .collect();

    Ok(session_infos)
}

#[tokio::main]
async fn main() -> Result<()> {
    let BackendPrepareRet {
        relay_thread,
        backend_thread,
        ipc_tx,
        ipc_rx,
        audio_dict,
        singleton: _,
    } = prepare_backend().await?;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![query, quit, get_audio_sessions])
        .manage(ipc_tx)
        .manage(audio_dict)
        .setup(|app| {
            setup(app, ipc_rx);

            let quit_menu = MenuItemBuilder::with_id("quit", "終了").build(app)?;
            let version_menu = MenuItemBuilder::with_id("version", "バージョン情報").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&version_menu)
                .item(&quit_menu)
                .build()?;

            let tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => {
                        let app = app.clone();
                        quit(app);
                    }
                    "version" => {
                        let message = format!(
                            "{} v{}",
                            app.package_info().name,
                            app.package_info().version
                        );

                        app.dialog()
                            .message(message)
                            .title("バージョン情報")
                            .blocking_show();
                    }
                    _ => (),
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(webview_window) = app.get_webview_window("main") {
                            let _ = webview_window.show();
                            let _ = webview_window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let icon = include_bytes!("../icons/icon.ico").to_vec();
            let image = Image::from_bytes(&icon).expect("Failed to load icon image");

            tray.set_icon(Some(image)).expect("Failed to set tray icon");

            #[cfg(debug_assertions)]
            {
                let main_window = app.get_webview_window("main").unwrap();
                main_window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    let e = relay_thread.await;
    if let Err(e) = e {
        log::error!("relay_thread end with Error: {:?}", e);
    }

    let e = backend_thread.await;
    if let Err(e) = e {
        log::error!("backend_thread end with Error: {:?}", e);
    }

    Ok(())
}
