#!/bin/bash
# JWP Books — double-click launcher
# Lives in the project folder; starts the dev server via start.sh.

# Move to the folder this .command file is in (the project root),
# so it works no matter where it's launched from.
cd "$(dirname "$0")" || exit 1

# Free port 3000 if a previous server is still holding it.
lsof -ti:3000 | xargs kill -9 2>/dev/null

# start.sh sources .env and starts the server (and opens the browser).
bash start.sh

# Keep the Terminal window open if the server exits or errors.
echo ""
echo "Server stopped. Press any key to close this window."
read -n 1 -s
