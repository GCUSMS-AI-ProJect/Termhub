use std::{fs, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::LogicalSize;

const MAIN_WINDOW_STATE_FILE: &str = "window-state.json";
const MAIN_WINDOW_DEFAULT_WIDTH: f64 = 1280.0;
const MAIN_WINDOW_DEFAULT_HEIGHT: f64 = 820.0;
const MAIN_WINDOW_MIN_WIDTH: f64 = 1150.0;
const MAIN_WINDOW_MIN_HEIGHT: f64 = 790.0;
const MAIN_WINDOW_RESIZE_DEBOUNCE: Duration = Duration::from_millis(300);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
struct MainWindowGeometry {
    width: f64,
    height: f64,
    maximized: bool,
}

impl Default for MainWindowGeometry {
    fn default() -> Self {
        Self {
            width: MAIN_WINDOW_DEFAULT_WIDTH,
            height: MAIN_WINDOW_DEFAULT_HEIGHT,
            maximized: false,
        }
    }
}

#[derive(Default)]
struct MainWindowGeometryPersistence {
    revision: std::sync::atomic::AtomicU64,
    write_lock: std::sync::Mutex<()>,
}

fn read_main_window_geometry(
    app: &AppHandle<Wry>,
) -> Result<Option<MainWindowGeometry>, crate::AppError> {
    let path = crate::storage::workspace_file(app, MAIN_WINDOW_STATE_FILE)?;
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(crate::AppError::Storage(error.to_string())),
    };
    let geometry: MainWindowGeometry = serde_json::from_str(&content)
        .map_err(|error| crate::AppError::Serialization(error.to_string()))?;
    if !geometry.width.is_finite()
        || !geometry.height.is_finite()
        || geometry.width <= 0.0
        || geometry.height <= 0.0
    {
        return Err(crate::AppError::Serialization(
            "主窗口尺寸必须为有限正数".to_string(),
        ));
    }
    Ok(Some(geometry))
}

fn fit_window_size(
    desired: LogicalSize<f64>,
    minimum: LogicalSize<f64>,
    work_area: LogicalSize<f64>,
) -> (LogicalSize<f64>, LogicalSize<f64>) {
    // Leave room for native frames without letting a minimum exceed the screen.
    let max_width = (work_area.width - 24.0).max(1.0);
    let max_height = (work_area.height - 48.0).max(1.0);
    let minimum = LogicalSize::new(minimum.width.min(max_width), minimum.height.min(max_height));
    (
        LogicalSize::new(
            desired.width.clamp(minimum.width, max_width),
            desired.height.clamp(minimum.height, max_height),
        ),
        minimum,
    )
}

fn monitor_work_area(monitor: &tauri::Monitor) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let area = monitor.work_area();
    if area.size.width > 0 && area.size.height > 0 {
        (area.position, area.size)
    } else {
        (*monitor.position(), *monitor.size())
    }
}

fn watch_window_display_changes(window: &WebviewWindow<Wry>, minimum: LogicalSize<f64>) {
    let display_geometry = |window: &WebviewWindow<Wry>| {
        window.current_monitor().ok().flatten().map(|monitor| {
            let (position, area) = monitor_work_area(&monitor);
            (position, area, monitor.scale_factor())
        })
    };
    let previous = std::sync::Mutex::new(display_geometry(window));
    let tracked = window.clone();
    window.on_window_event(move |event| {
        if !matches!(
            event,
            WindowEvent::Resized(_)
                | WindowEvent::Moved(_)
                | WindowEvent::ScaleFactorChanged { .. }
                | WindowEvent::Focused(true)
        ) {
            return;
        }
        let Some(display) = display_geometry(&tracked) else {
            return;
        };
        {
            let Ok(mut previous) = previous.lock() else {
                return;
            };
            if *previous == Some(display) {
                return;
            }
            // macOS scaled modes can change the work area while backingScaleFactor stays 2.
            *previous = Some(display);
        }
        if let Err(error) = fit_existing_window_to_display(&tracked, minimum, display) {
            crate::services::logging::warn(
                tracked.app_handle(),
                "window",
                format!(
                    "unable to adapt display change label={}: {error}",
                    tracked.label()
                ),
            );
        }
    });
}

