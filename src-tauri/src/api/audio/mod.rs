mod device_changer;
pub mod notifier;

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::mpsc::Sender;
use windows::Win32::{
    Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
    Media::Audio::{
        eMultimedia, eRender, Endpoints::IAudioEndpointVolume, IAudioSessionManager2, IMMDevice,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    },
    System::Com::{
        CoCreateInstance, CoInitialize, CoUninitialize,
        StructuredStorage::PropVariantToStringAlloc, CLSCTX_ALL, STGM_READ,
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
    #[allow(dead_code)]
    device: IMMDevice,

    /// @see https://learn.microsoft.com/ja-jp/windows/win32/api/endpointvolume/nn-endpointvolume-iaudioendpointvolume
    pub(crate) endpoint_volume: IAudioEndpointVolume,
}

unsafe impl Send for IMMAudioDevice {}
unsafe impl Sync for IMMAudioDevice {}

impl IMMAudioDevice {
    pub fn new(is: Arc<Singleton>, device: IMMDevice) -> Result<Self> {
        let id = unsafe { device.GetId()?.to_string()? };
        let name = get_name_from_immdevice(&device)?;

        // https://learn.microsoft.com/ja-jp/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-immdevice-activate
        let volume: IAudioEndpointVolume = unsafe { device.Activate(CLSCTX_ALL, None)? };

        unsafe {
            let session_manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            let sessions = session_manager.GetSessionEnumerator()?;

            println!("{:?}", sessions.GetCount()?);

            for i in 0..sessions.GetCount()? {
                let session = sessions.GetSession(i)?;
                let name = session.GetDisplayName()?;

                let state = session.GetState()?;
                println!("{:?} {:?}", name.to_string()?, state);
            }
        }

        is.notification_callbacks.register_to_volume(&volume)?;

        Ok(IMMAudioDevice {
            id,
            name,
            device,
            endpoint_volume: volume,
            is,
        })
    }

    pub fn set_as_default(&self) -> Result<()> {
        self.is.policy_config.set_default_endpoint(&self.id)?;

        Ok(())
    }

    pub fn get_volume(&self) -> Result<f32> {
        let volume = unsafe { self.endpoint_volume.GetMasterVolumeLevelScalar()? };

        Ok(volume)
    }

    pub fn get_mute_state(&self) -> Result<bool> {
        let mute_state = unsafe { self.endpoint_volume.GetMute()?.as_bool() };

        Ok(mute_state)
    }

    pub fn set_volume(&self, volume: f32) -> Result<()> {
        unsafe {
            self.endpoint_volume
                .SetMasterVolumeLevelScalar(volume, std::ptr::null())?;
        }

        Ok(())
    }

    pub fn set_mute_state(&self, mute_state: bool) -> Result<()> {
        unsafe {
            self.endpoint_volume.SetMute(mute_state, std::ptr::null())?;
        }

        Ok(())
    }

    pub fn get_channels(&self) -> Result<u32> {
        let channels = unsafe { self.endpoint_volume.GetChannelCount()? };
        Ok(channels)
    }
}

impl Drop for IMMAudioDevice {
    fn drop(&mut self) {
        self.is
            .notification_callbacks
            .unregister_to_volume(&self.endpoint_volume)
            .unwrap();
    }
}
