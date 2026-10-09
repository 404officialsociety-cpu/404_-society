CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL,
 amount INTEGER NOT NULL,
 customer_json TEXT NOT NULL,
 items_json TEXT NOT NULL,
 qikink_order_id TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