fn fit_existing_window_to_display(
    window: &WebviewWindow<Wry>,
    minimum: LogicalSize<f64>,
    (position, area, scale): (PhysicalPosition<i32>, PhysicalSize<u32>, f64),
) -> tauri::Result<()> {
    let current = window.inner_size()?.to_logical(window.scale_factor()?);
    let (size, minimum) = fit_window_size(current, minimum, area.to_logical(scale));
    window.set_min_size(Some(minimum))?;
    if window.is_maximized()? || window.is_fullscreen()? {
        return Ok(());
    }
    if size != current {
        window.set_size(size)?;
    }
    let outer_size = window.outer_size()?;
    let current_position = window.outer_position()?;
    let fitted_position = center_child_window_position(
        current_position,
        outer_size,
        outer_size,
        Some((position, area)),
    );
    if fitted_position != current_position {
        window.set_position(fitted_position)?;
    }
    Ok(())
}

fn restore_main_window_geometry(
    app: &AppHandle<Wry>,
    window: &WebviewWindow<Wry>,
    remember_window_size: bool,
) {
    let geometry = if remember_window_size {
        match read_main_window_geometry(app) {
            Ok(Some(geometry)) => geometry,
            Ok(None) => MainWindowGeometry::default(),
            Err(error) => {
                crate::services::logging::warn(
                    app,
                    "window",
                    format!("unable to read saved main window size: {error}"),
                );
                MainWindowGeometry::default()
            }
        }
    } else {
        MainWindowGeometry::default()
    };
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let mut size = LogicalSize::new(geometry.width, geometry.height);
    if let Some(monitor) = &monitor {
        let (_, area) = monitor_work_area(monitor);
        let (fitted, minimum) = fit_window_size(
            size,
            LogicalSize::new(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT),
            area.to_logical(monitor.scale_factor()),
        );
        if let Err(error) = window.set_min_size(Some(minimum)) {
            crate::services::logging::warn(
                app,
                "window",
                format!("unable to adapt minimum window size: {error}"),
            );
        }
        size = fitted;
    }
    if !geometry.maximized && window.is_maximized().unwrap_or(false) {
        if let Err(error) = window.unmaximize() {
            crate::services::logging::warn(
                app,
                "window",
                format!("unable to unmaximize fixed-size main window: {error}"),
            );
        }
    }
    if let Err(error) = window.set_size(size) {
        crate::services::logging::warn(
            app,
            "window",
            format!("unable to restore main window size: {error}"),
        );
        return;
    }
    if geometry.maximized {
        if let Err(error) = window.maximize() {
            crate::services::logging::warn(
                app,
                "window",
                format!("unable to restore maximized main window: {error}"),
            );
        }
    } else if let Some(monitor) = monitor {
        let (position, area) = monitor_work_area(&monitor);
        if let Ok(outer_size) = window.outer_size() {
            let centered =
                center_child_window_position(position, area, outer_size, Some((position, area)));
            if let Err(error) = window.set_position(centered) {
                crate::services::logging::warn(
                    app,
                    "window",
                    format!("unable to position main window in work area: {error}"),
                );
            }
        }
    }
}

fn schedule_main_window_geometry_save(app: &AppHandle<Wry>) {
    let revision = app
        .state::<MainWindowGeometryPersistence>()
        .revision
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(MAIN_WINDOW_RESIZE_DEBOUNCE).await;
        if app
            .state::<MainWindowGeometryPersistence>()
            .revision
            .load(std::sync::atomic::Ordering::Relaxed)
            != revision
        {
            return;
        }
        persist_main_window_geometry(&app);
    });
}

fn persist_main_window_geometry(app: &AppHandle<Wry>) {
    let persistence = app.state::<MainWindowGeometryPersistence>();
    let Ok(_guard) = persistence.write_lock.lock() else {
        crate::services::logging::warn(app, "window", "main window size write lock is poisoned");
        return;
    };
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let mut geometry = read_main_window_geometry(app)
        .ok()
        .flatten()
        .unwrap_or_default();
    let maximized = window.is_maximized().unwrap_or(false);
    if !maximized {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let Ok(size) = window.inner_size() else {
            return;
        };
        let logical_size = size.to_logical::<f64>(scale_factor);
        geometry.width = logical_size.width;
        geometry.height = logical_size.height;
    }
    geometry.maximized = maximized;

    if let Err(error) = write_main_window_geometry(app, &geometry) {
        crate::services::logging::warn(
            app,
            "window",
            format!("unable to save main window size: {error}"),
        );
    }
}

fn flush_main_window_geometry(app: &AppHandle<Wry>) {
    app.state::<MainWindowGeometryPersistence>()
        .revision
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    persist_main_window_geometry(app);
}

