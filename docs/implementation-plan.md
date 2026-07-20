# Cart Implementation Plan

This document tracks the progress of building out the Shopping Cart for the Cabinet Protector website.

## Goals
- [x] Implement quantity management in `CartService`.
- [x] Enable users to increase/decrease item quantities from the UI.
- [x] Add "Remove" functionality for items in the cart.
- [x] Update the UI to display correct totals and current counts.
- [x] Ensure standard accessibility (ARIA labels) on all buttons.

## Technical Strategy
1. **Service Layer**: 
   - Update `addToCart` to check if product exists. If it does, increment quantity. Otherwise, add new entry.
   - Create `updateQuantity(productId, amount)` method in `CartService`.
   - Create `removeFromCart(productId)` method in `CartService`.
2. **Component Layer**:
   - Update `cart.component.ts` to use the updated service methods.
   - Add UI buttons for +/- on each item.
3. **Validation & Testing**:
   - Verify totals update reactively using signals.

## Progress Tracking
- [x] Initial Component Scaffolding (done)
- [x] Update CartService Logic
- [x] UI Implementation for Quantity Controls
- [x] Remove Item Functionality
- [x] Accessibility Review

## Build Fixes (2026-07-09)
The scaffolded app did not compile; the following was repaired while implementing the cart:
- Wired `app.routes.ts` into `AppRoutingModule` (routes were an empty array) and replaced the CLI placeholder `app.html` with `<router-outlet />`.
- Fixed relative import depth (`../../` → `../../../`) in cart, checkout, and shop components; fixed `./models` → `../models` in `ProductService`.
- Navbar: replaced non-existent `RouterLinkActiveOptions` import with the `RouterLinkActive` directive; added Cart link with live count badge.
- Deleted unused, non-compiling `shop.routes.ts` (routing lives in `app.routes.ts`).
- Created missing `cart.component.css` / `checkout.component.css`; fixed malformed `@else` closing tag in cart template, unterminated interpolation in product-detail sizes list, and invalid `[attr.aria-required="true"]` bindings in checkout.
- Product list "View Details" now navigates via `routerLink` (was a console.log stub).
- Added Bootstrap 5.3 via CDN in `index.html` (not installed as a package; swap for the npm dependency if preferred).

## Phase 2: Pages & Size Selection (2026-07-18)

