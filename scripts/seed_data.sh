#!/usr/bin/env bash
set -euo pipefail

# Kubes: Seed Demo Data Script (Multi-Tenant Demo Cubes, Schedules & Memories)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🌱 Seeding demo tenants, specialists, schedules, and memories into Kubes..."
node --experimental-strip-types "${ROOT_DIR}/scripts/seed_data.ts"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Multi-tenant demo dataset is live in data/cubes.db!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
