#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# JWP Books — one-click deploy
# Double-click this file in Finder. It will:
#   1. Type-check the code (aborts if anything is broken)
#   2. Show you what changed
#   3. Ask for a one-line description
#   4. Commit + push to GitHub
# Then the ONLY manual step left is hitting "Republish" in Replit.
# ─────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

echo "════════════════════════════════════════"
echo "  JWP Books — Deploy"
echo "════════════════════════════════════════"
echo

# 1. Type check ────────────────────────────────────────────────────────
echo "Step 1/4: Checking the code for errors (takes ~30 seconds)..."
if ! npx tsc --noEmit; then
  echo
  echo "❌ STOPPING: The code has errors (listed above)."
  echo "   Nothing was committed or pushed. Ask Claude to fix these first."
  echo
  read -p "Press Enter to close..."
  exit 1
fi
echo "✅ Code checks out."
echo

# 2. Show what changed ─────────────────────────────────────────────────
if [ -z "$(git status --porcelain)" ]; then
  echo "Step 2/4: No new changes to commit."
else
  echo "Step 2/4: Here's what changed since the last deploy:"
  echo "────────────────────────────────────────"
  git status --short
  echo "────────────────────────────────────────"
  echo

  # 3. Commit ──────────────────────────────────────────────────────────
  DEFAULT_MSG="Updates from Cowork session $(date '+%b %d, %Y')"
  echo "Step 3/4: One-line description of this update"
  read -p "  (or just press Enter for \"$DEFAULT_MSG\"): " MSG
  MSG="${MSG:-$DEFAULT_MSG}"
  git add -A
  git commit -m "$MSG"
  echo "✅ Committed."
fi
echo

# 4. Push ──────────────────────────────────────────────────────────────
echo "Step 4/4: Uploading to GitHub..."
if git push; then
  echo
  echo "════════════════════════════════════════"
  echo "  ✅ Pushed to GitHub!"
  echo
  echo "  LAST STEP (manual): open Replit and hit"
  echo "  'Republish' on the deployment so the"
  echo "  live app picks up the new code."
  echo "════════════════════════════════════════"
else
  echo
  echo "❌ The upload to GitHub failed (details above)."
  echo "   Usually this means the saved GitHub login/token expired."
  echo "   Copy the error above and ask Claude what to do."
fi
echo
read -p "Press Enter to close..."