### Goals
- [x] About page at `/about` with company story, mission, and supplier/custom-cut positioning.
- [x] FAQ page at `/faq`; homepage FAQ accordion becomes a teaser linking to it.
- [x] Product detail page: choose between an available (standard) size and custom measurements.
- [x] Custom measurements: width/height inputs in inches (1/16" precision) with validation.
- [x] Product detail page more robust: dynamic feature list from product flags, material specs.
- [x] Cart lines and checkout order summary denote the selected size (standard label or custom dimensions) alongside quantity.

### Technical Strategy
1. **Model**: Add `CartItemSize` (`kind: 'standard' | 'custom'`, label, width, height). `CartItem` gains `size` and a computed `key` (product + size) so the same product in two sizes is two cart lines.
2. **Service**: `addToCart(product, size)` merges by line key; `updateQuantity`/`removeFromCart` operate on the key.
3. **Product detail**: reactive form — size mode radios (standard vs custom), standard size radio list, custom width/height number inputs with conditional validators (required, 4–72", step 1/16). Add to Cart blocked until valid.
4. **Cart/checkout**: size label + "Custom cut" badge under each line; checkout gains an order summary column (items, size, qty, totals).
5. **Pages**: standalone `AboutComponent` and `FaqComponent` under `features/`; routes + navbar links. Shared editorial styles (`.eyebrow`, `.text-navy`, `.bg-navy`, navy CSS vars) move from `home.component.scss` to global `styles.scss` (used by 3+ pages).

### Product Reframe (2026-07-18)
The protectors are barrier strips for the **base** of floor-length cabinets (the strike zone for wheelchair
footrests, walkers, and vacuums) — not full-door covers. Copy across home, shop, product detail, about, and FAQ
was rewritten to match; standard sizes became wide-and-short (e.g. 24" W × 6" H); custom measurement ranges are
now width 6"–96" and height 2"–24"; how-it-works order is measure → fit → paint → apply (paint before install).

### Stock Colors & Shop Redesign (2026-07-18)
Six most-requested paint colors are stocked pre-painted and ready to ship (standard sizes ship in 1 business
day). `FinishColor` lives in the product model; `ProductService.getStockColors()` is the single source used by
the home color section, the shop finishes band, and the product-detail finish picker (primed default + six
in-stock colors). Cart lines carry a `finish` (in the line key, so color variants are separate lines) shown
with a color chip in cart and checkout. The shop page was redesigned in the site's editorial style: warm hero
band, illustrated cabinet-base product cards, outlined feature tags, and an in-stock finishes section. The
navy `.btn-primary` override moved from home-only SCSS to global `styles.scss`.

### Paint Match (2026-07-18)
Third finish option: "Paint match" — the customer enters a Sherwin-Williams paint code (validated
`SW ####` pattern, SW colors only) and strips are painted to match before shipping for a $15/strip fee
(`PAINT_MATCH_FEE`). `CartItemFinish` gained `kind` ('primed' | 'stock' | 'paint-match') and `surcharge`;
`CartService.unitPrice(item)` (product price + surcharge) feeds line totals and `totalAmount`. Cart badges the
finish kind ("In stock" / "Paint match") and shows the fee in the per-unit price; the product-page preview
falls back to primed with a "painted to match before shipping" caption. Paint-matched orders ship 3–5 days.

### Phase 3: hapi API (2026-07-18)
Standalone Node.js API in `server/` (`@hapi/hapi` + `joi`, ESM). Routes: `GET /api/health`,
`GET /api/products`, `GET /api/products/{id}`, `GET /api/stock-colors`, `POST /api/orders`. Order payloads are
validated with joi mirroring the frontend rules (custom size 6"–96" × 2"–24", finish primed/stock/paint-match
with SW-code pattern) and priced server-side ($15/strip paint-match fee). Orders are stored in memory — swap in
a database for persistence. CORS is enabled for the Angular dev server. `npm run smoke` exercises every route
via `server.inject` without opening a port. The catalog in `server/src/data.js` duplicates the Angular
`ProductService` data; the next step is pointing the frontend at the API, which removes that copy.

### Frontend ↔ API Wiring (2026-07-18)
The Angular app now consumes the hapi API. `ProductService` fetches `/api/products` and `/api/stock-colors`
into readonly signals (the hardcoded catalog copy is gone; `server/src/data.js` is canonical) and
`getProduct(id)` hits `/api/products/{id}`. Checkout POSTs the real order to `/api/orders` — cart lines carry
`sizeId`/`paintCode` so payloads round-trip exactly — and shows the returned order id/total on success, an
error dialog on failure. `provideHttpClient()` is registered in `AppModule`; `ng serve` proxies `/api` to
`localhost:3000` via `proxy.conf.json`. Run both: `npm run start:api` and `npm start`.

### PostgreSQL (2026-07-18)
The API now uses PostgreSQL instead of in-memory storage. Tables: `products`, `product_sizes`, `stock_colors`
(relational catalog), `orders` (customer/lines as jsonb, server-computed total). `npm run db:setup` creates the
schema (idempotent) and seeds the same two products, four sizes, and six stock colors from `server/src/data.js`
via upserts. Catalog GETs query live; order POSTs validate ids against the database and insert. Connection:
`DATABASE_URL` or standard `PG*` env vars, defaulting to local database `protect_vinyl`. `/api/health` now
reports database connectivity, and the smoke test requires a running, seeded database.

### Multi-Brand Paint Match (2026-07-19)
Paint matching now supports Sherwin-Williams, Benjamin Moore, and Behr, not just SW. `PAINT_BRANDS` in
`src/app/shared/constants/paint-brands.ts` is the single source (name, code placeholder/help text, a verified
official color-tool URL per brand, and a loose sanity-check code pattern); the product page's paint-match
option now shows a brand picker that switches the code label, placeholder, validation, and "find your code"
link. `CartItemFinish` gained `paintBrand`, carried through cart, checkout, and the order payload. Server-side,
`PAINT_BRANDS` in `server/src/data.js` mirrors the three brand names for pricing/labels; joi validates
`paintBrand` against the known set and `paintCode` as a generic alnum/hyphen shape (2–24 chars) rather than a
brand-specific pattern, since the server's job is sanity-checking and correct pricing, not exact format
enforcement. FAQ, home, and shop copy updated to mention all three brands; the FAQ's paint-match answer links
to all three brands' official color-finding tools.

### Progress Tracking
- [x] CartService size support
- [x] Product detail size selection UI
- [x] Cart + checkout size display
- [x] About page
- [x] FAQ page
- [x] Routes + navbar
- [x] Build & tests green

## Phase 4: Customer Accounts, Auth & Order History (2026-07-19)

### Goals
- [x] `AuthService` holding auth state in localStorage (token + user snapshot), signal-based like `CartService`.
- [x] Login page at `/login` and signup page at `/signup`.
- [x] Optional "create a password" field at checkout; every paid order creates (or links to) a customer record.
- [x] Welcome email on account creation with a verification link; clicking it lands on `/verify-email?token=…` which sets `email_verified = true`.
- [x] Navbar: logged-in users see "Hi, {first name}" with a right-aligned dropdown (Profile / My Orders / Log out); logged-out users see Log in / Sign up.
- [x] Profile page at `/account` (name, email, phone, verified badge).
- [x] Orders page at `/account/orders` — survives refresh (auth restored from localStorage, orders refetched from the API), lists all orders for the signed-in customer.
- [x] Single order page at `/account/orders/:id` (lines with size/finish, totals, shipping address, status).

### Decisions & Assumptions (confirm before implementing)
1. **Guest checkout stays.** The checkout password field is optional — "able to set a password", not required. Logged-in customers don't see it; their order links automatically.
2. **Auth tokens: opaque DB-backed session tokens, not JWT.** A `sessions` table (random 32-byte token, stored hashed, 30-day expiry) needs zero new dependencies, is revocable on logout, and a tiny custom Hapi bearer scheme covers it. Sent as `Authorization: Bearer` from an Angular interceptor.
3. **Password hashing: `node:crypto` scrypt** (+ `timingSafeEqual`) — no bcrypt dependency.
4. **Email: Resend** (free tier: 3,000 emails/month) via its plain HTTPS API (`POST https://api.resend.com/emails` with global `fetch`) — no SDK, zero new dependencies. Guarded like `stripe.js`: when `RESEND_API_KEY` is absent (dev), log the message + verification URL to the console instead of failing. Note: Resend's free tier sends from `onboarding@resend.dev` only to your own address until a domain is verified in their dashboard.
5. **Stripe redirect payments lose the checkout password** (the page navigates away; we won't stash a plaintext password in storage). Those orders still create the customer from the Stripe email; the verification link doubles as "finish setting up your account" and lets a customer with no password set one. Card payments (no redirect) pass the password on the confirm call.
6. **Guest-order backfill is verification-gated.** Orders made while logged in / with a checkout password link to `customer_id` immediately (same session proves ownership). Older guest orders matching the customer's email are linked only once the email is verified — otherwise signing up with someone else's address would expose their order history.
7. Routes are eagerly imported and components are standalone, matching `app.routes.ts` as it stands today.

### Technical Strategy

1. **Database** (`db-setup.js`, idempotent like existing DDL):
   - `customers`: `id uuid PK`, `email text UNIQUE` (stored lowercased), `full_name`, `phone`, `password_hash text NULL`, `email_verified boolean DEFAULT false`, `created_at`.
   - `sessions`: `token_hash text PK`, `customer_id FK`, `expires_at`.
   - `email_verifications`: `token_hash text PK`, `customer_id FK`, `expires_at` (7 days, single-use).
   - `orders`: `ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id)`.
2. **Server auth plumbing** (`server/src/auth.js`): scrypt hash/verify, token mint/hash, a `customer` Hapi auth strategy resolving `Authorization: Bearer` → customer row.
3. **Auth endpoints**:
   - `POST /api/auth/signup` — create customer (409 on duplicate email), send welcome/verification email, return `{ token, user }`.
   - `POST /api/auth/login` — verify password, return `{ token, user }`. Same error for unknown email vs wrong password.
   - `POST /api/auth/logout` — delete session row.
   - `GET /api/auth/me` — validate the stored token on app boot; 401 clears client state.
   - `POST /api/auth/verify-email` — consume token: set `email_verified`, backfill guest orders by email, return `{ token, user }` so the click also signs the customer in.
   - `POST /api/auth/password` — set-only (409 if a password exists): lets accounts created at checkout without a password finish setup from the verify-email page. (Implemented instead of verify-email accepting a password — the verification token is single-use, so password entry has to happen after it's consumed.)
4. **Customer creation at checkout**: `POST /api/checkout/{orderId}/confirm` gains optional `password` in the payload and honors an optional auth header. After the session is verified paid, every order gets an owner: the logged-in caller, an existing account matching the Stripe email (a supplied password never touches an existing account), or a newly created customer — with the checkout password when one was entered, passwordless otherwise — who gets the welcome email. Response includes `accountCreated` so the UI can mention "check your email".
5. **Order endpoints** (auth required): `GET /api/orders` (customer's orders, newest first) and `GET /api/orders/{id}` (404 unless owned by the caller — never 403, don't leak existence).
6. **Email module** (`server/src/email.js`): thin Resend `fetch` wrapper per decision 4; welcome template with `${APP_URL}/verify-email?token=…`.
7. **Frontend `AuthService`** (`core/services/auth.service.ts`): `_state` signal `{ token, user } | null` loaded from localStorage key `protect-vinyl.auth.v1` with a shape guard, persisted via `effect` — the `CartService` pattern. Exposes `user`, `isLoggedIn`, `firstName` computed; `login`/`signup`/`logout`/`verifyEmail`/`refreshUser` call the API. On construction, if a token exists, `GET /api/auth/me` re-validates it (stale → clear).
8. **HTTP interceptor + guard**: functional `authInterceptor` (adds bearer header; on 401 clears auth state) registered via `withInterceptors` in `app-module.ts`; functional `authGuard` protecting `/account/**`, redirecting to `/login` with a `returnUrl` query param.
9. **Pages** (standalone, under `features/auth/` and `features/account/`): login and signup (typed reactive forms, inline API errors, cross-links), verify-email (reads `token` query param, success/expired states), profile, orders list, order detail. The orders table gets a `<caption>`, `<th scope>`, and per-row links labeled with the order id; status badges include text, not color alone.
10. **Navbar**: right side renders from `AuthService.isLoggedIn()` — Bootstrap dropdown (`data-bs-toggle="dropdown"`, CDN bundle already loaded) with `aria-expanded`, labeled toggle "Account menu for {name}"; Log in / Sign up links otherwise.
11. **Checkout UI**: when logged out, an optional "Create an account" password input (with visibility toggle + label) near the contact fields; value is passed to `confirmOrder(orderId, password?)`. Confirmation dialog mentions the verification email when `accountCreated` is true.
12. **Verification**: extend `server/src/smoke.js` to cover signup → login → me → orders-list → order-detail ownership (wrong customer → 404) and the confirm-creates-customer path; `ng build` + existing tests stay green.

### New dependencies & env
- No new packages, frontend or server (Resend is called with built-in `fetch`; scrypt replaces bcrypt).
- New `server/.env` keys: `APP_URL` (verification links, e.g. `http://localhost:4200`), `RESEND_API_KEY`, `EMAIL_FROM` (optional in dev — console fallback).

### Progress Tracking
- [x] DB: customers / sessions / email_verifications / orders.customer_id
- [x] Server: auth module (scrypt + hashed opaque tokens, `customerFromRequest` helper instead of a formal hapi strategy — no @hapi/boom dependency needed)
- [x] Server: auth endpoints (signup, login, logout, me, verify-email, set-password)
- [x] Server: confirm creates/links customer + welcome email
- [x] Server: email module (console fallback)
- [x] Server: orders endpoints + ownership checks
- [x] Server: smoke coverage (signup/login/me/logout, 401s, empty orders, ownership 404, bogus verify token)
- [x] FE: AuthService + interceptor + guard
- [x] FE: login / signup pages
- [x] FE: verify-email page (with set-password step for checkout-created accounts)
- [x] FE: navbar dropdown
- [x] FE: checkout password field (with show/hide toggle)
- [x] FE: profile page
- [x] FE: orders list + order detail pages
- [x] Build & tests green; accessibility self-check on new UI

To run: `npm run db:setup` in `server/` (new tables), then `npm run smoke`. Optional `.env` keys: `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM` — without them, verification links are logged to the API console. Note: the initial bundle now exceeds the 500 kB budget by ~26 kB (warning only).

## Phase 5: Admin — Orders, Users & Inventory (2026-07-19)

### Goals
- [x] Admin users: `is_admin` flag on customers, granted **manually only** (SQL — no endpoint or UI can set it).
- [x] Admin area at `/admin` with three sections: Orders, Users, Inventory. The `is_admin` flag is never written to localStorage and the `/admin` guard verifies admin status against the server on every entry; every `/api/admin/*` route additionally re-checks `is_admin` in the database (the server is authoritative).
- [x] Admin orders list: all orders, filterable by status, with customer email/date/total.
- [x] Admin single order: full refund, partial refund (dollar amount), cancel, edit shipping address, mark shipped / delivered.
- [x] Admin users list: ban/unban (banned users cannot enter the platform), delete, change email, send a password-reset link.
- [x] Password-reset flow (new public capability the reset link needs): reset email + `/reset-password?token=…` page.
- [x] Inventory: manage in-stock colors for pre-painted items (add / edit / remove), plus a fulfillment dashboard — the manufacturing work queue of paid orders showing exactly what to produce per line (dimensions, finish or paint code, quantity) with one-click mark-shipped.

### Decisions & Assumptions (confirm before implementing)
1. **Admin bootstrap is SQL-only**: `UPDATE customers SET is_admin = true WHERE email = '…';` after the person signs up normally. Nothing in the API can grant or revoke admin.
   **The admin flag never touches localStorage.** The persisted auth snapshot strips `isAdmin`; it lives only in an in-memory signal populated from server responses (`/auth/me`, login). The `adminGuard` is async and resolves a fresh `GET /api/auth/me` before activating `/admin` routes, so editing the localStorage object (or any client state) changes nothing — the admin UI renders only on a server-confirmed answer, and every admin API call re-verifies `is_admin` in the database against the session token. A tampered client gets neither the shell nor the data.
2. **Cancel does not move money; refund is explicit — and refund state is orthogonal to fulfillment.** Refunds go through Stripe (`refunds.create` on the order's payment intent) and accumulate in `orders.refund_amount` (capped at the total); they never change `status`, so an order can be shipped or delivered *and* partially or fully refunded at the same time. The UI derives a refund badge ("Refunded" / "Refunded $X of $Y") shown alongside the status badge. Cancel sets status `canceled` and is allowed only before shipment.
3. **Ban takes effect immediately**: login is rejected ("This account has been disabled.") and all of the user's sessions are deleted, so existing tokens die too. `is_banned` is also checked when resolving any session.
4. **Deleting a user keeps their orders** for financial records — `orders.customer_id` becomes NULL (FK changes to `ON DELETE SET NULL`); sessions/verifications/resets cascade away. Hard delete, no soft-delete column.
5. **Changing a user's email** lowercases it, 409s on conflict, marks the account unverified, and sends a fresh verification email to the new address.
6. **Password reset overwrites the existing password** (the token proves mailbox ownership) and revokes all sessions. Tokens are single-use, 1-hour expiry.
7. **Stock colors are hard-deleted** — order lines snapshot the finish label, so history is safe; removing a color just stops new orders from selecting it.
8. **Status vocabulary** is the fulfillment lifecycle only: `pending → paid → shipped → delivered`, plus `canceled`. There is no `refunded` status — refund state is derived from `refund_amount` (none / partial / full) and coexists with any status. Ship/deliver transitions are only allowed from `paid`/`shipped`.

### Technical Strategy
1. **DB** (`db-setup.js`, idempotent): `customers.is_admin` + `customers.is_banned` (boolean, default false); `orders.refund_amount numeric(10,2) DEFAULT 0`; `password_resets` table (token_hash PK, customer_id FK cascade, expires_at); recreate `orders_customer_id_fkey` with `ON DELETE SET NULL`.
2. **Server auth**: session resolution excludes banned users; login 403s for banned; `adminFromRequest` helper (customer + `is_admin`) guards every admin route.
3. **Stripe** (`stripe.js`): `createRefund(paymentIntentId, amountCents?)` — omit amount for full refund of the remainder; server validates amount ≤ total − already refunded.
4. **Admin endpoints** under `/api/admin/`: orders list (optional `?status=`) + detail; `POST orders/{id}/refund {amount?}`; `POST orders/{id}/cancel`; `PATCH orders/{id}/shipping-address {address}`; `PATCH orders/{id}/status {status: shipped|delivered}`; users list; `PATCH users/{id}/ban {banned}`; `DELETE users/{id}`; `PATCH users/{id}/email {email}`; `POST users/{id}/password-reset`; stock-colors `POST` / `PATCH {id}` / `DELETE {id}`.
5. **Public reset endpoint**: `POST /api/auth/reset-password {token, password}` — consumes the reset token, overwrites the hash, revokes sessions, returns `{ token, user }` (logs the user in).
6. **Email** (`email.js`): `sendPasswordResetEmail` reusing the Resend wrapper + console fallback.
7. **FE core**: `AuthService` keeps `isAdmin` in a memory-only signal set from server responses and stripped before every localStorage write (the stored shape guard also drops any injected `isAdmin` key on load); async `adminGuard` awaits `GET /api/auth/me` and admits only a server-confirmed admin; `AdminService` (`core/services/admin.service.ts`) wrapping the admin API; `AuthService.resetPassword`. The `statusClass` helper now needed by 4+ components gets extracted to a shared util (rule of three).
8. **FE pages** under `features/admin/` (nested-folder style matching `features/account/`): `orders/order-list`, `orders/order-detail` (actions panel: refund with amount input, cancel, shipping-address form, ship/deliver buttons — all confirmed via Swal), `users/user-list` (ban toggle, delete confirm, change-email, send-reset — per-row buttons labeled with the user's email), `inventory/inventory` (stock-color manager + fulfillment queue: paid orders expanded to per-line manufacturing specs with mark-shipped). `features/auth/reset-password` public page.
9. **Navbar**: "Admin" entry in the account dropdown when `isAdmin`.
10. **Smoke**: `/api/admin/*` 401 anon / 403 non-admin; banned login 403; bogus reset token 400; stock-color create→delete round-trip; refund/cancel validation (non-Stripe paths).

### New dependencies & env
- None. (Stripe refunds use the existing SDK; reset emails use the existing Resend wrapper.)

### Progress Tracking
- [x] DB: is_admin / is_banned / refund_amount / password_resets / FK change
- [x] Server: banned enforcement (login 403 + session resolution excludes banned) + `requireAdmin` hapi pre
- [x] Server: admin order endpoints (refund via Stripe with SQL-capped accumulation, cancel, address, status transitions guarded in SQL)
- [x] Server: admin user endpoints (ban kills sessions, delete unlinks orders, email re-verifies, reset link) + public reset endpoint
- [x] Server: stock-color management endpoints (id slugged from name, hex validated)
- [x] Server: smoke coverage (mid-run SQL promotion, ban round-trip, email change + conflict, delete, color CRUD, self-ban 400)
- [x] FE: adminGuard (server-verified) + AdminService + shared `order-status.ts` util (statusClass / itemCount / refundLabel — rule-of-three extraction)
- [x] FE: admin orders list + order detail actions
- [x] FE: admin users page
- [x] FE: inventory (colors + fulfillment queue)
- [x] FE: reset-password page + navbar Admin entry
- [x] Build & tests green; accessibility self-check

To run: `npm run db:setup` in `server/`, then `npm run smoke`. Grant admin with:
`UPDATE customers SET is_admin = true WHERE email = 'you@example.com';`
Self-ban and self-delete are rejected server-side. The initial bundle is now ~569 kB (69 kB over the 500 kB warning budget) — lazy-loading the admin/account routes would claw this back if it starts to matter.

## Phase 6: Vercel Deployment (2026-07-19)

### Goals
- [x] Serve the Angular production build as static output.
- [x] Serve the existing hapi API (`server/`) as a Vercel Serverless Function under `/api/*`, unmodified.
- [x] SPA fallback so deep links (e.g. `/account/orders`, refreshed) resolve to `index.html` instead of 404ing.
- [x] Both installed and buildable from a single Vercel project pointed at the repo root — no restructuring into an npm workspace.

### Decisions & Assumptions
1. **The hapi server itself needed zero changes.** `Hapi.server()` creates its internal `http.Server` and attaches the `'request'` dispatcher at construction time (`core.js`'s `_createListener()`), not at `.start()` — `.start()` only calls `.listen()` to bind a socket. So `server.initialize()` (hapi's own documented no-socket startup path) followed by forwarding Vercel's `req`/`res` straight into `server.listener.emit('request', req, res)` runs the exact same routing/validation/handlers as the local dev server. Verified locally by piping a plain `http.Server` into the handler and confirming hapi's own JSON 404 came back for an unknown route.
2. **One catch-all function, not one file per route.** `api/[...path].mjs` matches every `/api/*` request; Vercel forwards the original `req.url` unmodified, so hapi's own router (which already expects paths like `/api/products/{id}`) matches correctly without any path rewriting.
3. **`server/`'s dependencies are installed via a custom `installCommand`**, not by converting the repo into an npm workspace: `npm install && npm install --prefix server`. Node's module resolution walks up from `server/src/*.js`, finds `server/node_modules`, and `@vercel/nft`'s build-time file tracer follows the same resolution algorithm — confirmed by locating `@hapi/hapi`'s `listener` wiring directly in `server/node_modules`.
4. **SPA fallback (`rewrites: [{ source: "/(.*)", destination: "/index.html" }]`) is safe with the API present**: Vercel only applies a rewrite when no static file or Serverless Function matches the request first, so `/api/*` always reaches the function and everything else falls through to `index.html` for Angular's router to handle client-side.
5. **`.env` files are not used in production** — Vercel injects environment variables directly into `process.env`; the server code that reads `process.env.DATABASE_URL` / `STRIPE_SECRET_KEY` / etc. needed no changes. `server/.env` was confirmed already gitignored and never committed.

### Technical Strategy
1. **`api/[...path].mjs`** (repo root): imports `buildServer` from `server/src/server.js`, lazily builds + initializes one hapi server instance per warm container (module-level cached promise), and forwards every request into `server.listener`.
2. **`vercel.json`** (repo root): `installCommand` (installs both root and `server/` deps), `buildCommand: npm run build`, `outputDirectory: dist/protect-vinyl/browser` (matches the new `@angular/build:application` builder's nested output), and the SPA-fallback rewrite.
3. **`package.json`**: added `engines.node: "20.x"` so Vercel picks a Node runtime that satisfies both Angular 21 and hapi 21's minimums for the build container and the function runtime alike.
4. No changes to `environment.ts` / `environment.development.ts` — `apiUrl: '/api'` in production already assumes same-origin API, which is exactly what this setup provides.

### Required Vercel configuration (not code — set in the Vercel dashboard before going live)
- **Environment variables**: `STRIPE_SECRET_KEY`, `CHECKOUT_RETURN_URL` (set to `https://<your-domain>/checkout`), `APP_URL` (set to `https://<your-domain>`), and optionally `RESEND_API_KEY` / `EMAIL_FROM` (without `RESEND_API_KEY`, verification/reset links are only logged to the Vercel function logs, not emailed). With the Supabase↔Vercel integration installed, no database env var needs to be set by hand — see below.

### Supabase + migrations on deploy (2026-07-19)
The database is Supabase, connected via the Vercel integration, which injects `POSTGRES_URL` (Supavisor **transaction-mode pooler**, port 6543) and `POSTGRES_URL_NON_POOLING` (**session/direct**, port 5432) among others. Wired up so migrations run automatically on every deploy:

1. **`db.js` connection fallback is now `DATABASE_URL || POSTGRES_URL`** — at runtime the serverless functions pick up the integration's pooled URL automatically. This also resolves the earlier "connection pooling caveat": transaction-mode pooling is exactly the fix that was deferred, and it needs no manual env var. (Our queries are single, unnamed parameterized statements — compatible with transaction-mode pooling.)
2. **`vercel.json` buildCommand** is now `DATABASE_URL=${POSTGRES_URL_NON_POOLING:-$DATABASE_URL} npm --prefix server run db:setup && npm run build` — the idempotent schema/seed script (`CREATE TABLE IF NOT EXISTS` + upserts, safe to re-run every deploy) executes against the **non-pooled** connection (Supabase's recommendation for DDL) before the frontend builds; a failed migration fails the deploy before anything ships. Shell-expansion fallbacks verified: prefers `POSTGRES_URL_NON_POOLING`, falls back to a manually set `DATABASE_URL`, and expands to empty locally (where `db.js` then falls through to `POSTGRES_URL`/`PG*`/local default, so `npm run db:setup` in `server/` still targets local Postgres unchanged).
3. **SSL needs no code change**: verified in the installed `pg-connection-string@2.14.0` source that `sslmode=require` (what Supabase URLs carry) maps to `ssl: { rejectUnauthorized: false }`, matching libpq semantics — connections succeed without custom CA plumbing.
4. Preview deployments run the same idempotent setup against whatever database their env exposes — with the default integration setup that's the **same** database as production; use Supabase branching or a separate preview project if isolation matters later.

Alternative for one-off/manual runs (no deploy): copy the *session* connection string from the Supabase dashboard (port 5432) and run `DATABASE_URL='postgres://…' npm run db:setup` from `server/` locally.

### Deployment debugging session (2026-07-19) — what production actually needed
Live debugging against the real Vercel project (CLI, preview deploys) surfaced four fixes beyond the original setup; the third preview deploy succeeded with `Database ready: { products: '2', sizes: '4', colors: '6' }` in the build log — the Supabase migration now runs on deploy:
1. **SPA rewrite was swallowing `/api/*`.** The deployed function (`λ api/[...path]`) existed, but `/api/health` returned `index.html` — the catch-all rewrite `/(.*)` shadows dynamic function routes. Fix: `"source": "/((?!api/).*)"` (negative lookahead).
2. **This project's Supabase integration injects `DATABASE_`-prefixed env vars** (`DATABASE_POSTGRES_URL`, `DATABASE_POSTGRES_URL_NON_POOLING`, …), not the unprefixed names. `db.js` now falls back `DATABASE_URL → DATABASE_POSTGRES_URL → POSTGRES_URL`, and the buildCommand prefers `DATABASE_POSTGRES_URL_NON_POOLING` with nested shell fallbacks (expansion behavior verified locally). Note: a leftover manually-set `PGDATABASE` on Vercel had been silently routing the setup script to localhost (`ECONNREFUSED 127.0.0.1:5432`); it is ignored now that a connection string resolves, but removing `PGDATABASE` and `PORT` from the Vercel env would avoid confusion.
3. **TLS: newer `pg` escalates `sslmode=require` to `verify-full`** and rejects Supabase's own-CA chain (`SELF_SIGNED_CERT_IN_CHAIN`) — the earlier claim that no SSL change was needed was wrong (it was based on the older locally-installed pg). `db.js` rewrites `sslmode=require` → `sslmode=no-verify` in the connection URL (pg's explicit encrypt-without-CA-verification mode, i.e. libpq's actual "require" semantics). URL rewriting, not an `ssl` config object, because pg merges the parsed URL *over* explicit config (verified in pg source). Upgrade path if stricter verification is wanted later: download the Supabase CA cert and use `sslrootcert`.
4. **`engines.node` bumped 20.x → 24.x** — Vercel deprecation (20.x builds fail after 2026-10-01) and the project setting was already 24.x.

Remaining to go live: these fixes exist locally/in preview only — production deploys from `main` via git, so they must be committed and pushed (or promoted with `vercel deploy --prod`, which the next git push would overwrite if unpushed).

### Progress Tracking
- [x] `api/[...path].mjs` serverless bridge (verified locally against a real HTTP request)
- [x] `vercel.json` (install/build/output/rewrites)
- [x] `engines.node` pinned
- [x] `ng build` verified to produce output at the configured `outputDirectory`
- [x] Supabase integration wiring: `db.js` falls back to pooled `POSTGRES_URL`; buildCommand runs idempotent `db:setup` against `POSTGRES_URL_NON_POOLING` on every deploy
- [ ] Remaining env vars set in the Vercel dashboard: `STRIPE_SECRET_KEY`, `CHECKOUT_RETURN_URL`, `APP_URL`, optionally `RESEND_API_KEY`/`EMAIL_FROM` (user action)
- [ ] First deploy verified end-to-end (user action)

## Phase 7: Structured Server Logging (2026-07-19)

### Goals
- [x] Detailed request/response/error logs for the hapi server — readable locally and in Vercel's function log viewer.

### Decisions
User chose **hapi-pino** (the actively-maintained standard for hapi; the older `good` logging ecosystem is deprecated) over hand-rolled `server.events` + `console.log`. Confirmed compatible: hapi-pino v13.x targets `@hapi/hapi` v21, which matches this project. Confirmed via the plugin's source (`pinojs/hapi-pino` on GitHub) that `level`, `redact`, and `transport` are all passed straight through to the underlying `pino()` call — so the dev/prod split and header redaction below work as expected, not just per the README.

### Technical Strategy
1. **`server/src/server.js`**: `buildServer` is now `async` (needed since `server.register()` must be awaited before routes are added). Registers `hapi-pino` right after `Hapi.server(...)` construction:
   - `level`: `LOG_LEVEL` env var, default `info`.
   - `redact: ['req.headers.authorization']` — bearer tokens never appear in logs.
   - `transport: { target: 'pino-pretty', ... }` only when `NODE_ENV !== 'production'` — colorized human-readable logs locally, plain JSON lines in production (Vercel sets `NODE_ENV=production` for both Production and Preview deployments, so this split is automatic with no env var to set).
   - Defaults log one line per completed request (method/path/status/duration) and full error objects with stack traces on request errors — no payload/query/path-param logging by default, so login/signup/reset passwords are never logged.
2. **Call sites updated to `await buildServer()`**: `server/src/index.js`, `server/src/smoke.js`, `api/[...path].mjs` (all previously called it synchronously).
3. **`server/src/smoke.js`** sets `process.env.LOG_LEVEL ??= 'silent'` before building the server, so the existing PASS/FAIL console output stays readable by default; set `LOG_LEVEL=info npm run smoke` to see per-request logs while debugging a failing run.
4. **New dependencies**: `hapi-pino` (dependency) and `pino-pretty` (devDependency, dev-only pretty-printer — never imported when `NODE_ENV=production`, so its absence there is harmless) added to `server/package.json`. **Not yet installed — run `npm install` inside `server/` before starting the API or running smoke.**

### Progress Tracking
- [x] `hapi-pino` + `pino-pretty` added to `server/package.json`
- [x] `buildServer` registers hapi-pino (dev pretty-print / prod JSON, `LOG_LEVEL`, Authorization redaction)
- [x] All three call sites updated to `await buildServer()`
- [x] `smoke.js` defaults to silent logging
- [x] All touched files syntax-checked
- [ ] `npm install` run inside `server/` (user action — new dependencies not yet installed)
- [ ] `npm run smoke` re-run after install to confirm the server still boots correctly
