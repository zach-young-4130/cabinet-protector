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

### Progress Tracking
- [x] CartService size support
- [x] Product detail size selection UI
- [x] Cart + checkout size display
- [x] About page
- [x] FAQ page
- [x] Routes + navbar
- [x] Build & tests green
