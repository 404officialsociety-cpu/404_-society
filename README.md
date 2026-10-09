# 404 Society — Shop

Website → product catalog → bag → Google sign-in → Cashfree payment → Qikink order → account & order history.
One Cloudflare Worker (`src/worker.js`), one page (`public/index.html`), data in D1.
Checked with simulated Google/Cashfree/Qikink replies (`npm test`, 17 checks) and in a real browser. Not tested with live keys.

## Customer accounts
- "Continue with Google" signs customers in. Checkout requires sign-in, and the order email always comes from the Google account.
- Account page: profile, saved address (filled in at checkout), order history, order details, sign out.
- Every account and order request is tied to the signed-in customer. Customers cannot open anyone else's orders.
- The session is a signed cookie (HttpOnly, Secure, SameSite=Lax, 7 days). Sign-in uses a one-time state check.

## Edit your products
Open `src/worker.js`, find `PRODUCTS`: set `name`, `price`, `description`, `image` (https:// photo/mockup URL or ''),
and replace every `REPLACE-…` SKU with the exact SKU from Qikink > My Products (one per size).
Prices are always taken from this list on the server.

## Rules
- Shipping: Rs 0 up to Rs 2,000, Rs 69 above (`SHIPPING` in `src/worker.js`; also update the Shipping page text).
- An order is PAID only after the server asks Cashfree and the amount matches.
- Each paid order goes to Qikink once; on failure it stays PAID with an error and is retried (max 5).

## Deploy (Cloudflare dashboard, from GitHub)
1. **D1**: Storage & databases > D1 > Create `404-society-orders`. Console > paste `schema.sql` > Run. Put its Database ID in `wrangler.toml`.
   If you already ran the older schema: run `ALTER TABLE orders ADD COLUMN customer_id TEXT;` and then the `customers` table from `schema.sql`.
2. **Worker**: Workers & Pages > Create > Import a repository > this repo (deploy command `npx wrangler deploy`).
3. **Google**: Google Cloud Console > APIs & Services > Credentials > Create OAuth client (Web).
   Authorized redirect URI: `https://YOUR-WORKER-URL/api/auth/callback` (exactly, no trailing slash). While the app is in Testing, add your email under Test users; publish it before launch.
4. **Secrets** (Worker > Settings > Variables and Secrets, type Secret): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (40+ random letters/numbers, make your own),
   `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `QIKINK_CLIENT_ID`, `QIKINK_CLIENT_SECRET`.
5. **Cashfree** > Developers > Webhooks: `https://YOUR-WORKER-URL/api/cashfree/webhook`.
6. Test in sandbox. For live: `CASHFREE_ENV = "production"`, `QIKINK_ENV = "live"` in `wrangler.toml`, plus live keys.
   Add a Cloudflare rate-limiting rule for `/api/*`.

## Check before launch
- The Qikink order call follows a developer write-up, not an official page. Place one test order and compare with Qikink's docs.
- Policy pages (Returns, Contact, Privacy, Terms) are placeholders in `public/index.html`.
- Not included: wishlist, refunds, account deletion.
