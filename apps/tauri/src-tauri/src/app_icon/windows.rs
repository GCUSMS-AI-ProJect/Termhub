use sha2::Digest;
use std::{
    env, fs,
    os::windows::ffi::{OsStrExt, OsStringExt},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::{
    core::{Interface, Owned, HSTRING},
    Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED, STGM_READWRITE,
        },
        UI::Shell::{
            IShellLinkW, SHChangeNotify, ShellLink, SHCNE_UPDATEITEM, SHCNF_FLUSHNOWAIT,
            SHCNF_PATHW, SLGP_RAWPATH,
        },
        UI::WindowsAndMessaging::{
            CreateIconFromResourceEx, SendMessageW, SetClassLongPtrW, GCLP_HICON, GCLP_HICONSM,
            HICON, ICON_BIG, ICON_SMALL, LR_DEFAULTCOLOR, WM_SETICON,
        },
    },
};

static SHORTCUT_ICON_REFRESH_REQUEST: AtomicU64 = AtomicU64::new(0);
static SHORTCUT_ICON_REFRESH_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

thread_local! {
    // WM_SETICON borrows HICONs. Keep both native sizes for all variants alive
    // on the UI thread, including when windows close or switch variants.
    static ICONS: Result<[[Owned<HICON>; 2]; 3], String> = load_icons();
}

fn load_icons() -> Result<[[Owned<HICON>; 2]; 3], String> {
    fn load(bytes: &[u8], size: i32) -> Result<Owned<HICON>, String> {
        let icon = unsafe {
            CreateIconFromResourceEx(bytes, true, 0x0003_0000, size, size, LR_DEFAULTCOLOR)
        }
        .map_err(|error| error.to_string())?;
        Ok(unsafe { Owned::new(icon) })
    }
    fn load_variant(variant: &str) -> Result<[Owned<HICON>; 2], String> {
        Ok([
            load(super::tray_icon_bytes(variant), 32)?,
            load(super::platform_icon_bytes(variant, 256), 256)?,
        ])
    }
    Ok([
        load_variant("classic")?,
        load_variant("material")?,
        load_variant("clean")?,
    ])
}

fn apply_window_icon(hwnd: HWND, variant: &str) -> Result<(), String> {
    let index = match variant {
        "material" => 1,
        "clean" => 2,
        _ => 0,
    };
    ICONS.with(|icons| {
        let icons = icons.as_ref().map_err(Clone::clone)?;
        let [small_icon, big_icon] = &icons[index];
        // The taskbar may use the window-class icon when its button was
        // created from a pinned shortcut. Keep each native size available to
        // Shell entry points instead of scaling one bitmap for every surface.
        unsafe {
            SetClassLongPtrW(hwnd, GCLP_HICON, big_icon.0 as isize);
            SetClassLongPtrW(hwnd, GCLP_HICONSM, small_icon.0 as isize);
        }
        for (kind, icon) in [(ICON_SMALL, small_icon), (ICON_BIG, big_icon)] {
            // Tauri's set_icon currently sends only ICON_SMALL on Windows.
            // Explicitly update ICON_BIG for the taskbar and Alt+Tab as well.
            unsafe {
                SendMessageW(
                    hwnd,
                    WM_SETICON,
                    Some(WPARAM(kind as usize)),
                    Some(LPARAM(icon.0 as isize)),
                );
            }
        }
        Ok(())
    })
}

pub(super) fn refresh_shortcut_icons(app: &AppHandle, variant: &str) {
    let app = app.clone();
    let requested_variant = variant.to_string();
    let request = SHORTCUT_ICON_REFRESH_REQUEST.fetch_add(1, Ordering::AcqRel) + 1;

    std::thread::spawn(move || {
        let _guard = SHORTCUT_ICON_REFRESH_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if request != SHORTCUT_ICON_REFRESH_REQUEST.load(Ordering::Acquire) {
            return;
        }

        // A user can change the selection more than once while a refresh is
        // queued. Resolve the persisted value after serializing the workers so
        // the most recent choice wins.
        let variant = crate::commands::app_get_ui_preferences(app.clone())
            .map(|preferences| preferences.app_icon)
            .unwrap_or(requested_variant);
        if let Err(error) = refresh_shortcut_icons_now(&app, &variant) {
            crate::services::logging::warn(
                &app,
                "app-icon",
                format!("failed to refresh Windows shortcut icons: {error}"),
            );
        }
    });
}

