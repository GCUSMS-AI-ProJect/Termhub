"""Generate Windows/Linux app icon resources from the canonical artwork.

Requires Pillow (`python -m pip install Pillow`). Run from any directory with:
    python apps/tauri/scripts/generate-platform-app-icons.py

macOS Dock resources intentionally remain untouched: their transparent safety
margin is part of the macOS icon contract. Windows and Linux need full-canvas
artwork, so this script crops that margin before generating their resources.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "apps/tauri/src/renderer/assets/app-icons"
ICON_DIR = ROOT / "apps/tauri/src-tauri/icons"
APP_ICON_DIR = ICON_DIR / "app"
SHARED_APP_ICON_DIR = APP_ICON_DIR / "shared"
WINDOWS_ICON_DIR = APP_ICON_DIR / "windows"
LINUX_ICON_DIR = APP_ICON_DIR / "linux"
TRAY_ICON_DIR = ICON_DIR / "tray"
VARIANTS = ("classic", "material", "clean")
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def resized(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), Image.Resampling.LANCZOS)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, compress_level=9)


def main() -> None:
    SHARED_APP_ICON_DIR.mkdir(parents=True, exist_ok=True)
    WINDOWS_ICON_DIR.mkdir(parents=True, exist_ok=True)
    LINUX_ICON_DIR.mkdir(parents=True, exist_ok=True)
    for platform in ("linux", "windows"):
        (TRAY_ICON_DIR / platform).mkdir(parents=True, exist_ok=True)

    # Remove only generated resources from the previous flat layout. macOS
    # source assets are intentionally migrated separately and are never owned
    # by this generator.
    for path in (
        ICON_DIR / "icon.ico",
        ICON_DIR / "icon.png",
        ICON_DIR / "32x32.png",
        ICON_DIR / "128x128.png",
        ICON_DIR / "128x128@2x.png",
        LINUX_ICON_DIR / "icon.png",
        ICON_DIR / "app-platform" / "windows-classic.ico",
        ICON_DIR / "app-platform" / "windows-clean.ico",
        ICON_DIR / "app-platform" / "windows-material.ico",
        *(ICON_DIR / "app-tray" / f"tray-{platform}-{variant}-32.png"
          for platform in ("linux", "windows") for variant in VARIANTS),
        *(ICON_DIR / "app-tray" / f"tray-windows-{variant}-256.png"
          for variant in VARIANTS),
    ):
        path.unlink(missing_ok=True)
    for directory in (ICON_DIR / "app-platform", ICON_DIR / "app-tray"):
        try:
            directory.rmdir()
        except OSError:
            pass
    legacy_platform_assets = SOURCE_DIR / "platform"
    for variant in VARIANTS:
        for size in (256, 512):
            (legacy_platform_assets / f"{variant}-{size}.png").unlink(missing_ok=True)
    try:
        legacy_platform_assets.rmdir()
    except OSError:
        pass

    cropped: dict[str, Image.Image] = {}
    for variant in VARIANTS:
        source = Image.open(SOURCE_DIR / f"dock-{variant}.png").convert("RGBA")
        bounds = source.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"{variant} source icon is fully transparent")
        artwork = source.crop(bounds)
        if artwork.width != artwork.height:
            raise ValueError(f"{variant} source artwork must be square: {artwork.size}")
        cropped[variant] = artwork

        for size in (256, 512):
            save_png(resized(artwork, size), SHARED_APP_ICON_DIR / f"{variant}-{size}.png")

        for platform in ("linux", "windows"):
            save_png(
                resized(artwork, 32),
                TRAY_ICON_DIR / platform / f"{variant}-32.png",
            )

        artwork.save(
            WINDOWS_ICON_DIR / f"{variant}.ico",
            format="ICO",
            sizes=[(size, size) for size in ICO_SIZES],
        )

    classic = cropped["classic"]
    for size, path in (
        (32, LINUX_ICON_DIR / "32x32.png"),
        (128, LINUX_ICON_DIR / "128x128.png"),
        (256, LINUX_ICON_DIR / "128x128@2x.png"),
    ):
        save_png(resized(classic, size), path)

if __name__ == "__main__":
    main()
