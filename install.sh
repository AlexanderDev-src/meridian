#!/usr/bin/env bash
# Installs Meridian, or updates it when a newer release exists. Safe to run again.
set -euo pipefail

REPO="AlexanderDev-src/meridian"
ASSET="Meridian-linux-x86_64.tar.gz"
tmp=""

die() {
  echo "meridian: $1" >&2
  exit 1
}

# Everything runs inside main, so a cut-off download through a pipe does nothing.
main() {
  [ "$(uname -sm)" = "Linux x86_64" ] || die "only Linux x86_64 is supported"
  for tool in curl sha256sum install tar ldconfig; do
    command -v "$tool" >/dev/null || die "$tool is required"
  done
  ldconfig -p | grep -q 'libwebkit2gtk-4\.1' ||
    die "WebKitGTK 4.1 is required (Arch: webkit2gtk-4.1, Ubuntu/Debian: libwebkit2gtk-4.1-0, Fedora: webkit2gtk4.1)"

  local prefix="$HOME/.local"
  local data="${XDG_DATA_HOME:-$prefix/share}"
  local bin="$prefix/bin/meridian"
  local version_file="$data/meridian/version"

  local latest tag
  latest=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")
  tag=${latest##*/}
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "could not find the latest release"

  if [ -x "$bin" ] && [ "$(cat "$version_file" 2>/dev/null)" = "$tag" ]; then
    echo "Meridian $tag is already up to date."
    return
  fi

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  local base="https://github.com/$REPO/releases/download/$tag"
  echo "Downloading Meridian $tag..."
  curl -fL --progress-bar -o "$tmp/$ASSET" "$base/$ASSET"
  curl -fsSL -o "$tmp/$ASSET.sha256" "$base/$ASSET.sha256"
  (cd "$tmp" && sha256sum -c --quiet "$ASSET.sha256") || die "checksum failed, nothing was changed"
  mkdir "$tmp/app"
  tar -xzf "$tmp/$ASSET" -C "$tmp/app" --no-same-owner bin/meridian lib/Meridian/airports.sqlite share/icons/meridian.png

  install -Dm644 "$tmp/app/lib/Meridian/airports.sqlite" "$prefix/lib/Meridian/airports.sqlite"
  install -Dm755 "$tmp/app/bin/meridian" "$bin.new"
  mv -f "$bin.new" "$bin"
  install -Dm644 "$tmp/app/share/icons/meridian.png" "$data/icons/meridian.png"
  mkdir -p "$data/applications" "$data/meridian"
  printf '[Desktop Entry]\nType=Application\nName=Meridian\nComment=Focus sessions as flights\nExec=%s\nIcon=%s\nCategories=Utility;\nTerminal=false\n' \
    "$bin" "$data/icons/meridian.png" > "$data/applications/meridian.desktop"
  echo "$tag" > "$version_file"

  echo "Meridian $tag is installed. Open it from your launcher or run: $bin"
}

main "$@"
