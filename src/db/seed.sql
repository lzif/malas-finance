-- MalasFinance v3 — seed data (spec §5.3).
-- Idempotent: safe to run repeatedly. Categories are dynamic and AI-managed;
-- this only plants the initial tree marked is_seed = true. The AI matches to
-- these first and flags anything genuinely new in the nightly summary.

-- Singleton settings row.
INSERT INTO settings (key) VALUES ('settings')
ON CONFLICT (key) DO NOTHING;

-- Top-level (parent) categories.
-- NOTE: `ON CONFLICT (name, parent_id)` does NOT protect these on re-run —
-- Postgres treats NULL as DISTINCT in a UNIQUE index, so two ('Lainnya', NULL)
-- rows never "conflict" and the seed would duplicate them every run. Guard with
-- WHERE NOT EXISTS instead (version-agnostic; no NULLS NOT DISTINCT needed).
INSERT INTO categories (name, parent_id, is_seed)
SELECT v.name, NULL, true
FROM (VALUES
  ('Makanan & Minuman'),
  ('Rokok & Sejenisnya'),
  ('Transportasi'),
  ('Tagihan'),
  ('Rumah & Kebutuhan Harian'),
  ('Hiburan'),
  ('Pakaian & Penampilan'),
  ('Kesehatan'),
  ('Pendidikan & Skill'),
  ('Sosial'),
  ('Lainnya')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.name = v.name AND c.parent_id IS NULL
);

-- Subcategories, resolved against their parent by name.
INSERT INTO categories (name, parent_id, is_seed)
SELECT sub.name, p.id, true
FROM (VALUES
  ('Makanan & Minuman',        'Makan pokok'),
  ('Makanan & Minuman',        'Jajan'),
  ('Makanan & Minuman',        'Minuman'),
  ('Makanan & Minuman',        'Groceries'),
  ('Rokok & Sejenisnya',       'Rokok'),
  ('Rokok & Sejenisnya',       'Vape/liquid'),
  ('Transportasi',             'Bensin'),
  ('Transportasi',             'Parkir & tol'),
  ('Transportasi',             'Ojol/angkot'),
  ('Tagihan',                  'Listrik'),
  ('Tagihan',                  'WiFi/internet'),
  ('Tagihan',                  'BPJS'),
  ('Tagihan',                  'Pulsa/paket data'),
  ('Rumah & Kebutuhan Harian', 'Toiletries'),
  ('Rumah & Kebutuhan Harian', 'Household'),
  ('Rumah & Kebutuhan Harian', 'Laundry'),
  ('Hiburan',                  'Streaming/langganan'),
  ('Hiburan',                  'Game'),
  ('Hiburan',                  'Nongkrong/hangout'),
  ('Pakaian & Penampilan',     'Pakaian'),
  ('Pakaian & Penampilan',     'Aksesoris'),
  ('Pakaian & Penampilan',     'Grooming'),
  ('Kesehatan',                'Obat'),
  ('Kesehatan',                'Periksa/berobat'),
  ('Pendidikan & Skill',       'Kursus/training'),
  ('Pendidikan & Skill',       'Buku/materi'),
  ('Sosial',                   'Traktir'),
  ('Sosial',                   'Sumbangan/infaq'),
  ('Sosial',                   'Hadiah'),
  ('Lainnya',                  'Uncategorized')
) AS sub(parent_name, name)
JOIN categories p ON p.name = sub.parent_name AND p.parent_id IS NULL
ON CONFLICT (name, parent_id) DO NOTHING;
