use std::sync::mpsc;
use tauri::{AppHandle, Emitter};
use windows::{
    core::*,
    Win32::{Foundation::*, UI::WindowsAndMessaging::*},
};

const WM_POWERBROADCAST: u32 = 0x0218;
const PBT_APMRESUMEAUTOMATIC: usize = 0x0012;

pub fn start_power_monitor(app: AppHandle) -> anyhow::Result<()> {
    std::thread::spawn(move || {
        if let Err(e) = run_power_monitor(app) {
            log::error!("Power monitor error: {:?}", e);
        }
    });

    Ok(())
}

fn run_power_monitor(app: AppHandle) -> Result<()> {
    unsafe {
        let (tx, rx) = mpsc::channel();

        let class_name = w!("PowerMonitorClass");
        let wnd_class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            lpszClassName: class_name,
            ..Default::default()
        };

        RegisterClassW(&wnd_class);

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name,
            w!("Power Monitor"),
            WS_OVERLAPPEDWINDOW,
            0,
            0,
            0,
            0,
            HWND::default(),
            None,
            HINSTANCE::default(),
            Some(&tx as *const _ as _),
        );

        if hwnd.0 == 0 {
            return Err(Error::from_win32());
        }

        // メッセージループ
        let mut msg = MSG::default();
        loop {
            // Windows メッセージを処理
            if GetMessageW(&mut msg, HWND::default(), 0, 0).0 > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            // チャネルからのイベントを確認
            if let Ok(()) = rx.try_recv() {
                log::info!("System resumed from sleep");
                let _ = app.emit("system-resume", ());
            }
        }
    }
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_POWERBROADCAST {
        if wparam.0 == PBT_APMRESUMEAUTOMATIC {
            // ウィンドウ作成時に渡したチャネルを取得
            let tx_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const mpsc::Sender<()>;
            if !tx_ptr.is_null() {
                let tx = &*tx_ptr;
                let _ = tx.send(());
            }
        }
    } else if msg == WM_CREATE {
        let create_struct = lparam.0 as *const CREATESTRUCTW;
        if !create_struct.is_null() {
            let tx_ptr = (*create_struct).lpCreateParams as isize;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, tx_ptr);
        }
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}
