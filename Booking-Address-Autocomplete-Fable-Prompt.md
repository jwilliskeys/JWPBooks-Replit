# Booking Address Autocomplete — Diagnosis & Fable Prompt

*Prepared July 6, 2026. Goal: make the `/book` "Find your location" step searchable + clickable like Gazelle's, and stop it looking boring/broken.*

---

## What's actually wrong (the diagnosis)

Good news first: **the address autocomplete is already fully built.** `client/src/pages/book.tsx` has the "Find your location" step with a "By Street Address / On a Map" tab layout, a debounced type-ahead input, and a clickable dropdown — an almost exact copy of the Gazelle screenshot you sent. The backend already has `GET /api/places/autocomplete` and `GET /api/places/details` in `server/routes.ts`, and `GOOGLE_MAPS_API_KEY` is set in `.env`.

So why does it look boring and do nothing when you type? **Two real reasons:**

1. **The backend calls a Google API that Google shut off for new keys.** Both endpoints call the *legacy* Places web service (`maps.googleapis.com/maps/api/place/autocomplete/json` and `.../place/details/json`). **As of March 1, 2025, Google does not enable the legacy Places API for any project/key created after that date.** Your key is new, so Google answers those calls with `REQUEST_DENIED` — the code then silently returns an empty list, which is exactly why the dropdown never appears. This is the "incorrect" half of the problem, and it is a Google-side deprecation, not a bug in your code.

2. **The dropdown is plain.** Even once results flow, the current dropdown is a flat gray list. Gazelle's is nicer: it **bolds the part you've typed**, shows a subtle secondary line, has an inline "ghost" completion, and is keyboard-navigable (arrow keys + Enter). That's the "boring" half.

The fix is therefore two things: **(A)** migrate the two backend endpoints from the legacy Places API to **Places API (New)**, and **(B)** polish the dropdown to match Gazelle. Both are in the Fable prompt below.

---

## Your part (5 minutes, do this first — code can't do it for you)

In the **Google Cloud Console** for the project that owns your `GOOGLE_MAPS_API_KEY`:

