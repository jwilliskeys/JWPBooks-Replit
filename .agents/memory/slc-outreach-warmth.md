---
name: SLC outreach warmth
description: The source and matching rules for customer warmth in SLC tuning suggestions.
---

Use existing outreach lead status to estimate a customer's outreach warmth. Match a customer to a lead only by exact normalized email or a phone number with at least seven digits; do not use fuzzy name matching. Customers without a reliable contact match have neutral warmth.

**Why:** The user chose existing outreach status as the source for SLC outreach warmth, and ambiguous name matches could rank the wrong customer's status.

**How to apply:** When changing outreach suggestion ranking or contact matching, preserve exact contact matching and neutral treatment for unmatched customers.
