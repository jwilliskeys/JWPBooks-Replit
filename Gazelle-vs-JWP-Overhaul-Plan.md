# Gazelle → JWP Books: Reverse-Engineering Teardown & Fable Overhaul Prompts

*Prepared July 4, 2026. Two parts: (A) what Gazelle actually is and how it works, measured against JWP Books feature-by-feature; and (B) the phased, copy-paste prompts for Fable to overhaul the app. Priorities set with Willis: UI/navigation smoothness, a real self-scheduler wired into johnwillispiano.com, and online invoice payments — plus automated client reminders, which is Gazelle's single biggest advantage.*

---

## Part A — The teardown

### 1. What Gazelle is, in one paragraph

Gazelle is a cloud CRM built specifically for piano technicians, sold as a subscription (from ~$7/mo, priced per *active piano* you manage, with a 30-day free trial and free data import). It runs as a web app plus native iOS and Android apps. Its whole design is a retention loop it calls the "Success Cycle": save the tech's office time → wow the customer → the tech plays more music → the business grows → repeat. Everything in the product exists to keep that loop turning, and the engine that actually turns it is **automated reminders + self-scheduling**. That is the part that "keeps me booked" in every review, and it is the part JWP is currently missing.

### 2. How Gazelle is built (the data model)

The atomic unit is the **piano file**, not the customer. The hierarchy is:

**Customer** (with multiple **contacts** — e.g. a church has an office manager + music director) → owns one or more **Pianos** → each piano carries its full **service history**, **appointments**, **estimates/condition reports**, and **invoices**, all cross-linked.

A Gazelle piano file holds: make, model, serial number, year, type, **status** (Active / Inactive / Temporary Storage / Under Restoration), **tuning interval** and an auto-computed **next-due date**, a **temperature/humidity log**, **photos** (with a "primary" photo and per-photo notes), player-system info, Piano Life Saver (PLS) humidity-system info, and a **reference ID** field. Pianos can be **transferred between customers**, **merged** when duplicated, and managed as **consignment** or **rental** instruments. This linked-record structure is *why navigation feels smooth in Gazelle* — every screen is one click from the related record, and there's fast global search over the whole graph.

### 3. How Gazelle functions (the features that matter)

The help center is organized into these functional pillars (article counts show where the depth is):

