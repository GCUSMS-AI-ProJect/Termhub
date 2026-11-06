use super::*;

struct Fixture(std::path::PathBuf);
impl Fixture {
    fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("transterm-launcher-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    fn update(&self, variant: &str) -> Result<(), String> {
        let desktop_dir = self.0.join("desktop");
        update_launcher_icons(
            &self.0.join("applications"),
            &self.0.join("icons"),
            Some(&desktop_dir),
            Path::new("/usr/bin/transterm"),
            variant,
        )
    }
    fn entry(&self, name: &str) -> String {
        fs::read_to_string(self.0.join("applications").join(name)).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn both_desktop_ids_follow_variants_and_restore_classic() {
    let fixture = Fixture::new();
    let mut paths = Vec::new();
    for variant in ["classic", "material", "clean", "classic"] {
        fixture.update(variant).unwrap();
        let entries = DESKTOP_ENTRIES.map(|(name, _)| fixture.entry(name));
        let icon_line = |entry: &str| {
            entry
                .lines()
                .find(|line| line.starts_with("Icon="))
                .unwrap()
                .to_string()
        };
        let icon = icon_line(&entries[0]);
        assert_eq!(icon, icon_line(&entries[1]));
        assert_eq!(
            fs::read(icon.strip_prefix("Icon=").unwrap()).unwrap(),
            super::super::icon_bytes(variant)
        );
        for entry in &entries {
            assert!(entry.contains("Exec=\"/usr/bin/transterm\" %U\n"));
            assert!(entry.contains("TryExec=/usr/bin/transterm\n"));
            assert!(entry.contains("StartupWMClass=transterm\n"));
        }
        assert!(!entries[0].contains("NoDisplay=true"));
        assert!(entries[1].contains("NoDisplay=true"));
        paths.push(icon);
    }
    assert_ne!(paths[0], paths[1]);
    assert_ne!(paths[1], paths[2]);
    assert_eq!(paths[0], paths[3]);
}

#[cfg(unix)]
#[test]
fn updates_matching_desktop_shortcut_and_keeps_its_mode_and_other_fields() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = Fixture::new();
    let desktop_dir = fixture.0.join("desktop");
    fs::create_dir_all(&desktop_dir).unwrap();
    let shortcut = desktop_dir.join("transterm.desktop");
    fs::write(
        &shortcut,
        "[Desktop Entry]\nName=My transterm\nExec=/usr/bin/transterm %U\nIcon=transterm\nTerminal=false\n",
    )
    .unwrap();
    fs::set_permissions(&shortcut, fs::Permissions::from_mode(0o755)).unwrap();

    fixture.update("material").unwrap();

    let contents = fs::read_to_string(&shortcut).unwrap();
    let icon = contents
        .lines()
        .find(|line| line.starts_with("Icon="))
        .unwrap()
        .strip_prefix("Icon=")
        .unwrap();
    assert!(icon.contains("launcher-material-"));
    assert_eq!(
        fs::read(icon).unwrap(),
        super::super::icon_bytes("material")
    );
    assert!(contents.contains("Name=My transterm\nExec=/usr/bin/transterm %U\n"));
    assert!(contents.contains("Terminal=false\n"));
    assert_eq!(
        fs::metadata(shortcut).unwrap().permissions().mode() & 0o777,
        0o755
    );
}

#[test]
fn leaves_unrelated_or_customized_desktop_shortcuts_untouched() {
    let fixture = Fixture::new();
    let desktop_dir = fixture.0.join("desktop");
    fs::create_dir_all(&desktop_dir).unwrap();
    let unrelated = desktop_dir.join("Other.desktop");
    let customized = desktop_dir.join("transterm customized.desktop");
    fs::write(
        &unrelated,
        "[Desktop Entry]\nName=Other\nExec=/usr/bin/other %U\nIcon=transterm\n",
    )
    .unwrap();
    fs::write(
        &customized,
        "[Desktop Entry]\nName=transterm\nExec=/usr/bin/transterm %U\nIcon=my-custom-icon\n",
    )
    .unwrap();
    #[cfg(unix)]
    let linked_target = fixture.0.join("linked.desktop");
    #[cfg(unix)]
    let linked_shortcut = desktop_dir.join("Linked.desktop");
    #[cfg(unix)]
    {
        fs::write(
            &linked_target,
            "[Desktop Entry]\nName=transterm\nExec=/usr/bin/transterm %U\nIcon=transterm\n",
        )
        .unwrap();
        std::os::unix::fs::symlink(&linked_target, &linked_shortcut).unwrap();
    }
    let unrelated_before = fs::read(&unrelated).unwrap();
    let customized_before = fs::read(&customized).unwrap();
    #[cfg(unix)]
    let linked_target_before = fs::read(&linked_target).unwrap();

    fixture.update("clean").unwrap();

    assert_eq!(fs::read(unrelated).unwrap(), unrelated_before);
    assert_eq!(fs::read(customized).unwrap(), customized_before);
    #[cfg(unix)]
    assert_eq!(fs::read(linked_target).unwrap(), linked_target_before);
}

#[test]
fn preserves_user_managed_companion_without_partially_updating_visible_entry() {
    let fixture = Fixture::new();
    fixture.update("classic").unwrap();
    let before = fixture.entry("transterm.desktop");
    let companion = fixture.0.join("applications/com.transterm.desktop.desktop");
    fs::write(&companion, "[Desktop Entry]\nName=Custom\n").unwrap();
    assert!(fixture.update("material").is_err());
    assert_eq!(fixture.entry("transterm.desktop"), before);
    assert_eq!(
        fs::read_to_string(companion).unwrap(),
        "[Desktop Entry]\nName=Custom\n"
    );
}

#[test]
fn migrates_legacy_generated_entry_and_does_not_rewrite_unchanged_files() {
    let fixture = Fixture::new();
    fs::create_dir(fixture.0.join("applications")).unwrap();
    fs::write(
        fixture.0.join("applications/transterm.desktop"),
        format!("{MARKER}\n[Desktop Entry]\nIcon=/old/launcher.png\n"),
    )
    .unwrap();
    fixture.update("classic").unwrap();
    let path = fixture.0.join("applications/transterm.desktop");
    let before = fs::metadata(&path).unwrap().modified().unwrap();
    fixture.update("classic").unwrap();
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
    assert!(fixture
        .entry("transterm.desktop")
        .contains("launcher-classic-"));
}

#[test]
fn package_entry_points_preserve_debian_and_arch_wrappers() {
    for exe in [
        "/usr/lib/transterm/transterm",
        "/usr/lib/transterm/runtime/transterm",
        "/usr/bin/transterm",
    ] {
        assert_eq!(
            packaged_launcher(Path::new(exe)),
            Path::new("/usr/bin/transterm")
        );
    }
    assert_eq!(
        packaged_launcher(Path::new("/opt/transterm/transterm")),
        Path::new("/opt/transterm/transterm")
    );
}

#[test]
fn desktop_exec_uses_both_escape_layers() {
    assert_eq!(
        quote_desktop_exec_arg("/home/a b/File\"Term`$%\\"),
        "\"/home/a b/File\\\\\"Term\\\\`\\\\$%%\\\\\\\\\""
    );
    assert_eq!(
        escape_desktop_value("/home/a b/File\\Term.png"),
        "/home/a b/File\\\\Term.png"
    );
}

#[cfg(target_os = "linux")]
#[test]
fn generated_entries_round_trip_through_native_gio_with_special_path_characters() {
    use gtk::gio::prelude::{AppInfoExt, IconExt};
    use std::os::unix::fs::PermissionsExt;

    let fixture = Fixture::new();
    let executable = fixture.0.join("File Term-中文-\"`$%\\");
    fs::write(&executable, "#!/bin/sh\nprintf launched > \"$0.ran\"\n").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
    let marker = std::path::PathBuf::from(format!("{}.ran", executable.display()));
    update_launcher_icons(
        &fixture.0.join("applications"),
        &fixture.0.join("icons"),
        None,
        &executable,
        "material",
    )
    .unwrap();
    for (name, _) in DESKTOP_ENTRIES {
        let entry =
            gtk::gio::DesktopAppInfo::from_filename(fixture.0.join("applications").join(name))
                .expect("GIO must accept the generated desktop entry including TryExec");
        assert_eq!(entry.executable(), Path::new("/usr/bin/env"));
        entry
            .launch(&[], None::<&gtk::gio::AppLaunchContext>)
            .unwrap();
        for _ in 0..500 {
            if marker.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert_eq!(fs::read(&marker).unwrap(), b"launched");
        fs::remove_file(&marker).unwrap();
        assert!(IconExt::to_string(&entry.icon().unwrap())
            .unwrap()
            .contains("launcher-material-"));
    }
}