fn refresh_shortcut_icons_now(app: &AppHandle, variant: &str) -> Result<(), String> {
    let executable = env::current_exe().map_err(|error| error.to_string())?;
    let icon_directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("windows-icons");
    fs::create_dir_all(&icon_directory).map_err(|error| error.to_string())?;

    let icon_bytes = shell_icon_bytes(variant);
    let digest = sha2::Sha256::digest(&icon_bytes);
    let digest = digest
        .iter()
        .take(8)
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let version = app.package_info().version.to_string();
    let icon_path = icon_directory.join(format!("transterm-{version}-{variant}-{digest}.ico"));
    let icon_matches = fs::read(&icon_path).is_ok_and(|current| current == icon_bytes);
    if !icon_matches {
        fs::write(&icon_path, &icon_bytes).map_err(|error| error.to_string())?;
    }

    let shortcut_directories = shortcut_directories(app);
    let updated = refresh_shortcuts_in_directories(
        app,
        &executable,
        &icon_directory,
        &icon_path,
        &shortcut_directories,
    )?;
    if updated > 0 {
        crate::services::logging::info(
            app,
            "app-icon",
            format!("refreshed {updated} Windows transterm shortcut icon(s)"),
        );
    }

    Ok(())
}

fn shell_icon_bytes(variant: &str) -> Vec<u8> {
    match variant {
        "material" => include_bytes!("../../icons/app/windows/material.ico").to_vec(),
        "clean" => include_bytes!("../../icons/app/windows/clean.ico").to_vec(),
        _ => include_bytes!("../../icons/app/windows/classic.ico").to_vec(),
    }
}

fn shortcut_directories(app: &AppHandle) -> Vec<PathBuf> {
    let mut directories = Vec::new();
    if let Ok(desktop) = app.path().desktop_dir() {
        directories.push(desktop);
    }
    if let Some(app_data) = env::var_os("APPDATA").map(PathBuf::from) {
        directories.push(app_data.join("Microsoft/Windows/Start Menu/Programs"));
        directories
            .push(app_data.join("Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar"));
    }

    directories.sort();
    directories.dedup();
    directories
}

fn refresh_shortcuts_in_directories(
    app: &AppHandle,
    executable: &Path,
    icon_directory: &Path,
    icon_path: &Path,
    directories: &[PathBuf],
) -> Result<usize, String> {
    let _apartment = ComApartment::initialize()?;
    let executable = normalized_path(executable);
    let icon_directory = normalized_path(icon_directory);
    let mut updated = 0;

    for directory in directories {
        let entries = match fs::read_dir(directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path
                .extension()
                .is_none_or(|extension| !extension.eq_ignore_ascii_case("lnk"))
            {
                continue;
            }
            match refresh_shortcut_icon(&path, &executable, &icon_directory, icon_path) {
                Ok(true) => updated += 1,
                Ok(false) => {}
                Err(error)
                    if path
                        .file_stem()
                        .is_some_and(|name| name.eq_ignore_ascii_case("transterm")) =>
                {
                    crate::services::logging::warn(
                        app,
                        "app-icon",
                        format!("failed to refresh shortcut {}: {error}", path.display()),
                    );
                }
                Err(_) => {}
            }
        }
    }

    Ok(updated)
}

fn refresh_shortcut_icon(
    shortcut_path: &Path,
    executable: &str,
    icon_directory: &str,
    icon_path: &Path,
) -> Result<bool, String> {
    let link: IShellLinkW = unsafe {
        CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| error.to_string())?
    };
    let persist: IPersistFile = link.cast().map_err(|error| error.to_string())?;
    let shortcut_name = HSTRING::from(shortcut_path.to_string_lossy().as_ref());
    unsafe {
        persist
            .Load(&shortcut_name, STGM_READWRITE)
            .map_err(|error| error.to_string())?;
    }

    let mut target = [0u16; 32768];
    unsafe {
        link.GetPath(&mut target, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32)
            .map_err(|error| error.to_string())?;
    }
    let target = wide_path(&target);
    if normalized_path(Path::new(&target)) != executable {
        return Ok(false);
    }

    let mut current_icon = [0u16; 32768];
    let mut current_icon_index = 0;
    unsafe {
        link.GetIconLocation(&mut current_icon, &mut current_icon_index)
            .map_err(|error| error.to_string())?;
    }
    let current_icon = wide_path(&current_icon);
    let current_icon = current_icon.trim();
    let current_icon_path = normalized_path(Path::new(current_icon));
    let managed_icon_prefix = format!("{}\\", icon_directory.trim_end_matches('\\'));
    let icon_is_managed = current_icon_path.starts_with(&managed_icon_prefix);
    if !current_icon.is_empty() && current_icon_path != executable && !icon_is_managed {
        return Ok(false);
    }

    let next_icon_path = normalized_path(icon_path);
    if current_icon_path == next_icon_path {
        return Ok(false);
    }

    let next_icon = HSTRING::from(icon_path.to_string_lossy().as_ref());
    unsafe {
        link.SetIconLocation(&next_icon, 0)
            .map_err(|error| error.to_string())?;
        persist
            .Save(&shortcut_name, true)
            .map_err(|error| error.to_string())?;
        let path = shortcut_path
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>();
        SHChangeNotify(
            SHCNE_UPDATEITEM,
            SHCNF_PATHW | SHCNF_FLUSHNOWAIT,
            Some(path.as_ptr().cast()),
            None,
        );
    }

    Ok(true)
}

