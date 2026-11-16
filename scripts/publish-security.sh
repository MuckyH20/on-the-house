#!/usr/bin/env bash
# Publish the program's security info to Solana's Program Metadata, which is where Solana Explorer reads it.
# Must be signed by the program's upgrade authority (the operator wallet). Devnet by default.
#   pnpm security:publish
set -euo pipefail
cd "$(dirname "$0")/.."
PROGRAM_ID="${PROGRAM_ID:-4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2}"
exec npx -y @solana-program/program-metadata@0.11.0 write security "$PROGRAM_ID" programs/on_the_house/security.json \
  --keypair "${OPERATOR_KEYPAIR_PATH:-.keys/operator.json}" \
  --rpc "${SECURITY_RPC:-https://api.devnet.solana.com}"
