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
- `/` — Dashboard with stats (total clients, overdue tunings, etc.)
- `/customers` — Client list with search and filtering
- `/customers/new` — Create new client form
- `/customers/:id` — Client detail with multiple piano profiles and per-piano service records
- `/call-center` — Call center with contact priority list and last contacted tracking
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
  - `POST /api/sync` — Sync data from Google Sheets

### Data Storage
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with `drizzle-zod` for schema validation
- **Schema location**: `shared/schema.ts` (shared between client and server)
- **Tables**:
  - `customers` — id, firstName, lastName, companyName, email, phone, address, city, state, zipCode, pianoType, lastTuned, personalNotes, lastContacted, createdAt
  - `pianos` — id, customerId, make, model, pianoType, year, notes, photos (text[]), lastTuned, createdAt
  - `service_records` — id, customerId, pianoId, serviceDate, serviceType, notes, cost, createdAt
  - `appointments` — id, customerId, pianoId, date, time, servicesRequested, priceEstimate, notes, isTuning, status, createdAt
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