fn normalized_path(path: &Path) -> String {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let path = resolved.to_string_lossy().replace('/', "\\");
    let path = path.strip_prefix("\\\\?\\").unwrap_or(&path);
    path.to_lowercase()
}

fn wide_path(buffer: &[u16]) -> String {
    let end = buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(buffer.len());
    std::ffi::OsString::from_wide(&buffer[..end])
        .to_string_lossy()
        .into_owned()
}

struct ComApartment;

impl ComApartment {
    fn initialize() -> Result<Self, String> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
            .ok()
            .map_err(|error| error.to_string())?;
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

pub(super) fn set_window_icon(window: &WebviewWindow, variant: &str) -> Result<(), String> {
    let target = window.clone();
    let variant = variant.to_string();
    window
        .run_on_main_thread(move || {
            let result = target
                .hwnd()
                .map_err(|error| error.to_string())
                .and_then(|hwnd| apply_window_icon(HWND(hwnd.0), &variant));
            if let Err(error) = result {
                crate::services::logging::warn(
                    target.app_handle(),
                    "app-icon",
                    format!("failed to update Windows window/taskbar icon: {error}"),
                );
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::{
        core::w,
        Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, GetClassLongPtrW, SetClassLongPtrW, WINDOW_EX_STYLE,
            WM_GETICON, WS_OVERLAPPED,
        },
    };

    #[test]
    fn native_window_updates_both_icon_sizes_and_can_restore_classic() {
        // A hidden native window exercises real WM_SETICON/WM_GETICON handling.
        let hwnd = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("transterm icon test"),
                WS_OVERLAPPED,
                0,
                0,
                100,
                100,
                None,
                None,
                None,
                None,
            )
        }
        .unwrap();
        let old_class_big = unsafe { GetClassLongPtrW(hwnd, GCLP_HICON) };
        let old_class_small = unsafe { GetClassLongPtrW(hwnd, GCLP_HICONSM) };
        let mut handles = Vec::new();
        for variant in ["classic", "material", "clean", "classic"] {
            apply_window_icon(hwnd, variant).unwrap();
            let get = |kind| unsafe {
                SendMessageW(hwnd, WM_GETICON, Some(WPARAM(kind as usize)), None).0
            };
            let big = get(ICON_BIG);
            let small = get(ICON_SMALL);
            assert_ne!(big, 0);
            assert_ne!(small, 0);
            assert_ne!(small, big);
            assert_eq!(unsafe { GetClassLongPtrW(hwnd, GCLP_HICON) }, big as usize);
            assert_eq!(
                unsafe { GetClassLongPtrW(hwnd, GCLP_HICONSM) },
                small as usize
            );
            handles.push((small, big));
        }
        assert_ne!(handles[0], handles[1]);
        assert_ne!(handles[1], handles[2]);
        assert_ne!(handles[0], handles[2]);
        assert_eq!(handles[0], handles[3]);
        unsafe {
            SetClassLongPtrW(hwnd, GCLP_HICON, old_class_big as isize);
            SetClassLongPtrW(hwnd, GCLP_HICONSM, old_class_small as isize);
        }
        unsafe { DestroyWindow(hwnd) }.unwrap();
    }

    #[test]
    fn shell_link_icon_refresh_only_changes_transterm_links_and_keeps_targets() {
        let _apartment = ComApartment::initialize().unwrap();
        let temp_dir = env::temp_dir().join(format!(
            "transterm-shell-link-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let shortcut_path = temp_dir.join("transterm.lnk");
        let icon_directory = temp_dir.join("icons");
        fs::create_dir_all(&icon_directory).unwrap();
        let icon_path = icon_directory.join("transterm-test.ico");
        fs::write(&icon_path, shell_icon_bytes("classic")).unwrap();
        let executable = env::current_exe().unwrap();

        let link: IShellLinkW =
            unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap() };
        let executable_name = HSTRING::from(executable.to_string_lossy().as_ref());
        unsafe { link.SetPath(&executable_name).unwrap() };
        let persist: IPersistFile = link.cast().unwrap();
        let shortcut_name = HSTRING::from(shortcut_path.to_string_lossy().as_ref());
        unsafe { persist.Save(&shortcut_name, true).unwrap() };

        assert!(!refresh_shortcut_icon(
            &shortcut_path,
            &normalized_path(&temp_dir.join("some-other-app.exe")),
            &normalized_path(&icon_directory),
            &icon_path
        )
        .unwrap());
        assert!(refresh_shortcut_icon(
            &shortcut_path,
            &normalized_path(&executable),
            &normalized_path(&icon_directory),
            &icon_path
        )
        .unwrap());

        let check_link: IShellLinkW =
            unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap() };
        let check_persist: IPersistFile = check_link.cast().unwrap();
        unsafe { check_persist.Load(&shortcut_name, STGM_READWRITE).unwrap() };
        let mut target = [0u16; 32768];
        unsafe {
            check_link
                .GetPath(&mut target, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32)
                .unwrap();
        }
        assert_eq!(
            normalized_path(Path::new(&wide_path(&target))),
            normalized_path(&executable)
        );
        let mut actual_icon = [0u16; 32768];
        let mut actual_icon_index = 0;
        unsafe {
            check_link
                .GetIconLocation(&mut actual_icon, &mut actual_icon_index)
                .unwrap();
        }
        assert_eq!(
            normalized_path(Path::new(&wide_path(&actual_icon))),
            normalized_path(&icon_path)
        );
        assert!(!refresh_shortcut_icon(
            &shortcut_path,
            &normalized_path(&executable),
            &normalized_path(&icon_directory),
            &icon_path
        )
        .unwrap());

        let custom_icon_path = temp_dir.join("user-icon.ico");
        fs::write(&custom_icon_path, shell_icon_bytes("clean")).unwrap();
        let custom_icon_name = HSTRING::from(custom_icon_path.to_string_lossy().as_ref());
        unsafe {
            check_link.SetIconLocation(&custom_icon_name, 0).unwrap();
            check_persist.Save(&shortcut_name, true).unwrap();
        }
        assert!(!refresh_shortcut_icon(
            &shortcut_path,
            &normalized_path(&executable),
            &normalized_path(&icon_directory),
            &icon_path
        )
        .unwrap());

        fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn shell_icon_variants_are_valid_ico_payloads_with_distinct_assets() {
        use windows::{
            core::HSTRING,
            Win32::{UI::Shell::ExtractIconExW, UI::WindowsAndMessaging::DestroyIcon},
        };

        let temp_dir = env::temp_dir().join(format!(
            "transterm-icon-payload-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let classic = shell_icon_bytes("classic");
        let material = shell_icon_bytes("material");
        let clean = shell_icon_bytes("clean");

        for (variant, icon) in [
            ("classic", &classic),
            ("material", &material),
            ("clean", &clean),
        ] {
            assert_eq!(&icon[0..2], &[0, 0]);
            assert_eq!(&icon[2..4], &[1, 0]);
            let frame_count = u16::from_le_bytes([icon[4], icon[5]]);
            assert_eq!(frame_count, 9);
            let frame_sizes = (0..frame_count)
                .map(|index| {
                    let offset = 6 + usize::from(index) * 16;
                    let width = if icon[offset] == 0 {
                        256
                    } else {
                        u32::from(icon[offset])
                    };
                    let height = if icon[offset + 1] == 0 {
                        256
                    } else {
                        u32::from(icon[offset + 1])
                    };
                    (width, height)
                })
                .collect::<Vec<_>>();
            assert_eq!(
                frame_sizes,
                [16, 20, 24, 32, 40, 48, 64, 128, 256]
                    .into_iter()
                    .map(|size| (size, size))
                    .collect::<Vec<_>>()
            );
            let icon_path = temp_dir.join(format!("{variant}.ico"));
            fs::write(&icon_path, icon).unwrap();
            let icon_name = HSTRING::from(icon_path.to_string_lossy().as_ref());
            let mut large = unsafe { std::mem::zeroed() };
            let count = unsafe { ExtractIconExW(&icon_name, 0, Some(&mut large), None, 1) };
            assert_eq!(
                count, 1,
                "Windows Shell must load the {variant} ICO payload"
            );
            assert_ne!(large.0, std::ptr::null_mut());
            unsafe { DestroyIcon(large) }.unwrap();
        }
        assert_ne!(classic, material);
        assert_ne!(material, clean);
        assert_ne!(classic, clean);
        fs::remove_dir_all(&temp_dir).unwrap();
    }
}
