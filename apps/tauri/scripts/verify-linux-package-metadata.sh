#!/usr/bin/env bash
set -euo pipefail

bundle_root="${1:?usage: verify-linux-package-metadata.sh BUNDLE_ROOT DEB_ARCH RPM_ARCH [TEMP_ROOT]}"
expected_deb_arch="${2:?expected DEB architecture is required}"
expected_rpm_arch="${3:?expected RPM architecture is required}"
temp_root="${4:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

deb_file="$(find "$bundle_root/deb" -maxdepth 1 -type f -name '*.deb' -print -quit)"
rpm_file="$(find "$bundle_root/rpm" -maxdepth 1 -type f -name '*.rpm' -print -quit)"
appimage_file="$(find "$bundle_root/appimage" -maxdepth 1 -type f -name '*.AppImage' -print -quit)"

for artifact in "$deb_file" "$rpm_file" "$appimage_file"; do
  if [[ -z "$artifact" ]]; then
    echo "A required Linux package is missing from $bundle_root." >&2
    exit 1
  fi
done

actual_deb_arch="$(dpkg-deb -f "$deb_file" Architecture)"
if [[ "$actual_deb_arch" != "$expected_deb_arch" ]]; then
  echo "Unexpected DEB architecture: expected $expected_deb_arch, got $actual_deb_arch" >&2
  exit 1
fi
deb_requires="$(dpkg-deb -f "$deb_file" Depends)"
deb_files="$(dpkg-deb --contents "$deb_file")"
if [[ "$deb_requires" != *xdg-utils* ]]; then
  echo "DEB package is missing the external URL launcher dependency: $deb_requires" >&2
  exit 1
fi

if [[ "$expected_deb_arch" == amd64 ]] && awk \
  -v package_path='usr/lib/transterm/runtime/transterm' \
  '$NF == package_path || $NF == ("./" package_path) { found = 1 } END { exit !found }' \
  <<< "$deb_files"; then
  if [[ "$deb_requires" != *"libc6 (>= 2.31)"* ]]; then
    echo "Universal amd64 DEB must support Debian 11's glibc baseline: $deb_requires" >&2
    exit 1
  fi
  for required_path in \
    usr/lib/transterm/transterm \
    usr/lib/transterm/runtime/transterm \
    usr/lib/transterm/runtime/ld-linux-x86-64.so.2 \
    usr/share/doc/file-term/private-runtime/runtime-packages.tsv; do
    if ! awk -v package_path="$required_path" \
      '$NF == package_path || $NF == ("./" package_path) { found = 1 } END { exit !found }' \
      <<< "$deb_files"; then
      echo "Universal amd64 DEB is missing runtime content: $required_path" >&2
      exit 1
    fi
  done
elif [[ "$deb_requires" != *libssl3* ]]; then
  echo "DEB package is missing the OpenSSL runtime dependency: $deb_requires" >&2
  exit 1
fi

actual_rpm_arch="$(rpm -qp --queryformat '%{ARCH}' "$rpm_file")"
if [[ "$actual_rpm_arch" != "$expected_rpm_arch" ]]; then
  echo "Unexpected RPM architecture: expected $expected_rpm_arch, got $actual_rpm_arch" >&2
  exit 1
fi

rpm_files="$(rpm -qpl "$rpm_file")"
package_paths=(
  usr/share/applications/transterm.desktop
  usr/share/applications/com.transterm.desktop.desktop
  usr/share/metainfo/com.transterm.desktop.metainfo.xml
  usr/share/pixmaps/com.transterm.desktop.png
  usr/share/pixmaps/transterm.png
  usr/share/licenses/file-term/LICENSE
)