1. **APIs & Services → Library →** search **"Places API (New)"** → **Enable**. (It's a separate product from the old "Places API".)
2. **Billing** must be enabled on the project (Google's free monthly credit covers your volume, but a billing account has to exist).
3. **APIs & Services → Credentials → your key → API restrictions:** make sure the key is allowed to call **Places API (New)** (either "Don't restrict" or explicitly add it to the allow-list).

You don't need a new key — the same one works once the new API is enabled. Tell Fable the key is already in `.env` as `GOOGLE_MAPS_API_KEY`.

---

## The Fable prompt (copy everything in the box)

> **App:** JWP Books — a piano-technician business manager for a solo operator (John Willis, Somerville MA). **Stack:** Vite + React + TypeScript (`client/`), Express + Drizzle ORM on Postgres/Neon (`server/`), Tailwind + shadcn/ui, TanStack Query. Hosted on Replit.
>
> **Hard constraints — do not violate:**
> - Make the **smallest** set of changes that fully achieves the goal. Do **not** refactor unrelated code, and do **not** touch the tax math, Trip Planner, Finances, Plaid, Inventory, or Outreach.
> - No emojis in the UI.
> - Keep/add `data-testid` on interactive controls.
> - `.env` holds secrets and stays gitignored. The Google key already exists there as `GOOGLE_MAPS_API_KEY` — reuse it, don't add a new one.
> - Verify with `npx tsc --noEmit` before finishing and fix any type errors you introduce.
> - End with a plain-English summary (the owner is not a programmer) of what changed and how to test it.
>
> **The problem:** On the public booking page (`client/src/pages/book.tsx`, Step 1 "Find your location"), the address search box does nothing when you type — no suggestions appear. Root cause: the backend endpoints `GET /api/places/autocomplete` and `GET /api/places/details` in `server/routes.ts` call Google's **legacy** Places web service (`maps.googleapis.com/maps/api/place/autocomplete/json` and `/place/details/json`). Google no longer enables the legacy Places API for API keys created after March 1, 2025, so those calls return `REQUEST_DENIED` and the code returns an empty list. The owner has now enabled **Places API (New)** and billing on the same key.
>
> **Task A — Migrate both endpoints to Places API (New). Keep the same route paths, query params, and JSON response shapes the frontend already expects, so `book.tsx` needs no change for this part.**
>
> 1. **`GET /api/places/autocomplete?input=<text>`** → call `POST https://places.googleapis.com/v1/places:autocomplete` with header `X-Goog-Api-Key: <GOOGLE_MAPS_API_KEY>` and JSON body `{ "input": <text>, "includedRegionCodes": ["us"], "includedPrimaryTypes": ["street_address","premise","subpremise"] }`. The response has `suggestions[].placePrediction` with `placeId` and `text.text` (and `structuredFormat.mainText.text` / `secondaryText.text`). **Map it back to the existing shape** the frontend reads: `{ predictions: [{ place_id, description, mainText, secondaryText }] }` (`place_id` = `placeId`, `description` = `text.text`; also pass through `mainText`/`secondaryText` from `structuredFormat` for the UI in Task B). Preserve the current guardrails: return `{ predictions: [] }` when input < 3 chars, when the key is missing, or on any error — never throw to the client. Log Google's `error.status`/message server-side so failures are diagnosable.
> 2. **`GET /api/places/details?place_id=<id>`** → call `GET https://places.googleapis.com/v1/places/<id>` with headers `X-Goog-Api-Key: <key>` and `X-Goog-FieldMask: addressComponents,formattedAddress,location`. Return the **same** JSON the current endpoint returns: `{ street, city, state, zipCode, formattedAddress, lat, lng }`. Note the New API shapes differ — components are `addressComponents[]` with `types[]` + `longText`/`shortText` (not `long_name`/`short_name`), and coordinates are `location.latitude` / `location.longitude` (not `geometry.location.lat/lng`). Map accordingly. `street` = street_number + route, `city` = locality || sublocality || neighborhood, `state` = administrative_area_level_1 (short), `zipCode` = postal_code.
> 3. **Session tokens (billing hygiene):** generate one autocomplete session token per typing session and pass it on the autocomplete calls and the matching details call (`sessionToken` in the body / query), so Google bills the cheaper session rate. If simplest, mint the token server-side per input-series; a per-request token is acceptable if session plumbing is too invasive — don't over-engineer.
>
> **Task B — Make the dropdown feel like Gazelle (see reference: the tech books via `gazelleapp.io/scheduling`). Edit the Step 1 dropdown in `book.tsx`:**
>
> 4. In each suggestion row, **bold the portion of the text the user has typed** and show the rest normally; if `mainText`/`secondaryText` are present, render `mainText` as the primary (bold-matched) line and `secondaryText` as a smaller muted line beneath it. Keep the leading map-pin icon.
> 5. Add **keyboard navigation**: Down/Up arrows move a highlighted row, Enter selects it, Escape closes the list. Highlighted row gets a clear hover/active background. Mouse hover and keyboard highlight should stay in sync.
> 6. Match the app's existing look: the booking page uses a warm bronze primary and Libre Baskerville headings elsewhere in the app — use the existing Tailwind tokens/classes already in `book.tsx` rather than inventing new colors. Rounded corners, soft shadow, comfortable row height/tap targets for mobile. Show a small inline spinner while predictions or details are loading, and a quiet "No matches — enter it manually or use the On a Map tab" empty state when a 3+ char query returns nothing.
> 7. Do not change the overall 5-step flow, the "On a Map" tab, the map verification card, out-of-area handling, or the `available-slots` gating on `addressLat`/`addressLng`. Only improve the address-search box and its dropdown.
>
> **Acceptance:** typing 3+ characters shows a live, clickable suggestion list with the typed text bolded; clicking or pressing Enter fills the address and sets lat/lng (map card appears, "Next" enables); arrow keys + Escape work; mobile taps work; both endpoints hit Places API (New) and no longer return `REQUEST_DENIED`; `npx tsc --noEmit` is clean. Test it embedded (`/book?embed=true`) too, since that's how it runs on johnwillispiano.com.

---

## Notes for you

- **This is deployment-independent** — the autocomplete failing has nothing to do with the Replit deployment still being private (that's a separate open item: making `/book` publicly reachable so clients can actually get to it). But you won't be able to fully test the new autocomplete on the live site until the deployment is public *and* the new code is pushed. You can test it locally on `localhost:3000` immediately after Fable runs.
- **Cost:** Places API (New) autocomplete + details with session tokens runs a few dollars per thousand address lookups, and Google's recurring free monthly credit almost certainly covers a solo tech's booking volume entirely. Enabling billing does not mean you'll be charged for normal use.
- This fix slots into **Phase 2** of your existing `Gazelle-vs-JWP-Overhaul-Plan.md`; most of that phase (timezone fix, conflict-checked slots, editable availability, approval modes, emails, embedding) already shipped July 6. The address search was the one piece still broken.

## Sources

- [Autocomplete (New) — Places API](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)
- [Method: places.autocomplete reference](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/autocomplete)
- [Migrate to Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-autocomplete)
- ["As of March 1st, 2025, legacy Autocomplete is not available to new customers" (issue thread)](https://github.com/visgl/react-google-maps/issues/736)
