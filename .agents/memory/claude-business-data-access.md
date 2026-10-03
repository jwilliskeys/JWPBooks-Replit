---
name: Claude business-data access
description: User-approved access boundaries for the JWP Books Claude MCP connection.
---

Claude may read, create, and edit approved JWP Books records, but must not delete records. Claude must authenticate through OAuth; the JWP Books owner passcode is never a Claude credential.

**Why:** The user selected read/write access without deletes and required OAuth rather than reusing the owner passcode.

**How to apply:** Keep Claude's tools within the approved business-record scope, provide no delete operation, and use the owner passcode only inside JWP Books' browser sign-in and consent flow.