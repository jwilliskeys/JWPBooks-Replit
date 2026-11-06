---
name: Tuning completion consistency
description: Keep piano last-tuned dates and service history aligned across every appointment and service-record workflow.
---

When an appointment or service record represents a tuning, every completion, edit, and delete path must keep the piano's service history and last-tuned date synchronized. Use the appointment/service date, and never let an older tuning overwrite a newer one.

**Why:** A quick appointment status change bypassed the full completion flow, leaving a completed tuning with a stale or empty piano last-tuned date.

**How to apply:** Before adding or changing any completion action, confirm it writes or reconciles a piano-linked tuning record and recalculates the latest tuning date.
