const enc = new TextEncoder();
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ub64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hkey = (secret, use) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, use);
export async function signSession(obj, secret, ttl = 604800) {
  if (!secret) throw new Error('missing_secret');
  const body = b64u(enc.encode(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttl })));
  return body + '.' + b64u(await crypto.subtle.sign('HMAC', await hkey(secret, ['sign']), enc.encode(body)));
}
async function verifySession(tok, secret) {
  if (!tok || !secret) return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hkey(secret, ['verify']), ub64u(sig), enc.encode(body)))) return null;
    const o = JSON.parse(new TextDecoder().decode(ub64u(body)));
    return o.exp > Date.now() / 1000 ? o : null;
  } catch { return null; }
}
const cookies = req => Object.fromEntries((req.headers.get('cookie') || '').split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
const cookie = (n, v, max) => `${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}`;
const sessionOf = (request, env) => verifySession(cookies(request).s404, env.SESSION_SECRET);

const API_VERSION = '2025-01-01';
const SHIPPING = { threshold: 2000, fee: 69 };       // ₹0 up to the threshold, ₹fee above it
const SIZES = ['S', 'M', 'L', 'XL'];
// Replace each REPLACE-… SKU with the exact SKU from Qikink > My Products (one per size).
const sk = c => Object.fromEntries(SIZES.map(s => [s, `REPLACE-${c}-${s}`]));
const PRODUCTS = [
  // image: paste a photo/mockup URL (https://…) or leave '' for a plain tile. category: shown as a small label.
  { id: '404-tee-black', name: 'ESSENTIAL TEE', category: 'T-SHIRTS', description: 'Boxy fit tee in soft, heavy cotton jersey. Black.', price: 799, image: '', skus: sk('BLK-TEE') },
  { id: '404-tee-white', name: 'IDENTITY TEE', category: 'T-SHIRTS', description: 'Clean everyday tee in soft cotton jersey. White.', price: 799, image: '', skus: sk('WHT-TEE') },
  { id: '404-tee-oversized', name: 'OVERSIZED TEE', category: 'T-SHIRTS', description: 'Relaxed oversized silhouette with a dropped shoulder.', price: 899, image: '', skus: sk('OVR-TEE') },
  { id: '404-hoodie-black', name: 'SOCIETY HOODIE', category: 'HOODIES', description: 'Heavyweight brushed fleece hoodie. Black.', price: 1499, image: '', skus: sk('BLK-HOOD') },
  { id: '404-hoodie-grey', name: 'SOCIETY HOODIE', category: 'HOODIES', description: 'Heavyweight brushed fleece hoodie. Grey.', price: 1499, image: '', skus: sk('GRY-HOOD') },
  { id: '404-crew-black', name: 'CREW SWEATSHIRT', category: 'SWEATSHIRTS', description: 'Midweight terry crewneck with a ribbed hem.', price: 1299, image: '', skus: sk('BLK-CREW') }
];

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const same = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const text = (v, a, b) => typeof v === 'string' && v.trim().length >= a && v.trim().length <= b;

export function validAddress(c) {
  return text(c?.firstName, 1, 40) && text(c?.address1, 5, 200) && text(c?.city, 2, 60) && text(c?.province, 2, 60) && /^\d{6}$/.test(c?.zip || '') && /^[6-9]\d{9}$/.test(c?.phone || '');
}
export function validate(p) {
  const c = p?.customer || {}, items = p?.items;
  if (!validAddress(c) || !text(c.email, 5, 120) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email))
    return 'Please check your name, 10-digit phone, address and 6-digit PIN code.';
  if (!Array.isArray(items) || !items.length || items.length > 20) return 'Your bag is empty.';
  for (const i of items) {
    const pr = PRODUCTS.find(x => x.id === i?.id);
    if (!pr || !pr.skus[i.size] || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 10) return 'An item in your bag is invalid.';
  }
  return null;
}
// Prices come only from PRODUCTS above, never from the browser.
export function price(items) {
  const lines = new Map();
  for (const i of items) { const k = i.id + '|' + i.size; lines.set(k, { id: i.id, size: i.size, qty: Math.min(10, (lines.get(k)?.qty || 0) + i.qty) }); }
  const list = [...lines.values()].map(l => { const p = PRODUCTS.find(x => x.id === l.id); return { ...l, name: p.name, price: p.price }; });
  const subtotal = list.reduce((a, i) => a + i.price * i.qty, 0);
  const shipping = subtotal > SHIPPING.threshold ? SHIPPING.fee : 0;
  return { list, subtotal, shipping, total: subtotal + shipping };
}
const addressOf = c => ({ firstName: c.firstName.trim(), lastName: (c.lastName || '').toString().trim().slice(0, 40), phone: c.phone, address1: c.address1.trim(), address2: (c.address2 || '').toString().trim().slice(0, 100), city: c.city.trim(), province: c.province.trim(), zip: c.zip });

