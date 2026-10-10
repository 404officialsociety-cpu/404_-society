-- 404 Society admin catalog migration
-- Safe alongside existing orders/customers tables; does not drop historical data.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price > 0),
  image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  size TEXT NOT NULL,
  colour TEXT NOT NULL,
  sku TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, size, colour),
  UNIQUE(sku)
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id, active);

-- Seed current catalog. Replace placeholder SKUs with exact Qikink SKUs before live fulfillment.
INSERT OR IGNORE INTO products (id, name, category, description, price, image, active) VALUES
('404-tee-black', 'ESSENTIAL TEE', 'T-SHIRTS', 'Boxy fit tee in soft, heavy cotton jersey. Black.', 799, '', 1),
('404-tee-white', 'IDENTITY TEE', 'T-SHIRTS', 'Clean everyday tee in soft cotton jersey. White.', 799, '', 1),
('404-tee-oversized', 'OVERSIZED TEE', 'T-SHIRTS', 'Relaxed oversized silhouette with a dropped shoulder.', 899, '', 1),
('404-hoodie-black', 'SOCIETY HOODIE', 'HOODIES', 'Heavyweight brushed fleece hoodie. Black.', 1499, '', 1),
('404-hoodie-grey', 'SOCIETY HOODIE', 'HOODIES', 'Heavyweight brushed fleece hoodie. Grey.', 1499, '', 1),
('404-crew-black', 'CREW SWEATSHIRT', 'SWEATSHIRTS', 'Midweight terry crewneck with a ribbed hem.', 1299, '', 1);

INSERT OR IGNORE INTO product_variants (product_id, size, colour, sku, active)
SELECT p.id, sizes.size,
CASE
  WHEN p.id IN ('404-tee-black','404-hoodie-black','404-crew-black') THEN 'Black'
  WHEN p.id = '404-tee-white' THEN 'White'
  WHEN p.id = '404-hoodie-grey' THEN 'Grey'
  ELSE 'Default'
END,
CASE
  WHEN p.id = '404-tee-black' THEN 'REPLACE-BLK-TEE-' || sizes.size
  WHEN p.id = '404-tee-white' THEN 'REPLACE-WHT-TEE-' || sizes.size
  WHEN p.id = '404-tee-oversized' THEN 'REPLACE-OVR-TEE-' || sizes.size
  WHEN p.id = '404-hoodie-black' THEN 'REPLACE-BLK-HOOD-' || sizes.size
  WHEN p.id = '404-hoodie-grey' THEN 'REPLACE-GRY-HOOD-' || sizes.size
  ELSE 'REPLACE-BLK-CREW-' || sizes.size
END, 1
FROM products p
CROSS JOIN (SELECT 'S' AS size UNION ALL SELECT 'M' UNION ALL SELECT 'L' UNION ALL SELECT 'XL') sizes
WHERE p.id IN ('404-tee-black','404-tee-white','404-tee-oversized','404-hoodie-black','404-hoodie-grey','404-crew-black');
