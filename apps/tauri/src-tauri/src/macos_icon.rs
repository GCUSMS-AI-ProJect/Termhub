use objc2::{AllocAnyThread, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSImage, NSWorkspace, NSWorkspaceIconCreationOptions};
use objc2_foundation::{NSData, NSString, NSUserDefaults};
use std::path::Path;
use tauri::AppHandle;

pub fn set_app_icon(app: &AppHandle, variant: &str) -> Result<(), String> {
    let icon_bytes = crate::app_icon::macos_icon_bytes(variant);
    let variant = variant.to_owned();
    let logging_app = app.clone();

    app.run_on_main_thread(move || {
        // SAFETY: Tauri runs this closure on the AppKit main thread.
        let main_thread = unsafe { MainThreadMarker::new_unchecked() };
        let data = NSData::with_bytes(icon_bytes);
        let Some(icon) = NSImage::initWithData(NSImage::alloc(), &data) else {
            crate::services::logging::warn(
                &logging_app,
                "app-icon",
                "unable to decode embedded Dock icon",
            );
            return;
        };
        let defaults = NSUserDefaults::standardUserDefaults();
        let preference_key = NSString::from_str("app_icon");
        let selected_variant = NSString::from_str(&variant);
        // The Dock tile plug-in runs in Dock and reads this app preference while transterm is closed.
        unsafe { defaults.setObject_forKey(Some(&selected_variant), &preference_key) };

        if let Some(bundle_path) = std::env::current_exe().ok().and_then(|executable| {
            executable
                .ancestors()
                .find(|path| path.extension().is_some_and(|extension| extension == "app"))
                .map(Path::to_path_buf)
        }) {
            let bundle_path = NSString::from_str(&bundle_path.to_string_lossy());
            let workspace = NSWorkspace::sharedWorkspace();
            let options = NSWorkspaceIconCreationOptions(0);

            // Clear Finder metadata left by earlier versions; keep this signed app bundle's icon unchanged.
            if !workspace.setIcon_forFile_options(None, &bundle_path, options) {
                crate::services::logging::warn(
                    &logging_app,
                    "app-icon",
                    "failed to clear a previous Finder icon override",
                );
            }
        }

        // SAFETY: The image is decoded from a bundled PNG and AppKit's setter accepts it.
        unsafe {
            NSApplication::sharedApplication(main_thread).setApplicationIconImage(Some(&icon))
        };
    })
    .map_err(|error| error.to_string())
}
