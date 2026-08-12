#!/bin/bash
# Commit everything and push to GitHub, which makes Replit redeploy.
# Run it from Terminal:   cd ~/Documents/JWP\ Books  &&  bash push.sh
set -e
cd "$(dirname "$0")"

echo "==> What's about to be committed:"
git add -A
git status --short
echo

COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
if [ "$COUNT" = "0" ]; then
  echo "Nothing to commit — everything is already saved."
else
  git commit -m "New fallboard logo + calendar sync, appointment editor, piano transfer, error boundary

- Logo redesigned: procedural wood texture, Century Schoolbook gold decal,
  simplified favicon render, all app icons regenerated
- Gazelle/Falcetti calendar import + iPhone .ics export feed
- Shared appointment editor across all 5 appointment dialogs
- Reassign piano to a different client + merge duplicate pianos
- Client display name = organization when set
- App-wide error boundary; fixed white-screen crash on address edit"
  echo "==> Committed."
fi

echo "==> Pushing to GitHub..."
git push origin main
echo
echo "==> Done. Replit will pick this up and redeploy in a minute or two."
