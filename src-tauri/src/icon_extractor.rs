use anyhow::Result;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows::Win32::{
    Graphics::Gdi::{DeleteObject, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS},
    UI::Shell::{ExtractIconExW},
    UI::WindowsAndMessaging::{
        DestroyIcon, GetIconInfo, HICON, ICONINFO,
    },
};

pub fn extract_icon_as_base64(exe_path: &str, size: u32) -> Result<String> {
    if exe_path.is_empty() {
        return Err(anyhow::anyhow!("Empty exe path"));
    }

    // パスをワイド文字列に変換
    let wide_path: Vec<u16> = OsStr::new(exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        // アイコンを抽出（大きいアイコンと小さいアイコン）
        let mut large_icon = HICON::default();
        let mut small_icon = HICON::default();

        let count = ExtractIconExW(
            windows::core::PCWSTR(wide_path.as_ptr()),
            0,
            Some(&mut large_icon as *mut _),
            Some(&mut small_icon as *mut _),
            1,
        );

        if count == 0 {
            return Err(anyhow::anyhow!("No icon found in executable"));
        }

        // サイズに応じてアイコンを選択
        let icon = if size > 16 { large_icon } else { small_icon };

        if icon.is_invalid() {
            return Err(anyhow::anyhow!("Invalid icon handle"));
        }

        // アイコンをPNG形式のBase64に変換
        let result = icon_to_base64(icon);

        // アイコンを破棄
        let _ = DestroyIcon(large_icon);
        let _ = DestroyIcon(small_icon);

        result
    }
}

unsafe fn icon_to_base64(icon: HICON) -> Result<String> {
    // アイコン情報を取得
    let mut icon_info = ICONINFO::default();
    let result = GetIconInfo(icon, &mut icon_info);
    if result.is_err() {
        return Err(anyhow::anyhow!("Failed to get icon info"));
    }

    // ビットマップをPNGに変換
    let png_data = bitmap_to_png(icon_info.hbmColor)?;

    // クリーンアップ
    if !icon_info.hbmMask.is_invalid() {
        let _ = DeleteObject(icon_info.hbmMask);
    }
    if !icon_info.hbmColor.is_invalid() {
        let _ = DeleteObject(icon_info.hbmColor);
    }

    // Base64エンコード
    let base64 = base64_encode(&png_data);
    Ok(format!("data:image/png;base64,{}", base64))
}

unsafe fn bitmap_to_png(bitmap: windows::Win32::Graphics::Gdi::HBITMAP) -> Result<Vec<u8>> {
    use std::mem;
    use windows::Win32::Graphics::Gdi::{CreateCompatibleDC, GetObjectW, SelectObject, DeleteDC, BITMAP};

    // ビットマップ情報を取得
    let mut bmp = BITMAP::default();
    GetObjectW(
        bitmap,
        mem::size_of::<BITMAP>() as i32,
        Some(&mut bmp as *mut _ as *mut _),
    );

    let width = bmp.bmWidth;
    let height = bmp.bmHeight;

    // デバイスコンテキストを作成
    let hdc = CreateCompatibleDC(None);
    let old_bitmap = SelectObject(hdc, bitmap);

    // ビットマップデータを取得
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height, // トップダウン
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [Default::default(); 1],
    };

    let size = (width * height * 4) as usize;
    let mut buffer = vec![0u8; size];

    GetDIBits(
        hdc,
        bitmap,
        0,
        height as u32,
        Some(buffer.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );

    // クリーンアップ
    SelectObject(hdc, old_bitmap);
    let _ = DeleteDC(hdc);

    // BGRA to RGBA 変換とPNGエンコード
    for chunk in buffer.chunks_exact_mut(4) {
        chunk.swap(0, 2); // B <-> R
    }

    // PNG エンコード（image crateを使用）
    encode_png(&buffer, width as u32, height as u32)
}

fn encode_png(data: &[u8], width: u32, height: u32) -> Result<Vec<u8>> {
    use std::io::Cursor;

    let mut png_data = Vec::new();
    let mut encoder = png::Encoder::new(Cursor::new(&mut png_data), width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);

    let mut writer = encoder
        .write_header()
        .map_err(|e| anyhow::anyhow!("PNG header write failed: {}", e))?;

    writer
        .write_image_data(data)
        .map_err(|e| anyhow::anyhow!("PNG data write failed: {}", e))?;

    drop(writer);
    Ok(png_data)
}

fn base64_encode(data: &[u8]) -> String {
    use base64::{engine::general_purpose, Engine as _};
    general_purpose::STANDARD.encode(data)
}
