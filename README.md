# ProTectVinyl

E-commerce site for paintable vinyl barrier strips that protect the base of floor-length cabinets — the
strike zone for wheelchair footrests, walkers, and everyday wear. Customers order standard sizes matched to
national cabinet brands or custom cuts to their own measurements, in a primed finish, six in-stock
pre-painted colors, or paint-matched to a Sherwin-Williams, Benjamin Moore, or Behr code.

Three pieces:

| Piece | Where | Stack |
| --- | --- | --- |
| Frontend | `src/` | Angular 21 |
| API | `server/` | Node.js + hapi |
| Database | PostgreSQL | `protect_vinyl` |

Implementation history lives in [docs/implementation-plan.md](docs/implementation-plan.md).

## Frontend (Angular)

### Technologies & packages

- **Angular 21** — NgModule bootstrap (`AppModule`) with standalone routed components
- **Signals** for state (`CartService`, `ProductService`) and **reactive forms** for the size/finish and checkout forms
- **TypeScript 5.9**, **SCSS** component styles (global editorial styles in `src/styles.scss`)
- **Bootstrap 5.3** — loaded via CDN in `src/index.html` (CSS + bundle JS; not an npm dependency)
- **[sweetalert2](https://sweetalert2.github.io/)** — add-to-cart and order confirmation/error dialogs
- **RxJS** — HTTP calls and form `valueChanges`
- **Vitest** via `@angular/build:unit-test` — unit tests (`jsdom` environment)
- **Prettier** — formatting

### Environment configuration

The API base URL comes from `src/environments/`:

- `environment.development.ts` — `apiUrl: 'http://localhost:3000/api'` (used by `ng serve`; the browser calls
  the API directly, CORS is enabled server-side)
- `environment.ts` — `apiUrl: '/api'` (production default: frontend and API behind the same origin)

### Commands

Run from the repository root:

```bash
npm install              # install frontend dependencies
npm start                # dev server at http://localhost:4200 (add -- --port 5000 for another port)
npm run build            # production build to dist/protect-vinyl
npm run watch            # development build in watch mode
npm test                 # unit tests (Vitest via the Angular test builder)
npm run start:api        # convenience: starts the API in server/
```

Note: run tests with `npm test` (the Angular builder provides the Vitest globals) — bare `npx vitest` will fail.

## API (hapi server)

### API technologies & packages

- **Node.js** (ESM modules)
- **[@hapi/hapi](https://hapi.dev/) 21** — HTTP server, CORS enabled
- **[joi](https://joi.dev/) 17** — payload validation (custom-size ranges, finish kinds, paint-code shape)
- **[pg](https://node-postgres.com/) 8** — PostgreSQL client (connection pool)

Pricing is computed server-side: product price plus a $15/strip paint-match surcharge. Order payloads are
validated against the same rules the frontend enforces (custom sizes 6"–96" wide × 2"–24" high, stock color
ids, one of three supported paint brands with a sane paint-code shape).

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | liveness + database connectivity |
| GET | `/api/products` | product catalog with available sizes |
| GET | `/api/products/{id}` | single product (404 if unknown) |
| GET | `/api/stock-colors` | the six in-stock pre-painted colors |
| POST | `/api/orders` | validate, price, and persist an order |

### API commands

Run from `server/`:

```bash
npm install              # install API dependencies
npm run db:setup         # create schema + seed products/sizes/colors (idempotent)
npm start                # API at http://localhost:3000
npm run smoke            # exercise every route via server.inject (needs a seeded database; no port opened)
```

## Database (PostgreSQL)

The API uses a local `protect_vinyl` database by default. Override with `DATABASE_URL` or the standard `PG*`
environment variables.

### Setup

```bash
createdb protect_vinyl       # once, with PostgreSQL running
cd server
npm install
npm run db:setup             # creates tables and seeds 2 products, 4 sizes, 6 stock colors
```

`db:setup` is safe to re-run: tables are `CREATE TABLE IF NOT EXISTS` and seeds are upserts. Seed data lives
in `server/src/data.js`.

### Schema

| Table | Contents |
| --- | --- |
| `products` | catalog (name, description, price, feature flags) |
| `product_sizes` | standard sizes per product |
| `stock_colors` | in-stock pre-painted finishes |
| `orders` | placed orders — customer and line items as `jsonb`, server-computed total |

## Image credits

Kitchen photography from [Pexels](https://www.pexels.com), used under the
[Pexels license](https://www.pexels.com/license/) (free for commercial use, no attribution required):

- `hero-home.jpg` — [pexels.com/photo/8583735](https://www.pexels.com/photo/white-kitchen-cabinets-8583735/)
- `hero-shop.jpg` — [pexels.com/photo/3623785](https://www.pexels.com/photo/photo-of-kitchen-3623785/)
- `hero-about.jpg` — [pexels.com/photo/1080721](https://www.pexels.com/photo/kitchen-and-dining-area-1080721/)
- `hero-faq.jpg` — [pexels.com/photo/19846379](https://www.pexels.com/photo/modern-white-minimalistic-kitchen-with-a-balcony-19846379/)
- `highlight-floor-length.jpg` — [pexels.com/photo/7147286](https://www.pexels.com/photo/interior-of-minimalist-kitchen-with-wooden-furniture-and-island-7147286/)
- `about-modern-kitchen.jpg` — [pexels.com/photo/6508358](https://www.pexels.com/photo/modern-kitchen-with-convenient-white-furniture-6508358/)

## Running the full stack

1. Start PostgreSQL and complete the database setup above (first run only)
2. `npm run start:api` — API on **:3000**
3. `npm start` — Angular on **:4200**
4. Open the site: shop → product (size + finish) → cart → checkout; orders persist in the `orders` table
