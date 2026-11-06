#!/usr/bin/env python3
"""Check actual extracted Linux desktop and icon payloads."""

import argparse
import configparser
from pathlib import Path
import struct


ICON_FILES = {
    "usr/share/pixmaps/transterm.png": ("app/linux/128x128.png", 128),
    "usr/share/pixmaps/com.transterm.desktop.png": ("app/linux/128x128.png", 128),
    "usr/share/icons/hicolor/32x32/apps/transterm.png": ("app/linux/32x32.png", 32),
    "usr/share/icons/hicolor/128x128/apps/transterm.png": ("app/linux/128x128.png", 128),
    "usr/share/icons/hicolor/256x256@2/apps/transterm.png": ("app/linux/128x128@2x.png", 256),
}


def verify(root, icons_dir, appimage=False):
    for relative, (source, size) in ICON_FILES.items():
        payload = (root / relative).read_bytes()
        expected = (icons_dir / source).read_bytes()
        if payload != expected:
            raise ValueError(f"Stale or modified package icon: {relative}")
        if payload[:8] != b"\x89PNG\r\n\x1a\n" or payload[24:26] != bytes([8, 6]):
            raise ValueError(f"Expected an 8-bit RGBA PNG: {relative}")
        if struct.unpack(">II", payload[16:24]) != (size, size):
            raise ValueError(f"Incorrect icon dimensions: {relative}")

    executable = "transterm" if appimage else "/usr/bin/transterm"
    for name, hidden in [("transterm.desktop", False), ("com.transterm.desktop.desktop", True)]:
        entry = configparser.ConfigParser(interpolation=None)
        path = root / "usr/share/applications" / name
        if b"\r" in path.read_bytes():
            raise ValueError(f"Desktop entries must use LF line endings: {name}")
        with path.open() as file:
            entry.read_file(file)
        values = entry["Desktop Entry"]
        for key, expected in {
            "Type": "Application", "Name": "TermHub", "Icon": "transterm",
            "Exec": f"{executable} %U", "TryExec": None if appimage else executable,
            "StartupWMClass": "transterm",
        }.items():
            if values.get(key) != expected:
                raise ValueError(f"Incorrect {key} in {name}: {values.get(key)!r}")
        if values.getboolean("NoDisplay", fallback=False) != hidden:
            raise ValueError(f"Incorrect launcher visibility: {name}")
    if appimage:
        verify_appimage(root)
    print(f"Verified Linux launcher IDs and five classic icon payloads: {root}")


def verify_appimage(root):
    desktops = list(root.glob("*.desktop"))
    if len(desktops) != 1 or desktops[0].name != "transterm.desktop":
        raise ValueError("AppDir must expose exactly one root desktop entry: transterm.desktop")
    if desktops[0].read_bytes() != (root / "usr/share/applications/transterm.desktop").read_bytes():
        raise ValueError("AppDir root desktop entry differs from the packaged launcher")
    for executable in ["AppRun", "AppRun.wrapped", "usr/bin/transterm"]:
        if not (root / executable).is_file():
            raise ValueError(f"AppDir executable is missing: {executable}")
    icon = (root / "usr/share/icons/hicolor/256x256@2/apps/transterm.png").read_bytes()
    if (root / "transterm.png").read_bytes() != icon or (root / ".DirIcon").read_bytes() != icon:
        raise ValueError("AppDir launcher and thumbnail must use the bundled 256px icon")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Extracted Linux package root")
    parser.add_argument("--appimage", action="store_true", help="Check portable AppDir launchers and root entries")
    parser.add_argument("--icons-dir", type=Path,
                        default=Path(__file__).resolve().parents[1] / "src-tauri/icons")
    args = parser.parse_args()
    verify(args.root, args.icons_dir, args.appimage)
