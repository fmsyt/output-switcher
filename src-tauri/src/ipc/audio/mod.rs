mod device_changer;
pub mod notifier;

// https://qiita.com/benki/items/635867b654783da0322f

use anyhow::Result;
use std::{collections::HashMap, ffi::OsString, os::windows::ffi::OsStringExt, sync::Arc};
use tokio::sync::mpsc::Sender;
use windows::{
    core::Interface,
    Win32::{
        Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
        Foundation::{CloseHandle, FALSE},
        Media::Audio::{
            eMultimedia, eRender, Endpoints::IAudioEndpointVolume, IAudioSessionControl,
            IAudioSessionControl2, IAudioSessionEvents, IAudioSessionManager2,
            IAudioSessionNotification, IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume,
            MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
        },
        System::{
            Com::{
                CoCreateInstance, CoInitialize, CoUninitialize,
                StructuredStorage::PropVariantToStringAlloc, CLSCTX_ALL, STGM_READ,
            },
            ProcessStatus::GetModuleBaseNameW,
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
            },
        },
    },
};

struct Com;

impl Com {
    pub fn new() -> Result<Self> {
        unsafe {
            let _ = CoInitialize(None);
        }

        Ok(Com)
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

pub struct Singleton {
    _com: Com,

    /// @see https://learn.microsoft.com/ja-jp/windows/win32/api/mmdeviceapi/nn-mmdeviceapi-immdeviceenumerator
    pub(crate) device_enumerator: IMMDeviceEnumerator,
    notification_callbacks: notifier::NotificationCallbacks,
    policy_config: device_changer::PolicyConfig,
    tx: Sender<notifier::Notification>,
}

unsafe impl Send for Singleton {}
unsafe impl Sync for Singleton {}

impl Singleton {
    pub fn new(tx: &Sender<notifier::Notification>) -> Result<Self> {
        let com = Com::new()?;
        let device_enumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let notification_callbacks = notifier::NotificationCallbacks::new(tx);
        notification_callbacks.register_to_enumerator(&device_enumerator)?;

        let policy_config = device_changer::PolicyConfig::new()?;

        Ok(Singleton {
            _com: com,
            device_enumerator,
            notification_callbacks,
            policy_config,
            tx: tx.clone(),
        })
    }

    pub fn get_active_audio_devices(self: &Arc<Self>) -> Result<Vec<IMMAudioDevice>> {
        // https://learn.microsoft.com/ja-jp/windows/win32/api/mmdeviceapi/nn-mmdeviceapi-immdevicecollection
        let device_collection = unsafe {
            self.device_enumerator
                .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?
        };

        let len = unsafe { device_collection.GetCount()? };

        let devices = (0..len)
            .map(|i| {
                let device = unsafe { device_collection.Item(i)? };
                IMMAudioDevice::new(Arc::clone(self), device)
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(devices)
    }

    pub fn get_default_audio_id(&self) -> Result<String> {
        let device = unsafe {
            self.device_enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)?
        };
        let id = unsafe { device.GetId()?.to_string()? };

        Ok(id)
    }
}

impl Drop for Singleton {
    fn drop(&mut self) {
        self.notification_callbacks
            .unregister_to_enumerator(&self.device_enumerator)
            .unwrap();
    }
}

fn get_name_from_immdevice(device: &IMMDevice) -> Result<String> {
    let property_store = unsafe { device.OpenPropertyStore(STGM_READ)? };
    let name_propvariant = unsafe { property_store.GetValue(&PKEY_Device_FriendlyName)? };
    let name = unsafe { PropVariantToStringAlloc(&name_propvariant)?.to_string()? };

    Ok(name)
}

pub struct IMMAudioDevice {
    is: Arc<Singleton>,

    pub id: String,
    pub name: String,

    /// @see https://learn.microsoft.com/ja-jp/windows/win32/api/mmdeviceapi/nn-mmdeviceapi-immdevice
    _device: IMMDevice,

    /// @see https://learn.microsoft.com/ja-jp/windows/win32/api/endpointvolume/nn-endpointvolume-iaudioendpointvolume
    pub(crate) endpoint_volume: IAudioEndpointVolume,

    pub(crate) session_control_map: HashMap<String, IAudioSessionControl>,
    session_events_map: HashMap<String, IAudioSessionEvents>,
    session_pid_map: HashMap<String, u32>,
    session_display_name_map: HashMap<String, String>,
    session_icon_path_map: HashMap<String, String>,
    session_exe_path_map: HashMap<String, String>,
    session_manager: IAudioSessionManager2,
    session_notification: IAudioSessionNotification,
}

unsafe impl Send for IMMAudioDevice {}
unsafe impl Sync for IMMAudioDevice {}

impl IMMAudioDevice {
    pub fn new(is: Arc<Singleton>, device: IMMDevice) -> Result<Self> {
        let id = unsafe { device.GetId()?.to_string()? };
        let name = get_name_from_immdevice(&device)?;

        // https://learn.microsoft.com/ja-jp/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-immdevice-activate
        // https://learn.microsoft.com/ja-jp/windows/win32/api/endpointvolume/nn-endpointvolume-iaudioendpointvolume
        let endpoint_volume: IAudioEndpointVolume = unsafe { device.Activate(CLSCTX_ALL, None)? };

        let mut session_control_map: HashMap<String, IAudioSessionControl> = HashMap::new();
        let mut session_events_map: HashMap<String, IAudioSessionEvents> = HashMap::new();
        let mut session_pid_map: HashMap<String, u32> = HashMap::new();
        let mut session_display_name_map: HashMap<String, String> = HashMap::new();
        let mut session_icon_path_map: HashMap<String, String> = HashMap::new();
        let mut session_exe_path_map: HashMap<String, String> = HashMap::new();

        let (session_manager, session_notification) = unsafe {
            let session_manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            let sessions = session_manager.GetSessionEnumerator()?;

            for i in 0..sessions.GetCount()? {
                let session_control: IAudioSessionControl = sessions.GetSession(i)?;
                let session_control2: IAudioSessionControl2 = session_control.cast().unwrap();
                let process_id = session_control2.GetProcessId()?;

                // セッションインスタンスIDを取得
                let session_id_pwstr = session_control2.GetSessionInstanceIdentifier()?;
                let session_id = session_id_pwstr.to_string()?;

                // セッション表示名を取得
                let display_name = match session_control.GetDisplayName() {
                    Ok(name_pwstr) => name_pwstr.to_string().unwrap_or_default(),
                    Err(_) => String::new(),
                };

                // セッションアイコンパスを取得
                let icon_path = match session_control.GetIconPath() {
                    Ok(path_pwstr) => path_pwstr.to_string().unwrap_or_default(),
                    Err(_) => String::new(),
                };

                // 実行ファイルのパスを取得
                let exe_path = if process_id != 0 {
                    get_process_path_by_id(process_id).unwrap_or_default()
                } else {
                    String::new()
                };

                // セッションイベントコールバックを作成して登録
                let session_events =
                    notifier::NotificationCallbacks::create_session_events_callback(
                        &is.tx,
                        process_id,
                        id.clone(),
                    );
                session_control.RegisterAudioSessionNotification(&session_events)?;

                session_control_map.insert(session_id.clone(), session_control);
                session_events_map.insert(session_id.clone(), session_events);
                session_pid_map.insert(session_id.clone(), process_id);
                session_display_name_map.insert(session_id.clone(), display_name);
                session_icon_path_map.insert(session_id.clone(), icon_path);
                session_exe_path_map.insert(session_id, exe_path);
            }

            // セッション追加・削除の通知を登録
            let session_notification =
                notifier::NotificationCallbacks::create_session_notification_callback(
                    &is.tx,
                    id.clone(),
                );
            session_manager.RegisterSessionNotification(&session_notification)?;

            (session_manager, session_notification)
        };

        is.notification_callbacks
            .register_to_volume(&endpoint_volume)?;

        Ok(IMMAudioDevice {
            id,
            name,
            _device: device,
            endpoint_volume,
            is,
            session_control_map,
            session_events_map,
            session_pid_map,
            session_display_name_map,
            session_icon_path_map,
            session_exe_path_map,
            session_manager,
            session_notification,
        })
    }

    pub(crate) fn get_session(&self, session_id: &str) -> Result<IAudioSessionControl> {
        let session_control = self
            .session_control_map
            .get(session_id)
            .ok_or_else(|| anyhow::anyhow!("Session not found: {}", session_id))?;
        Ok(session_control.clone())
    }

    pub(crate) fn get_pid(&self, session_id: &str) -> Result<u32> {
        self.session_pid_map
            .get(session_id)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("Session not found: {}", session_id))
    }

    pub(crate) fn get_session_audio_volume(&self, session_id: &str) -> Result<ISimpleAudioVolume> {
        let session_control = self.get_session(session_id)?;
        let audio_volume: ISimpleAudioVolume = session_control.cast().unwrap();
        Ok(audio_volume)
    }

    pub fn set_as_default(&self) -> Result<()> {
        self.is.policy_config.set_default_endpoint(&self.id)?;

        Ok(())
    }

    pub fn get_volume(&self) -> Result<f32> {
        let volume = unsafe { self.endpoint_volume.GetMasterVolumeLevelScalar()? };

        Ok(volume)
    }

    pub fn get_session_volume(&self, session_id: &str) -> Result<f32> {
        let audio_volume = self.get_session_audio_volume(session_id)?;
        let volume = unsafe { audio_volume.GetMasterVolume()? };

        Ok(volume)
    }

    pub fn get_mute_state(&self) -> Result<bool> {
        let mute_state = unsafe { self.endpoint_volume.GetMute()?.as_bool() };

        Ok(mute_state)
    }

    pub fn get_session_mute_state(&self, session_id: &str) -> Result<bool> {
        let audio_volume = self.get_session_audio_volume(session_id)?;
        let mute_state = unsafe { audio_volume.GetMute()?.as_bool() };

        Ok(mute_state)
    }

    pub fn set_volume(&self, volume: f32) -> Result<()> {
        unsafe {
            self.endpoint_volume
                .SetMasterVolumeLevelScalar(volume, std::ptr::null())?;
        }

        Ok(())
    }

    pub fn set_session_volume(&self, session_id: &str, volume: f32) -> Result<()> {
        let audio_volume = self.get_session_audio_volume(session_id)?;
        unsafe {
            audio_volume.SetMasterVolume(volume, std::ptr::null())?;
        }

        Ok(())
    }

    pub fn set_mute_state(&self, mute_state: bool) -> Result<()> {
        unsafe {
            self.endpoint_volume.SetMute(mute_state, std::ptr::null())?;
        }

        Ok(())
    }

    pub fn set_session_mute_state(&self, session_id: &str, mute_state: bool) -> Result<()> {
        let audio_volume = self.get_session_audio_volume(session_id)?;
        unsafe {
            audio_volume.SetMute(mute_state, std::ptr::null())?;
        }

        Ok(())
    }

    /// プロセスIDからプロセス名を取得します
    pub fn get_process_name(&self, process_id: u32) -> Result<String> {
        if process_id == 0 {
            return Ok("システム音".to_string());
        }
        unsafe { get_process_name_by_id(process_id) }
    }

    pub fn get_session_display_name(&self, session_id: &str) -> Option<String> {
        self.session_display_name_map.get(session_id).cloned()
    }

    pub fn get_session_icon_path(&self, session_id: &str) -> Option<String> {
        self.session_icon_path_map.get(session_id).cloned()
    }

    pub fn get_session_exe_path(&self, session_id: &str) -> Option<String> {
        self.session_exe_path_map.get(session_id).cloned()
    }

    pub fn get_session_list(
        &self,
    ) -> Result<Vec<(String, u32, String, f32, bool, String, String, String)>> {
        let mut session_list = Vec::new();

        for (session_id, _) in &self.session_control_map {
            if let Ok(pid) = self.get_pid(session_id) {
                if let Ok(name) = self.get_process_name(pid) {
                    let volume = self.get_session_volume(session_id).unwrap_or(0.0);
                    let muted = self.get_session_mute_state(session_id).unwrap_or(false);
                    let display_name = self
                        .get_session_display_name(session_id)
                        .unwrap_or_default();
                    let icon_path = self.get_session_icon_path(session_id).unwrap_or_default();
                    let exe_path = self.get_session_exe_path(session_id).unwrap_or_default();
                    session_list.push((
                        session_id.clone(),
                        pid,
                        name,
                        volume,
                        muted,
                        display_name,
                        icon_path,
                        exe_path,
                    ));
                }
            }
        }

        Ok(session_list)
    }
}

impl Drop for IMMAudioDevice {
    fn drop(&mut self) {
        // セッション通知の登録解除
        let _ = unsafe {
            self.session_manager
                .UnregisterSessionNotification(&self.session_notification)
        };

        // セッションイベントの登録解除
        for (session_id, session_control) in &self.session_control_map {
            if let Some(session_events) = self.session_events_map.get(session_id) {
                let _ =
                    unsafe { session_control.UnregisterAudioSessionNotification(session_events) };
            }
        }

        self.is
            .notification_callbacks
            .unregister_to_volume(&self.endpoint_volume)
            .unwrap();
    }
}

unsafe fn get_process_name_by_id(process_id: u32) -> Result<String> {
    let try_process_handle = OpenProcess(
        PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
        FALSE,
        process_id,
    );

    if let Err(e) = try_process_handle {
        return Err(anyhow::anyhow!("Failed to open process: {}", e));
    }

    let process_handle = try_process_handle.unwrap();

    let mut buffer = [0; 1024];
    let len = GetModuleBaseNameW(process_handle, None, &mut buffer);

    let os_string = OsString::from_wide(&buffer[..len as usize]);
    let process_name = os_string.to_string_lossy().into_owned();

    CloseHandle(process_handle).unwrap();

    Ok(process_name)
}

unsafe fn get_process_path_by_id(process_id: u32) -> Result<String> {
    let try_process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, process_id);

    if let Err(e) = try_process_handle {
        return Err(anyhow::anyhow!("Failed to open process: {}", e));
    }

    let process_handle = try_process_handle.unwrap();

    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;

    let result = QueryFullProcessImageNameW(
        process_handle,
        PROCESS_NAME_WIN32,
        windows::core::PWSTR(buffer.as_mut_ptr()),
        &mut size,
    );

    CloseHandle(process_handle).unwrap();

    if result.is_err() {
        return Err(anyhow::anyhow!("Failed to query process image name"));
    }

    let os_string = OsString::from_wide(&buffer[..size as usize]);
    let process_path = os_string.to_string_lossy().into_owned();

    Ok(process_path)
}
