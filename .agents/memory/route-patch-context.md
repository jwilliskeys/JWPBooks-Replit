---
name: Route patch context
description: Avoid patching the wrong Express endpoint when neighboring handlers share similar validation code.
---

When editing route-specific logic, anchor patches to the route declaration before matching a generic inner block. Several Express handlers share nearly identical schema and customer-validation snippets, so unscoped context can land in a neighboring endpoint.

**Why:** A repeated validation snippet caused a scheduling guard to be inserted into the regular appointment handler instead of the trip-appointment handler.

**How to apply:** Include the exact route declaration in patch context whenever an edit follows a common validation block.