async function cashfree(path, env, opts = {}) {
  const base = env.CASHFREE_ENV === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
  const headers = { 'x-client-id': env.CASHFREE_CLIENT_ID, 'x-client-secret': env.CASHFREE_CLIENT_SECRET, 'x-api-version': API_VERSION, accept: 'application/json', 'content-type': 'application/json' };
  return fetch(base + path, { ...opts, headers });
}

async function createOrder(payload, env, origin, user) {
  payload.customer = { ...(payload.customer || {}), email: user.email }; // email always comes from the signed-in Google account
  const err = validate(payload); if (err) throw bad(err);
  const { list, shipping, total } = price(payload.items);
  const id = '404' + crypto.randomUUID().replace(/-/g, '').slice(0, 12); // 15 chars (Qikink limit)
  const customer = { ...addressOf(payload.customer), email: user.email };
  await env.DB.prepare('INSERT INTO orders (id,status,amount,shipping,customer_json,items_json,customer_id) VALUES (?,?,?,?,?,?,?)').bind(id, 'PENDING', total, shipping, JSON.stringify(customer), JSON.stringify(list), user.sub).run();
  await env.DB.prepare('UPDATE customers SET address_json=? WHERE id=?').bind(JSON.stringify(addressOf(payload.customer)), user.sub).run();
  const r = await cashfree('/pg/orders', env, { method: 'POST', body: JSON.stringify({
    order_id: id, order_amount: total, order_currency: 'INR',
    customer_details: { customer_id: 'g_' + String(user.sub).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), customer_name: [customer.firstName, customer.lastName].filter(Boolean).join(' '), customer_email: user.email, customer_phone: customer.phone },
    order_meta: { return_url: `${origin}/?payment=return&order_id={order_id}`, notify_url: `${origin}/api/cashfree/webhook` } }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.payment_session_id) { await env.DB.prepare("UPDATE orders SET status='FAILED',last_error=? WHERE id=?").bind('cashfree ' + r.status, id).run(); throw bad('Payments are unavailable right now.', 502); }
  return { order_id: id, payment_session_id: d.payment_session_id, mode: env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox' };
}

const qbase = env => env.QIKINK_ENV === 'live' ? 'https://api.qikink.com' : 'https://sandbox.qikink.com';
async function qikinkToken(env) {
  const r = await fetch(qbase(env) + '/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ClientId: env.QIKINK_CLIENT_ID, client_secret: env.QIKINK_CLIENT_SECRET }) });
  const d = await r.json().catch(() => ({}));
  if (!d.Accesstoken) throw new Error('qikink_auth_' + r.status);
  return d.Accesstoken;
}
async function sendToQikink(row, env) {
  const cu = JSON.parse(row.customer_json), items = JSON.parse(row.items_json), token = await qikinkToken(env);
  const body = { order_number: row.id, qikink_shipping: '1', gateway: 'Prepaid', total_order_value: String(row.amount),
    line_items: items.map(i => { const p = PRODUCTS.find(x => x.id === i.id); return { search_from_my_products: 1, quantity: String(i.qty), price: String(p.price), sku: p.skus[i.size] }; }),
    shipping_address: { first_name: cu.firstName, last_name: cu.lastName || '-', address1: cu.address1, address2: cu.address2, phone: cu.phone, email: cu.email, city: cu.city, zip: cu.zip, province: cu.province, country_code: 'IN' } };
  const r = await fetch(qbase(env) + '/api/order/create', { method: 'POST', headers: { 'content-type': 'application/json', ClientId: env.QIKINK_CLIENT_ID, Accesstoken: token }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error || d.status === false) throw new Error('qikink_' + r.status + ' ' + JSON.stringify(d).slice(0, 160));
  return String(d.order_id || d.id || d.order_no || 'OK');
}
// Only one request can move PAID -> FULFILLING, so Qikink never gets the same order twice.
async function fulfil(row, env) {
  if (!env.QIKINK_CLIENT_ID || !env.QIKINK_CLIENT_SECRET || row.attempts >= 5) return;
  const claim = await env.DB.prepare("UPDATE orders SET status='FULFILLING',attempts=attempts+1 WHERE id=? AND status='PAID'").bind(row.id).run();
  if (!claim.meta.changes) return;
  try { const qid = await sendToQikink(row, env); await env.DB.prepare("UPDATE orders SET status='FULFILLED',qikink_order_id=?,last_error=NULL WHERE id=?").bind(qid, row.id).run(); }
  catch (e) { console.error(String(e)); await env.DB.prepare("UPDATE orders SET status='PAID',last_error=? WHERE id=?").bind(String(e.message).slice(0, 200), row.id).run(); }
}
// Asks Cashfree directly (never trusts the browser or an unchecked webhook body).
async function settle(id, env) {
  let row = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (!row) return null;
  if (row.status === 'PENDING') {
    const r = await cashfree('/pg/orders/' + encodeURIComponent(id), env, { method: 'GET' });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.order_status === 'PAID' && Math.round(Number(d.order_amount) * 100) === row.amount * 100)
      await env.DB.prepare("UPDATE orders SET status='PAID' WHERE id=? AND status='PENDING'").bind(id).run();
    else if (r.ok && ['EXPIRED', 'TERMINATED'].includes(d.order_status))
      await env.DB.prepare("UPDATE orders SET status='FAILED' WHERE id=? AND status='PENDING'").bind(id).run();
    row = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  }
  if (row.status === 'PAID') { await fulfil(row, env); row = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first(); }
  return row;
}
const publicOrder = r => ({ id: r.id, status: r.status, amount: r.amount, shipping: r.shipping, createdAt: r.created_at, items: JSON.parse(r.items_json).map(i => ({ name: i.name || PRODUCTS.find(p => p.id === i.id)?.name || i.id, size: i.size, qty: i.qty, price: i.price ?? PRODUCTS.find(p => p.id === i.id)?.price ?? 0 })) });

async function googleCallback(request, env, url) {
  const [st, next] = (cookies(request).oas || '').split('.'), clear = cookie('oas', '', 0);
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  if (!code || !state || !st || state !== st) return new Response('Invalid sign-in state. Please try again.', { status: 400, headers: { 'set-cookie': clear } });
  try {
    const t = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: url.origin + '/api/auth/callback', grant_type: 'authorization_code' }) });
    if (!t.ok) throw new Error('google_token_' + t.status);
    const { access_token } = await t.json();
    const p = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: 'Bearer ' + access_token } })).json();
    if (!p.sub || !p.email || p.email_verified !== true) throw new Error('google_unverified_email');
    const user = { sub: String(p.sub), email: p.email, name: p.name || p.email };
    await env.DB.prepare('INSERT INTO customers (id,email,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name').bind(user.sub, user.email, user.name).run();
    const h = new Headers({ location: next === 'checkout' ? '/#/checkout' : '/#/account' });
    h.append('set-cookie', cookie('s404', await signSession(user, env.SESSION_SECRET), 604800)); h.append('set-cookie', clear);
    return new Response(null, { status: 302, headers: h });
  } catch (e) {
    console.error(String(e));
    return new Response('Sign-in failed. Please try again.', { status: 400, headers: { 'set-cookie': clear } });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, post = request.method === 'POST';
    const sameSite = () => request.headers.get('origin') === url.origin;
    try {
      if (path === '/api/products') return json({ shipping: SHIPPING, products: PRODUCTS.map(({ skus, ...p }) => ({ ...p, image: /^https:\/\//.test(p.image) || p.image.startsWith('/') ? p.image : '', sizes: Object.keys(skus) })) });

      if (path === '/api/auth/google') {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) return new Response('Google sign-in is not configured', { status: 503 });
        const state = crypto.randomUUID(), next = url.searchParams.get('next') === 'checkout' ? 'checkout' : 'account';
        const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        g.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/api/auth/callback', response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
        return new Response(null, { status: 302, headers: { location: g.toString(), 'set-cookie': cookie('oas', state + '.' + next, 600) } });
      }
      if (path === '/api/auth/callback') return googleCallback(request, env, url);
      if (path === '/api/auth/me') { const u = await sessionOf(request, env); return json({ user: u ? { name: u.name, email: u.email } : null }); }
      if (path === '/api/auth/logout' && post) {
        if (!sameSite()) return json({ error: 'Forbidden' }, 403);
        return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': cookie('s404', '', 0) } });
      }

      if (path === '/api/cashfree/webhook' && post) {
        const raw = await request.text(), sig = request.headers.get('x-webhook-signature'), ts = request.headers.get('x-webhook-timestamp');
        if (!sig || !ts || !env.CASHFREE_CLIENT_SECRET) return new Response('bad request', { status: 400 });
        const key = await hkey(env.CASHFREE_CLIENT_SECRET, ['sign']);
        const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(ts + raw)))));
        if (!same(mac, sig)) return new Response('invalid signature', { status: 401 });
        let id; try { id = JSON.parse(raw)?.data?.order?.order_id; } catch { return new Response('bad request', { status: 400 }); }
        if (id) await settle(String(id), env);
        return new Response('OK');
      }

      // Everything below needs a signed-in customer and only ever touches that customer's own data.
      if (path.startsWith('/api/')) {
        const user = await sessionOf(request, env);
        if (!user) return json({ error: 'Please sign in.' }, 401);
        if (path === '/api/checkout' && post) {
          if (!sameSite()) return json({ error: 'Forbidden' }, 403);
          return json(await createOrder(await request.json().catch(() => ({})), env, url.origin, user));
        }
        if (path === '/api/account') {
          const c = await env.DB.prepare('SELECT address_json FROM customers WHERE id=?').bind(user.sub).first();
          return json({ user: { name: user.name, email: user.email }, address: c?.address_json ? JSON.parse(c.address_json) : null });
        }
        if (path === '/api/account/address' && post) {
          if (!sameSite()) return json({ error: 'Forbidden' }, 403);
          const a = await request.json().catch(() => ({}));
          if (!validAddress(a)) throw bad('Please check your name, 10-digit phone, address and 6-digit PIN code.');
          const clean = addressOf(a);
          await env.DB.prepare('UPDATE customers SET address_json=? WHERE id=?').bind(JSON.stringify(clean), user.sub).run();
          return json({ address: clean });
        }
        if (path === '/api/orders') {
          const id = url.searchParams.get('id');
          if (id) {
            if (!/^[\w-]{1,50}$/.test(id)) return json({ error: 'Not found' }, 404);
            const row = await env.DB.prepare('SELECT * FROM orders WHERE id=? AND customer_id=?').bind(id, user.sub).first();
            return row ? json({ order: publicOrder(row) }) : json({ error: 'Not found' }, 404);
          }
          const { results } = await env.DB.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 50').bind(user.sub).all();
          return json({ orders: results.map(publicOrder) });
        }
        if (path === '/api/order-status') {
          const id = url.searchParams.get('order_id') || '';
          if (!/^[\w-]{1,50}$/.test(id)) return json({ error: 'order_id required' }, 400);
          const own = await env.DB.prepare('SELECT customer_id FROM orders WHERE id=?').bind(id).first();
          if (!own || own.customer_id !== user.sub) return json({ error: 'Not found' }, 404);
          const row = await settle(id, env);
          return json({ id: row.id, status: row.status, amount: row.amount, shipping: row.shipping });
        }
        return json({ error: 'Not found' }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(String(e));
      return json({ error: e.status ? e.message : 'Something went wrong. Please try again.' }, e.status || 500);
    }
  }
};
