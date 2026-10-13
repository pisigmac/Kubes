#!/usr/bin/env bash
set -euo pipefail

# Port Allocator Global Installer
# Symlinks port-alloc and port-status into ~/.local/bin

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${SCRIPT_DIR}/bin"
TARGET_DIR="${HOME}/.local/bin"

mkdir -p "${TARGET_DIR}"

chmod +x "${BIN_DIR}/port-alloc"

ln -sf "${BIN_DIR}/port-alloc" "${TARGET_DIR}/port-alloc"
ln -sf "${BIN_DIR}/port-alloc" "${TARGET_DIR}/port-status"

echo "✅ Port Allocator successfully installed to ${TARGET_DIR}!"
echo "   - port-alloc  -> ${TARGET_DIR}/port-alloc"
echo "   - port-status -> ${TARGET_DIR}/port-status"
echo ""
echo "Ensure ~/.local/bin is in your PATH."