fn write_main_window_geometry(
    app: &AppHandle<Wry>,
    geometry: &MainWindowGeometry,
) -> Result<(), crate::AppError> {
    let path = crate::storage::workspace_file(app, MAIN_WINDOW_STATE_FILE)?;
    let temporary = path.with_file_name(format!(
        ".{MAIN_WINDOW_STATE_FILE}.{}.tmp",
        uuid::Uuid::new_v4()
    ));
    let content = serde_json::to_vec_pretty(geometry)
        .map_err(|error| crate::AppError::Serialization(error.to_string()))?;
    fs::write(&temporary, content).map_err(|error| crate::AppError::Storage(error.to_string()))?;
    if let Err(error) = crate::storage::replace_file_atomically(&temporary, &path) {
        let _ = fs::remove_file(temporary);
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod window_geometry_tests {
    use super::*;

    #[test]
    fn high_dpi_work_area_limits_default_and_saved_sizes_and_native_minimum() {
        let area = PhysicalSize::new(1920_u32, 1040_u32).to_logical(1.75);
        for desired in [
            LogicalSize::new(MAIN_WINDOW_DEFAULT_WIDTH, MAIN_WINDOW_DEFAULT_HEIGHT),
            LogicalSize::new(3000.0, 2000.0),
        ] {
            let (size, minimum) = fit_window_size(
                desired,
                LogicalSize::new(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT),
                area,
            );
            assert!(size.width < area.width && size.height < area.height);
            assert!(minimum.width <= size.width && minimum.height <= size.height);
            assert!(minimum.width < MAIN_WINDOW_MIN_WIDTH);
            assert!(minimum.height < MAIN_WINDOW_MIN_HEIGHT);
        }
    }

    #[test]
    fn normal_screen_keeps_default_and_saved_sizes() {
        let minimum = LogicalSize::new(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT);
        for desired in [
            LogicalSize::new(1280.0, 820.0),
            LogicalSize::new(1600.0, 950.0),
        ] {
            assert_eq!(
                fit_window_size(desired, minimum, LogicalSize::new(1920.0, 1040.0)),
                (desired, minimum)
            );
        }
    }

    #[test]
    fn four_k_keeps_default_logical_size_at_common_scales() {
        let desired = LogicalSize::new(MAIN_WINDOW_DEFAULT_WIDTH, MAIN_WINDOW_DEFAULT_HEIGHT);
        let minimum = LogicalSize::new(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT);
        let physical_area = PhysicalSize::new(3840_u32, 2080_u32);
        for scale in [1.0, 1.25, 1.5, 1.75, 2.0] {
            let (size, fitted_minimum) =
                fit_window_size(desired, minimum, physical_area.to_logical(scale));
            assert_eq!(size, desired, "4K scale={scale}");
            assert_eq!(fitted_minimum, minimum, "4K scale={scale}");
            let physical_size = size.to_physical::<u32>(scale);
            assert_eq!(physical_size.width, (1280.0 * scale) as u32);
            assert_eq!(physical_size.height, (820.0 * scale) as u32);
        }
    }

    #[test]
    fn four_k_extreme_scaling_and_saved_large_windows_fit_work_area() {
        let physical_area = PhysicalSize::new(3840_u32, 2080_u32);
        let minimum = LogicalSize::new(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT);
        for scale in [1.0, 1.5, 2.0, 2.5, 3.0, 4.0] {
            let area = physical_area.to_logical::<f64>(scale);
            for desired in [
                LogicalSize::new(1280.0, 820.0),
                LogicalSize::new(3000.0, 1800.0),
            ] {
                let (size, fitted_minimum) = fit_window_size(desired, minimum, area);
                assert!(size.width <= area.width - 24.0, "4K scale={scale}");
                assert!(size.height <= area.height - 48.0, "4K scale={scale}");
                assert!(fitted_minimum.width <= size.width && fitted_minimum.height <= size.height);
                let physical_size = size.to_physical::<u32>(scale);
                assert!(physical_size.width <= physical_area.width);
                assert!(physical_size.height <= physical_area.height);
            }
        }
    }

    #[test]
    fn saved_four_k_window_fits_smaller_screen_and_negative_origin_display() {
        let desired = LogicalSize::new(3000.0, 1800.0);
        let minimum = LogicalSize::new(MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT);
        for (area, scale) in [
            (PhysicalSize::new(3840_u32, 2080_u32), 2.0),
            (PhysicalSize::new(1920_u32, 1040_u32), 1.75),
        ] {
            let (size, _) = fit_window_size(desired, minimum, area.to_logical(scale));
            let physical_size = size.to_physical(scale);
            for origin in [
                PhysicalPosition::new(-3840, 80),
                PhysicalPosition::new(1920, 0),
            ] {
                let position =
                    center_child_window_position(origin, area, physical_size, Some((origin, area)));
                assert!(position.x >= origin.x && position.y >= origin.y);
                assert!(
                    i64::from(position.x) + i64::from(physical_size.width)
                        <= i64::from(origin.x) + i64::from(area.width)
                );
                assert!(
                    i64::from(position.y) + i64::from(physical_size.height)
                        <= i64::from(origin.y) + i64::from(area.height)
                );
            }
        }
    }

    #[test]
    fn small_work_area_also_fits_editor_and_connection_windows() {
        for (desired, minimum) in [
            (
                LogicalSize::new(1220.0, 780.0),
                LogicalSize::new(1040.0, 620.0),
            ),
            (
                LogicalSize::new(860.0, 680.0),
                LogicalSize::new(760.0, 620.0),
            ),
        ] {
            let (size, minimum) = fit_window_size(desired, minimum, LogicalSize::new(800.0, 550.0));
            assert!(size.width <= 776.0 && size.height <= 502.0);
            assert!(minimum.width <= size.width && minimum.height <= size.height);
        }
    }

    #[test]
    fn resolution_scale_and_desktop_work_area_matrix() {
        let resolutions = [
            (1280_u32, 720_u32),
            (1366, 768),
            (1920, 1080),
            (2048, 1080),
            (2560, 1440),
            (2560, 1600),
            (2880, 1800),
            (3024, 1964),
            (3456, 2234),
            (3840, 2160),
            (5120, 2880),
            (3440, 1440),
            (1080, 1920),
        ];
        let windows = [
            ("main", (1280.0, 820.0), (1150.0, 790.0)),
            ("editor", (1220.0, 780.0), (1040.0, 620.0)),
            ("connection", (860.0, 680.0), (760.0, 620.0)),
            ("saved-large", (3000.0, 1800.0), (1150.0, 790.0)),
        ];
        // Insets are fixture inputs, not claims about native desktop reporting.
        let desktop_insets = [
            ("unreserved", (0.0, 0.0, 0.0)),
            ("bottom-taskbar", (0.0, 0.0, 48.0)),
            ("left-taskbar", (64.0, 0.0, 0.0)),
            ("menu-and-dock", (0.0, 32.0, 80.0)),
            ("top-bottom-panels", (0.0, 32.0, 48.0)),
        ];
        let mut checked = 0;
        for (width, height) in resolutions {
            for scale in [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0, 4.0] {
                for (desktop, (left, top, bottom)) in desktop_insets {
                    let reserved = LogicalSize::new(left, top + bottom).to_physical::<u32>(scale);
                    let area = PhysicalSize::new(width - reserved.width, height - reserved.height);
                    for (kind, desired, minimum) in windows {
                        let context = format!("{width}x{height} scale={scale} {desktop} {kind}");
                        let (size, minimum) = fit_window_size(
                            LogicalSize::new(desired.0, desired.1),
                            LogicalSize::new(minimum.0, minimum.1),
                            area.to_logical(scale),
                        );
                        assert!(size.width > 0.0 && size.height > 0.0, "{context}");
                        assert!(
                            minimum.width <= size.width && minimum.height <= size.height,
                            "{context}"
                        );
                        let outer_size = LogicalSize::new(size.width + 24.0, size.height + 48.0)
                            .to_physical::<u32>(scale);
                        assert!(
                            outer_size.width <= area.width && outer_size.height <= area.height,
                            "{context}"
                        );
                        for (x, y) in [
                            (0, 0),
                            (-(width as i32), 120),
                            (width as i32, -(height as i32)),
                        ] {
                            let origin = PhysicalPosition::new(
                                x + (left * scale) as i32,
                                y + (top * scale) as i32,
                            );
                            let position = center_child_window_position(
                                origin,
                                area,
                                outer_size,
                                Some((origin, area)),
                            );
                            assert!(
                                position.x >= origin.x && position.y >= origin.y,
                                "{context}"
                            );
                            assert!(
                                i64::from(position.x) + i64::from(outer_size.width)
                                    <= i64::from(origin.x) + i64::from(area.width),
                                "{context}"
                            );
                            assert!(
                                i64::from(position.y) + i64::from(outer_size.height)
                                    <= i64::from(origin.y) + i64::from(area.height),
                                "{context}"
                            );
                            checked += 1;
                        }
                    }
                }
            }
        }
        assert_eq!(checked, 7020);
    }
}