- **Scheduling (69 articles) + Calendars (54)** — the heart of the product. A public **self-scheduler**: the client clicks the tech's link, the system uses maps + traffic to suggest times that cluster with the tech's existing appointments (so drive time stays low), offers the *next available* slot, lets clients book up to N months ahead, and can be set to **auto-approve, manual-approve, or auto-schedule**. Calendar has a map/itinerary view that warns you when your day criss-crosses town.
- **Reminders (25)** — the retention engine. Two kinds: **piano-due reminders** (when a piano hits its tuning interval, auto-send email / text / or notify-the-tech-to-call) and **appointment reminders** (auto-send the day before and day of, by email + SMS). Reviews credit this with "no more no-shows" and "10x retention."
- **Estimates & Condition Reports (36)** — build from your service list, attach photos of the piano, send to the client; client reviews and either books or contacts you. Reusable templates (e.g. a standard restring + action rebuild estimate).
- **Invoices (31) + Payment Processing (23)** — create in seconds, send before you leave the living room, client pays online by card (**Stripe**), and the service history updates automatically.
- **Customers (25) + Pianos (24)** — the CRM core described above.
- **Accounting Integrations (25)** — **QuickBooks** sync at tax time.
- **Reminders/marketing extras** — **Mailchimp integration (13)** for email campaigns, **Custom Messages (12)** to fully customize every client-facing template, **Tags (7)** to segment customers and pianos.
- **Team Members (21)** — assign work across multiple techs (not relevant to a solo operator).
- **Call Center (15)** — inbound-call management / call lists.
- **Mobile Apps (4)** — do the field workflow (finish appointment, send invoice/estimate, look up any client's whole history in seconds) from the phone.
- **Settings & Company Profile (29)** + **Gazelle School of Business (16)** — branding, service area, availability, and free business training.

**Support & onboarding** is a real feature too: a setup phone call, free data import by a dedicated team, live chat, and a large help center. It's a big reason non-technical techs adopt it.

---

## Part B — Gazelle vs. JWP Books, feature by feature

The good news up front: **JWP already reverse-engineered most of Gazelle's data model.** The schema (`shared/schema.ts`) already has customers, multi-contact `customer_contacts`, a rich `pianos` table, `service_records` with temp/humidity, a `service_catalog` + `service_groups`, `appointments`, `invoices` with line items, `inspections` (= estimates/condition reports, with checklist + recommended services + photos + convert-to-invoice), `booking_requests` + `scheduler_settings`, and more. The gaps are not in *what data you store* — they're in **automation, the booking experience, payments, and UI polish.**

### What JWP already matches
| Gazelle capability | JWP status |
|---|---|
| Customer CRM w/ multiple contacts | ✅ `customers` + `customer_contacts` |
| Rich piano file (make/model/serial/year/type/photos) | ✅ `pianos` (very complete) |
| Temp/humidity logging | ✅ on `service_records` |
| Service history auto-recorded from appointments | ✅ auto-invoice + service records on completion |
| Service catalog / price list | ✅ `service_catalog` + `service_groups` |
| Estimates & condition reports w/ photos, convert to invoice | ✅ `inspections` (type `estimate`) |
| Invoices with line items | ✅ `invoices` |
| Consignment / rental piano flags | ✅ booleans on `pianos` |
| PLS / player-system tracking | ✅ booleans on `pianos` |
| Self-scheduler (client-facing) | ⚠️ Exists (`/book`) but request-only + buggy — see Phase 2 |
| Service-area radius | ✅ `scheduler_settings` |

### The real gaps (what to build)
| Gazelle capability | JWP gap | Addressed in |
|---|---|---|
| **Automated piano-due + appointment reminders (email + SMS)** | **Missing entirely.** JWP only opens `mailto:` drafts. No SMS anywhere. This is Gazelle's #1 differentiator. | **Phase 4** |
| **Real self-scheduling** (bookable slots, conflict-free, auto/manual approve, confirmation emails) | JWP's `/book` only creates a *pending request*; slots aren't reserved and have a likely timezone bug; not embedded/working on the website | **Phase 2** |
| **Online card payment on invoices (Stripe checkout)** | JWP only shows static payment-handle links (Zelle/Venmo/PayPal/Stripe link) | **Phase 3** |
| **Smooth linked-record navigation + global search** | No command palette / global search; client↔piano↔history↔invoice jumps aren't fluid | **Phase 1** |
| Piano status lifecycle enum + transfer-between-customers + merge-duplicates | JWP uses scattered booleans; no transfer/merge tools | Phase 1 (backlog) |
| Unified tags/segmentation across customers + pianos | `pianos.tags` exists but no cross-record tag UI | Phase 1 (backlog) |
| QuickBooks sync | Not present (but JWP has Plaid + Schedule C, arguably better for a solo tech) | Not planned |
| Mailchimp / bulk marketing | Not present (JWP has Outreach instead) | Not planned |
| Native mobile app | Web-responsive only | Phase 1 makes it a proper installable PWA |

### Where JWP is already *better* than Gazelle — protect these
These are real advantages Gazelle does **not** have. The overhaul must not regress them:
- **SLC Trip Planner** — multi-day trip routing, mileage, drive-time, and a Schedule C trip budget. Gazelle has nothing like it.
- **Deep tax tooling** — Schedule C export, IRS-rate mileage, SE-tax math, quarterly estimates, the Falcetti/BU payroll bucket, deductibles panel.
- **Plaid bank-feed reconciliation** with auto-matching to invoices.
- **Inventory + Action Geometry Calculator** — technician-grade, nothing comparable in Gazelle.
- **Outreach / lead-generation pipeline** with map view and per-lead-type email drafting.
- **You own the data and pay no per-piano SaaS fee.**

---

## Part C — The overhaul roadmap

Four phases, in priority order. Each is a **self-contained prompt for Fable** below. Run them one at a time, in order, and let each finish and be verified before starting the next — that's how you get a Gazelle-beating app without breaking the tax logic or the trip planner along the way.

1. **Phase 1 — UI / navigation overhaul** (your #1 pain: "navigating clients/pianos isn't smooth")
2. **Phase 2 — Real self-scheduler + johnwillispiano.com integration** (currently bugged)
3. **Phase 3 — Online invoice payments (Stripe)**
4. **Phase 4 — Automated client reminders, email + SMS** (Gazelle's retention engine)

---

## MASTER BRIEF — shared context (paste at the top of every phase prompt)

> **App:** JWP Books — a piano-technician business manager for a solo operator (John Willis, Somerville MA). **Stack:** Vite + React + TypeScript (`client/`), Express + Drizzle ORM on Postgres/Neon (`server/`), Tailwind + shadcn/ui, TanStack Query. Hosted on Replit at jwp-books.replit.app.
>
> **Hard constraints — do not violate:**
> - **Never touch the tax math or its inputs without being asked.** Invoices with `incomeSource === "falcetti"` must stay excluded from all SE-tax, income-tax, and sales-tax calculations. Schedule C constants live in `client/src/lib/schedule-c.ts` and are imported by both `finances.tsx` and `slc-schedule.tsx` — keep them in sync.
> - **Do not regress these unique features:** SLC Trip Planner (`slc-schedule.tsx`), Finances/Schedule C, Plaid bank feed, Inventory + Action Geometry Calculator, Outreach.
> - **Schema changes:** if you edit `shared/schema.ts`, the owner must run `npm run db:push` himself on his Mac (it can't run in a sandbox). Clearly flag any migration needed. Prefer additive, nullable columns; never drop or rename existing columns without calling it out.
> - **No emojis in the app UI.**
> - **Keep `data-testid` attributes** on interactive controls; add them to anything new.
> - **Money** is stored/handled as formatted strings (e.g. `"$1,250.50"`); use the existing `parseDollar`/`parseBudgetNum` helpers.
> - `.env` holds secrets and must stay gitignored.
> - **Verify before you finish:** run `npx tsc --noEmit` (this is the canonical "did I break anything" gate) and fix all type errors you introduced.
>
> **Working style:** make the smallest set of changes that fully achieves the goal. Don't refactor unrelated code. At the end, give a plain-English summary (the owner is not a programmer) of what changed, anything he must do himself (like `db:push` or adding an API key), and how to test it.

---

## PHASE 1 PROMPT — UI / navigation overhaul

> **[Paste the MASTER BRIEF above first.]**
>
> **Goal:** Make navigating clients and pianos feel as fast and fluid as Gazelle. Right now moving between a client, their pianos, service history, and invoices is clunky. Fix the *navigation model and speed* — not the data.
>
> **Build these, in order:**
>
> 1. **Global command-palette search (Cmd/Ctrl-K).** A single search box, reachable from anywhere and from a persistent header icon, that searches across customers (name, company, phone, email, address), pianos (make/model/serial), and invoices (number). Results are grouped by type, keyboard-navigable (arrow keys + Enter), and clicking a result jumps straight to that record's detail page. Add a lightweight backend search endpoint if needed; debounce input; make it fast.
>
> 2. **A true customer detail page as a master-detail hub.** One page per customer that shows their info + contacts at top, then tabbed/segmented sections for **Pianos**, **Service History**, **Appointments**, **Estimates**, and **Invoices**, each cross-linked. From a piano you can jump to its history and back without losing your place. Every list row links to its record. This linked-record hub is the core of what makes Gazelle feel smooth — prioritize it.
>
> 3. **Fast, snappy lists.** Add instant client-side filter/sort and, if the customer or piano list is long, virtualize it so scrolling stays smooth. Use TanStack Query caching and **optimistic updates** so edits feel instant. Preserve scroll position and filters when navigating back (don't reset to top).
>
> 4. **Breadcrumbs + reliable back navigation** on every detail page (e.g. Customers › Jane Smith › Steinway M › Service history), so the user always knows where they are and can move up a level in one click.
>
> 5. **Mobile + PWA.** Audit the main pages (dashboard, customers, customer detail, calendar, invoices) at phone width and fix cramped/broken layouts — Willis works from his phone in clients' homes. Add a web-app manifest + service worker so the app is installable to the home screen and loads instantly (this is JWP's answer to Gazelle's native app). Read-only offline caching of recently viewed clients is a plus but optional.
>
> 6. **One consistent visual system.** The bronze/Baskerville theme is already partway there (see the July 3 2026 design notes). Tighten spacing, typography, hover/active states, and empty states across the pages you touch so it feels like one polished product.
>
> **Explicitly out of scope for this phase:** payments, the booking flow, and reminders (those are later phases). Don't change financial logic.
>
> **Acceptance criteria:** Cmd-K jumps to any client/piano/invoice in ≤2 keystrokes-worth of typing; from a customer you can reach any linked piano/history/invoice and back without a full reload; lists stay smooth on a big dataset; the app installs and is usable one-handed on an iPhone; `npx tsc --noEmit` is clean.

---

## PHASE 2 PROMPT — Real self-scheduler + johnwillispiano.com integration

> **[Paste the MASTER BRIEF above first.]**
>
> **Context:** The public scheduler already exists at `client/src/pages/book.tsx` (5-step flow: Location → Piano & Service → Date → Time → Contact) with a backend at `GET /api/booking/available-slots` and `POST /api/booking-requests` in `server/routes.ts`. It currently only creates a *pending request* — slots are never actually reserved, and it's buggy and not working on the website. Fix it into a real, reliable booking system and get it live on johnwillispiano.com.
>
> **Bugs to fix first (verify each):**
> 1. **Timezone / off-by-one date bug.** `available-slots` builds date strings with `d.toISOString().split("T")[0]` on local-midnight `Date` objects. In US timezones this shifts to the previous day (UTC conversion), so the calendar can show the wrong dates and mismatch what the client picks. Replace with timezone-safe local date formatting (format year/month/day from the local Date, don't round-trip through UTC) everywhere in this endpoint, including the Utah/SLC trip loop.
> 2. **Slots aren't conflict-checked.** The endpoint counts appointments per day/week but never removes an *already-booked time* from the offered slots, so two clients can pick the same time. Make slot generation subtract times that already have an appointment (and any pending-but-held request), so only genuinely free times show.
> 3. **Hardcoded availability.** Working hours are hardcoded (4–6pm weekdays, weekend blocks, max 2/week). Move these into `scheduler_settings` so Willis can edit his availability, per-weekday hours, appointment duration/buffer, max-per-week, and how far ahead clients can book — from an admin settings page. Fall back to sensible defaults if unset.
>
> **Then upgrade request → real booking:**
> 4. Add an **approval mode** in `scheduler_settings`: `auto-approve` (booking instantly becomes a confirmed appointment on his calendar and the slot is locked) or `manual-approve` (stays a pending request he confirms in one tap — keep the existing approve flow). Mirror Gazelle's toggle.
> 5. **Confirmation + notifications.** On submit: email the client a confirmation (or "request received" if manual mode) and email/notify Willis of the new booking with a one-tap approve link. On approval, email the client the confirmed date/time. (Use the same email mechanism Phase 4 will build on — a simple transactional email sender via an API key in `.env`; if that's not set up yet, wire the hook and clearly note the key is needed.)
> 6. Keep the smart **"recommended" routing** (dates that cluster with existing appointments in the same area) and the SLC-trip-aware Utah path — those are good; just make them correct after the timezone fix.
>
> **Website integration (this is a priority):**
> 7. Make the scheduler embeddable and get it working on **johnwillispiano.com**. The page already supports `?embed=true` to strip chrome. Deliverables: (a) confirm `/book?embed=true` renders cleanly in an iframe with no auth wall (it's already public — verify the AuthGate skips it), correct CORS/`X-Frame-Options` so it can be framed by johnwillispiano.com, and responsive height; (b) provide the **exact iframe/embed snippet** to paste into the website, plus a fallback plain link/button (`https://jwp-books.replit.app/book`) in case the host (Squarespace/Wix/etc.) blocks iframes; (c) test the full flow end-to-end from an embedded context and fix anything that breaks (address autocomplete, slot loading, submit). Tell Willis in plain English exactly where to paste the snippet on his site.
>
> **Acceptance criteria:** the calendar shows correct local dates; a booked time disappears from the options; availability is editable in settings; a completed booking either auto-creates a locked appointment or a pending request per the mode; client + owner both get emails; and `/book` works embedded on johnwillispiano.com on desktop and mobile. `npx tsc --noEmit` clean. Flag any `db:push` and any needed `.env` keys (email sender, and note `GOOGLE_MAPS_API_KEY` is already used for address autocomplete).

---

## PHASE 3 PROMPT — Online invoice payments (Stripe)

> **[Paste the MASTER BRIEF above first.]**
>
> **Goal:** Let clients pay an invoice online by card, like Gazelle. Today JWP only shows static payment-handle links (Zelle/Venmo/PayPal/Stripe link in `user_settings`). Add real Stripe Checkout so a client can pay a specific invoice and the invoice auto-updates to paid.
>
> **Requirements:**
> 1. **Stripe integration** using Willis's own Stripe account keys in `.env` (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`). If keys are absent, the feature should degrade gracefully to the current static links and not crash.
> 2. **A public, tokenized invoice-pay page** (e.g. `/pay/:invoiceToken`) the client can open without logging in — shows the invoice (line items, total, piano/service, amount due) and a "Pay now" button that opens **Stripe Checkout** for the invoice's outstanding balance. Use an unguessable token per invoice, not the raw sequential id.
> 3. **Webhook** (`POST /api/stripe/webhook`, raw-body verified) that, on successful payment, marks the invoice `paid`, sets `paidAmount`, `paymentMethod = "card"`, and records the Stripe payment reference. Make it idempotent (don't double-apply on webhook retries).
> 4. **From the invoice screen**, add a "Send payment link" / "Copy pay link" action, and surface the pay link in the invoice email. Show payment status (unpaid / paid / partially paid) clearly.
> 5. **Respect the tax rules:** a card payment on a normal client invoice flows through existing income/tax logic unchanged; never let this touch `incomeSource === "falcetti"` invoices (those are payroll and shouldn't be payable online at all — hide the pay option for them).
> 6. Note Stripe's processing fee in the UI so Willis sees net vs. gross, and keep the existing manual "mark as paid" path for cash/check/Zelle.
>
> **Acceptance criteria:** opening a pay link and completing Stripe test-mode checkout flips the invoice to paid via webhook (idempotently); missing keys degrade gracefully; Falcetti invoices are never payable online; `npx tsc --noEmit` clean. List required `.env` keys and any `db:push` (e.g. a `payment_token` / `stripe_payment_intent_id` column on `invoices`) for Willis to run.

---

## PHASE 4 PROMPT — Automated client reminders (email + SMS)

> **[Paste the MASTER BRIEF above first.]**
>
> **Why this matters:** This is the single feature reviewers credit for Gazelle "keeping them booked" and "10x retention." JWP has none of it yet — only manual `mailto:` drafts. Build the automated reminder engine.
>
> **Build two reminder types (mirroring Gazelle):**
> 1. **Piano-due reminders.** When a piano reaches its `tuningInterval` since `lastTuned`, automatically notify the client it's time to tune — with a one-click link to the `/book` scheduler. Channel per client preference: email, SMS, or "notify John to call." Never send twice for the same due cycle; respect a per-contact do-not-contact flag (`customer_contacts.doNotCall` already exists — add an email opt-out too).
> 2. **Appointment reminders.** Automatically send the client a reminder **the day before and the morning of** a confirmed appointment, by email and/or SMS, with date/time/service and a reschedule/contact link.
>
> **Infrastructure:**
> 3. **Email** via a transactional provider (e.g. Resend/SendGrid/Postmark) using an API key in `.env`. **SMS** via Twilio (`.env` keys). Both degrade gracefully if keys are missing (log + skip, never crash).
> 4. **Customizable templates.** Give Willis editable message templates (like Gazelle's "Custom Messages") for each reminder type, with merge fields (client first name, piano make/model, date, time, booking link). Store templates in the DB.
> 5. **A scheduler that actually runs.** These must fire on a daily cadence. Implement as an idempotent endpoint/script (plain `.mjs`, following the pattern of `scripts/cfo-snapshot.mjs` and `scripts/falcetti-paycheck.mjs`, because the sandbox has an esbuild/native-binary mismatch that breaks `.ts` scripts) that the existing scheduled-task system can call each morning. It should compute who's due today, send, and log what it sent so it never double-sends.
> 6. **A reminders dashboard/log** so Willis can see what went out, what's queued, and manually trigger or snooze a reminder. Add a global on/off and quiet-hours setting.
>
> **Guardrails:** never message the same person twice for the same trigger; honor opt-outs; all client-facing copy is plain and professional (no emojis); this must not interact with tax logic.
>
> **Acceptance criteria:** a piano past its interval generates exactly one due-reminder via the client's chosen channel with a working booking link; confirmed appointments generate day-before + day-of reminders; templates are editable; the daily job is idempotent and logged; missing API keys degrade gracefully. `npx tsc --noEmit` clean. List all `.env` keys (email + Twilio) and any `db:push` for Willis.

---

## How to use this with Fable

Run the phases **in order**, one at a time. For each: paste the **Master Brief**, then that phase's prompt. Let Fable finish, then test using the acceptance criteria before moving on. After each phase, do the two owner-only steps if Fable flags them — run `npm run db:push` in your Mac Terminal for any schema change, and add any new API keys to your `.env` (and Replit Secrets) before the feature works live.

If you want, I can also turn any single phase into a more detailed spec (exact files, endpoints, and step-by-step), or draft the johnwillispiano.com embed snippet once Phase 2 is built.
