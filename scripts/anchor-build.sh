#!/usr/bin/env bash
# Build the on_the_house program and regenerate its IDL + TS types in packages/shared/src/idl/.
#
# With rustup installed this is just `anchor build`. Without rustup (e.g. Arch's packaged Rust),
# cargo-build-sbf can't select the Solana toolchain itself, so we:
#   1. compile for SBF with the platform-tools rustc via RUSTC + --no-rustup-override
#   2. build the IDL with the host cargo (`anchor idl build`)
set -euo pipefail
cd "$(dirname "$0")/.."

TOOLS_VERSION="${PLATFORM_TOOLS_VERSION:-v1.57}" # anchor-cli 1.2.2's default
IDL_DIR=packages/shared/src/idl
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
export NO_DNA=1 # no interactive prompts

if command -v rustup >/dev/null 2>&1; then
  exec anchor build
fi

ANCHOR="${ANCHOR_BIN:-$HOME/.avm/bin/anchor-1.2.2}"
[ -x "$ANCHOR" ] || { echo "anchor-cli 1.2.2 not found at $ANCHOR (run: avm install 1.2.2)" >&2; exit 1; }

SBF_RUSTC="$HOME/.cache/solana/$TOOLS_VERSION/platform-tools/rust/bin/rustc"
if [ ! -x "$SBF_RUSTC" ]; then
  cargo build-sbf --tools-version "$TOOLS_VERSION" --install-only --no-rustup-override
fi

echo "==> SBF build (platform-tools $TOOLS_VERSION)"
RUSTC="$SBF_RUSTC" "$ANCHOR" build --no-idl --tools-version "$TOOLS_VERSION" -- --no-rustup-override

echo "==> IDL"
"$ANCHOR" idl build -p on_the_house -o "$IDL_DIR/on_the_house.json" -t "$IDL_DIR/on_the_house.ts"
ls -l target/deploy/on_the_house.so "$IDL_DIR"/on_the_house.*