for package_path in "${package_paths[@]}"; do
  if ! awk -v package_path="$package_path" \
    '$NF == package_path || $NF == ("./" package_path) { found = 1 } END { exit !found }' \
    <<< "$deb_files"; then
    echo "DEB package is missing metadata file: $package_path" >&2
    echo "DEB package contents:" >&2
    printf '%s\n' "$deb_files" >&2
    exit 1
  fi
  if ! grep -Fq "/$package_path" <<< "$rpm_files"; then
    echo "RPM package is missing metadata file: $package_path" >&2
    echo "RPM package contents:" >&2
    printf '%s\n' "$rpm_files" >&2
    exit 1
  fi
done

rpm_requires="$(rpm -qpR "$rpm_file")"
for dependency in \
  'xdg-utils' \
  'libwebkit2gtk-4.1.so.0()(64bit)' \
  'libgtk-3.so.0()(64bit)' \
  'libayatana-appindicator3.so.1()(64bit)' \
  'libssl.so.3()(64bit)' \
  'libcrypto.so.3()(64bit)'; do
  if ! grep -Fxq "$dependency" <<< "$rpm_requires"; then
    echo "RPM package is missing runtime dependency: $dependency" >&2
    echo "RPM package requirements:" >&2
    printf '%s\n' "$rpm_requires" >&2
    exit 1
  fi
done

appimage_verify_root="$(mktemp -d "$temp_root/transterm-appimage-check.XXXXXX")"
trap 'rm -rf "$appimage_verify_root"' EXIT
dpkg-deb --extract "$deb_file" "$appimage_verify_root/deb"
mkdir -p "$appimage_verify_root/rpm"
rpm_file="$(cd "$(dirname "$rpm_file")" && pwd)/$(basename "$rpm_file")"
rpm_cpio="$appimage_verify_root/package.rpm.cpio"
rpm2cpio_status=0
rpm2cpio "$rpm_file" > "$rpm_cpio" || rpm2cpio_status=$?
if [[ ! -s "$rpm_cpio" ]]; then
  echo "RPM payload extraction produced no CPIO data (rpm2cpio exit $rpm2cpio_status)." >&2
  exit 1
fi
if ! cpio -it --quiet < "$rpm_cpio" >/dev/null; then
  echo "RPM payload is not a complete, readable CPIO archive (rpm2cpio exit $rpm2cpio_status)." >&2
  exit 1
fi
if [[ "$rpm2cpio_status" -ne 0 ]]; then
  echo "rpm2cpio returned $rpm2cpio_status after producing a complete CPIO archive; validating extracted package files."
fi
(
  cd "$appimage_verify_root/rpm"
  cpio -id --quiet < "$rpm_cpio"
)
python3 "$script_dir/verify-linux-icon-files.py" "$appimage_verify_root/deb"
python3 "$script_dir/verify-linux-icon-files.py" "$appimage_verify_root/rpm"
appimage_file="$(cd "$(dirname "$appimage_file")" && pwd)/$(basename "$appimage_file")"
(
  cd "$appimage_verify_root"
  "$appimage_file" --appimage-extract >/dev/null
)

for package_path in "${package_paths[@]}"; do
  if [[ ! -f "$appimage_verify_root/squashfs-root/$package_path" ]]; then
    echo "AppImage is missing metadata file: $package_path" >&2
    find "$appimage_verify_root/squashfs-root" -maxdepth 6 -type f -print >&2
    exit 1
  fi
done

appdir="$appimage_verify_root/squashfs-root"
python3 "$script_dir/verify-linux-icon-files.py" "$appdir" --appimage
desktop-file-validate "$appdir/transterm.desktop" "$appdir/usr/share/applications/com.transterm.desktop.desktop"
# appdir-lint only discovers *.appdata.xml; explicitly validate our canonical *.metainfo.xml too.
appstreamcli validate-tree --no-net "$appdir"
APPIMAGE_EXTRACT_AND_RUN=1 "$appimage_file" --help > "$appimage_verify_root/appimage-help.txt"
grep -q 'Usage:' "$appimage_verify_root/appimage-help.txt"

echo "Verified DEB ($actual_deb_arch), RPM ($actual_rpm_arch), and AppImage metadata."
