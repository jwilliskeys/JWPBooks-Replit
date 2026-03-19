# PianoTech Customer Manager

## Overview

PianoTech is a customer relationship management (CRM) application designed for piano technicians/tuners. It allows managing customer records, tracking service history, and syncing data from Google Sheets. The app features a dashboard with customer statistics, a customer list with search/filter, individual customer detail pages with service records, and a Google Sheets sync mechanism for importing/updating customer data.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Pages
- `/` — Dashboard with stats (Total Clients, Total Pianos), Service Areas (hierarchical: SLC with 3 sub-areas + Boston), and Appointments & Overdue panel
- `/customers` — Unified client list (merged call center) with card + list views (list default), Call Center window showing top 3 starred clients (name, phone, piano) with shuffle/refresh button, star/favorite toggle per client, service area grouped filter (Davis County, SLC, South Jordan, Boston), quick filter (All Clients, Grand Piano, Upright Piano, Not contacted 6+ months, SLC only, Boston only), sorting (Last Name, Priority, Last Tuned, Last Contacted, Next Appointment, Location, Piano Type) with asc/desc toggle, "Contacted" and "Appt" action buttons per client, search by name/phone/city/piano/email/company. Priority sort boosts starred clients.
- `/customers/new` — Create new client form
- `/customers/:id` — Client detail with multiple piano profiles, per-piano service records, last contacted tracking, and star/favorite toggle
- `/appointments` — Appointment list with search, sort, and status management
- `/calendar` — Monthly calendar grid showing appointments and personal notes; completed appointments faded; click dates to add notes
- `/slc-schedule` — Trip planner for SLC visits; horizontal single-row column layout (all days side by side, scrolls horizontally if needed), each day = 220px wide column, auto-detected service area per day, smart client suggestions (nearby cities), overlapping appointments allowed with orange "Overlapping" badge warning; deletable/recreatable trips
- `/sync` — Google Sheets sync interface

### Backend
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript, executed via `tsx`
- **API Pattern**: RESTful JSON API under `/api/` prefix
- **Key Endpoints**:
  - `GET/POST /api/customers` — List and create clients
  - `GET/PATCH/DELETE /api/customers/:id` — Individual client CRUD
  - `GET/POST /api/customers/:id/pianos` — Piano profiles per client
  - `PATCH/DELETE /api/pianos/:id` — Individual piano CRUD
  - `GET/POST /api/pianos/:id/services` — Service records per piano
  - `POST/DELETE /api/pianos/:id/photos` — Photo upload/removal per piano
  - `GET/POST /api/customers/:id/services` — Legacy service records per client
  - `GET /api/pianos` — List all pianos
  - `GET/POST/PATCH/DELETE /api/appointments` — Appointment CRUD
  - `GET /api/customers/:id/appointments` — Appointments per client
  - `GET/POST /api/calendar-notes`, `PATCH/DELETE /api/calendar-notes/:id` — Personal calendar notes
  - `GET/POST /api/trips`, `GET/PATCH/DELETE /api/trips/:id` — Trip CRUD
  - `GET/POST /api/trips/:id/appointments`, `PATCH/DELETE /api/trip-appointments/:id` — Trip appointment CRUD
  - `POST /api/sync` — Sync data from Google Sheets

### Data Storage
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with `drizzle-zod` for schema validation
- **Schema location**: `shared/schema.ts` (shared between client and server)
- **Tables**:
  - `customers` — id, firstName, lastName, companyName, email, phone, address, city, state, zipCode, pianoType, lastTuned, personalNotes, lastContacted, isStarred, createdAt
  - `pianos` — id, customerId, make, model, pianoType, year, notes, photos (text[]), lastTuned, isActive, createdAt
  - `service_records` — id, customerId, pianoId, serviceDate, serviceType, notes, cost, createdAt
  - `appointments` — id, customerId, pianoId, date, time, servicesRequested, priceEstimate, notes, isTuning, status, createdAt
  - `calendar_notes` — id, date, title, notes, createdAt
  - `trips` — id, name, startDate, endDate, notes, createdAt
  - `trip_appointments` — id, tripId, customerId, pianoId, date, time, duration, servicesRequested, priceEstimate, notes, status, serviceArea, createdAt
  - `users` — id (varchar UUID), email, firstName, lastName, profileImageUrl, createdAt, updatedAt (Replit Auth)
  - `sessions` — sid, sess (jsonb), expire (Replit Auth session store)
- **Migrations**: Generated via `drizzle-kit` into `./migrations` directory
- **Schema push**: Use `npm run db:push` to push schema changes directly

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface and a `DatabaseStorage` implementation
- This abstraction makes it straightforward to swap storage backends if needed

### Build System
- **Development**: `tsx server/index.ts` runs the dev server with Vite middleware for HMR
- **Production Build**: Custom `script/build.ts` uses Vite for client build and esbuild for server bundling
- Server dependencies are selectively bundled (via allowlist) to optimize cold start times
- Output goes to `dist/` (server) and `dist/public/` (client static files)

### Dev vs Production Serving
- In development, Vite middleware serves the client with HMR (`server/vite.ts`)
- In production, pre-built static files are served from `dist/public/` (`server/static.ts`)

## External Dependencies

### PostgreSQL Database
- Required. Connection via `DATABASE_URL` environment variable
- Used with `pg` (node-postgres) Pool and Drizzle ORM

### Google Sheets API
- Integration via `googleapis` npm package in `server/googleSheets.ts`
- Uses Replit Connectors for OAuth token management (accesses tokens via `REPLIT_CONNECTORS_HOSTNAME`)
- Hardcoded spreadsheet ID: `1_jLnnmtX2iXXxbsNMxZb-Ug-QrD5GCLnrayz2T7K4tg`
- Used to sync/import customer data from a Google Sheet into the database

### Authentication
- **Replit Auth** via OpenID Connect (`openid-client` + Passport.js)
- Auth module at `server/replit_integrations/auth/` (setupAuth, isAuthenticated middleware, auth routes)
- Session storage in PostgreSQL `sessions` table via `connect-pg-simple`
- User records in `users` table (id, email, firstName, lastName, profileImageUrl)
- Auth schema defined in `shared/models/auth.ts`, re-exported from `shared/schema.ts`
- Frontend auth hook at `client/src/hooks/use-auth.ts` (useAuth)
- Auth utility at `client/src/lib/auth-utils.ts`
- All `/api/` routes protected by `isAuthenticated` middleware (except `/api/login`, `/api/logout`, `/api/callback`, `/api/auth/user`)
- Login page shown when unauthenticated; authenticated users see user avatar + logout button in header

### Replit-Specific Integrations
- `@replit/vite-plugin-runtime-error-modal` — Runtime error overlay in dev
- `@replit/vite-plugin-cartographer` and `@replit/vite-plugin-dev-banner` — Dev-only Replit plugins
- Replit Connectors for Google Sheets OAuth flow

### Key NPM Packages
- **express** v5 — HTTP server
- **drizzle-orm** + **drizzle-kit** — ORM and migration tooling
- **@tanstack/react-query** — Client-side data fetching/caching
- **wouter** — Client-side routing
- **zod** + **drizzle-zod** — Schema validation
- **shadcn/ui** components built on **@radix-ui** primitives
- **tailwindcss** — Utility-first CSS framework
- **lucide-react** — Icon library