---
name: SLC trip booking
description: The commitment rule for appointments in the SLC trip planner.
---

SLC trip appointments start as uncommitted planning entries. The user books each appointment individually; booking one stop must not commit the other stops in the trip.

**Why:** The user explicitly corrected the trip workflow after a trip-wide booking action did not match their intent.

**How to apply:** Keep booking controls attached to individual stops in the Trip Planner and dashboard trip list. Do not add an action that books every uncommitted stop in a trip.
