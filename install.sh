#!/usr/bin/env bash
# Installs Meridian, or updates it when a newer release exists. Safe to run again.
set -euo pipefail

REPO="AlexanderDev-src/meridian"
ASSET="Meridian-x86_64.AppImage"
tmp=""

die() {
  echo "meridian: $1" >&2
  exit 1
}

# Everything runs inside main, so a cut-off download through a pipe does nothing.
main() {
  [ "$(uname -sm)" = "Linux x86_64" ] || die "only Linux x86_64 is supported"
  for tool in curl sha256sum install; do
    command -v "$tool" >/dev/null || die "$tool is required"
  done

  local data="${XDG_DATA_HOME:-$HOME/.local/share}"
  local bin="$HOME/.local/bin/meridian"
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
  curl -fsSL -o "$tmp/icon.png" "https://raw.githubusercontent.com/$REPO/$tag/src-tauri/icons/icon.png"

  install -Dm755 "$tmp/$ASSET" "$bin.new"
  mv -f "$bin.new" "$bin"
  install -Dm644 "$tmp/icon.png" "$data/icons/meridian.png"
  mkdir -p "$data/applications" "$data/meridian"
  printf '[Desktop Entry]\nType=Application\nName=Meridian\nComment=Focus sessions as flights\nExec=%s\nIcon=%s\nCategories=Utility;\nTerminal=false\n' \
    "$bin" "$data/icons/meridian.png" > "$data/applications/meridian.desktop"
  echo "$tag" > "$version_file"

  echo "Meridian $tag is installed. Open it from your launcher or run: $bin"
}

main "$@"
