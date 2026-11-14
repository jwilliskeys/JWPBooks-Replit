---
name: Pianoscope snapshot imports
description: How repeat uploads of an updated Pianoscope tuning snapshot should affect service history.
---

Pianoscope files are refreshed and uploaded repeatedly for a piano. When a file matches an existing service date, update that date's Pianoscope snapshot instead of rejecting the import as a duplicate.

**Why:** The user uses these files to capture the piano's pitch before tuning and reuses the same file for updated snapshots.

**How to apply:** In both single-piano and bulk imports, match by piano and measurement date; replace only the Pianoscope data on a matching service record, and create a new service record for a new date.
