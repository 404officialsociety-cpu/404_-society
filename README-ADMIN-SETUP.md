# 404 Society Admin Panel — Android-friendly starter

This download includes `public/admin.html`, an admin dashboard interface for the existing 404 Society Cloudflare Worker, plus this setup guide.

## Important
The HTML page is a **starter interface, not a complete secure backend**. It expects protected `/api/admin/*` routes. Those routes do not become available merely by uploading this file. Until the routes and D1 migration are implemented and tested, the dashboard will show an API-not-ready error. Do not use it to process real orders yet.

## Add it to GitHub on Android
1. Open https://github.com/404officialsociety-cpu/404_-society
2. Create a branch named `feature/admin-panel` from `main`.
3. Open `public/`. Choose **Add file → Create new file**.
4. Name the file `admin.html`.
5. Copy the full contents of the included `public/admin.html` into the editor and commit to `feature/admin-panel`.
6. Add this README guide if useful.

## Expected routes
- `GET /api/admin/me`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id` (soft deactivate)
- `GET /api/admin/orders`
- `POST /api/admin/orders/:id/retry`

## Backend requirements before deploy
- Add a verified Google-account administrator allowlist checked on every admin route.
- Add versioned D1 migrations for products and product variants. Back up the current D1 database first; preserve `orders` and `customers`.
- Update `/api/products` and checkout validation to read active products and SKU mappings from D1.
- Snapshot item name, price, size, colour, and SKU into each order at checkout.
- Verify Cashfree webhook signatures and confirm payment server-side before fulfillment.
- Make Qikink fulfillment idempotent and handle ambiguous API timeouts carefully to avoid duplicate orders.
- Keep all API secrets in Cloudflare Worker secrets, never in HTML or public GitHub code.

## Deploy
After the backend is implemented and tested, merge the branch and let the existing Cloudflare deployment pipeline deploy it. Then open `https://404--society.404society.workers.dev/admin.html`.

Do not deploy the starter as a production-ready admin system until the protected backend routes and migration are complete.
