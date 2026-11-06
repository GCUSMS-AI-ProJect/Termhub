use std::{borrow::Cow, mem::size_of};
use windows::Win32::{
    Graphics::Gdi::{
        GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
    },
    System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard},
};

struct ClipboardGuard;
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}
struct DcGuard(HDC);
impl Drop for DcGuard {
    fn drop(&mut self) {
        unsafe {
            ReleaseDC(None, self.0);
        }
    }
}

/// Windows synthesizes CF_BITMAP for DIB formats that third-party decoders reject.
/// The clipboard owns the bitmap; only the DC and clipboard lock are released here.
pub(super) fn read_image(max_bytes: usize) -> Result<arboard::ImageData<'static>, String> {
    unsafe {
        OpenClipboard(None).map_err(|error| format!("Cannot open Windows clipboard: {error}"))?;
        let _clipboard = ClipboardGuard;
        let handle =
            GetClipboardData(2).map_err(|error| format!("No Windows clipboard bitmap: {error}"))?;
        let bitmap = HBITMAP(handle.0);
        let mut details = BITMAP::default();
        if GetObjectW(
            HGDIOBJ(bitmap.0),
            size_of::<BITMAP>() as i32,
            Some((&mut details as *mut BITMAP).cast()),
        ) == 0
        {
            return Err("Cannot inspect Windows clipboard bitmap".into());
        }
        let width = usize::try_from(details.bmWidth).unwrap_or(0);
        let height = usize::try_from(details.bmHeight).unwrap_or(0);
        let length = width
            .checked_mul(height)
            .and_then(|n| n.checked_mul(4))
            .filter(|n| *n > 0 && *n <= max_bytes)
            .ok_or("Clipboard bitmap is invalid or exceeds the image size limit")?;
        let dc = GetDC(None);
        if dc.is_invalid() {
            return Err("Cannot create clipboard image device context".into());
        }
        let _dc = DcGuard(dc);
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: details.bmWidth,
                biHeight: -details.bmHeight,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bytes = vec![0u8; length];
        let rows = GetDIBits(
            dc,
            bitmap,
            0,
            height as u32,
            Some(bytes.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        );
        if rows != height as i32 {
            return Err("Cannot decode Windows clipboard bitmap".into());
        }
        for pixel in bytes.as_chunks_mut::<4>().0 {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        Ok(arboard::ImageData {
            width,
            height,
            bytes: Cow::Owned(bytes),
        })
    }
}
