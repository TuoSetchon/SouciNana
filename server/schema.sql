CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('candidat','recruteur','admin')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  city TEXT,
  domains TEXT DEFAULT '',
  categories TEXT DEFAULT 'ci,onu,canada',
  company TEXT,
  status TEXT NOT NULL DEFAULT 'en_attente',
  sub_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  employer TEXT NOT NULL,
  location TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('ci','onu','canada')),
  domain TEXT NOT NULL DEFAULT 'Autre',
  contract TEXT,
  salary TEXT,
  deadline DATE,
  description TEXT,
  requirements TEXT,
  apply_url TEXT,
  source TEXT,
  recruiter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  accepts_bonpro BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'publiee',
  views INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offers_status_idx ON offers(status, published_at DESC);

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  cv_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'recue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offer_id, user_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  formula TEXT NOT NULL,
  express BOOLEAN NOT NULL DEFAULT false,
  price INTEGER NOT NULL,
  offer_url TEXT,
  offer_text TEXT,
  notes TEXT,
  cv_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  photo_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  delivered_file_ids TEXT DEFAULT '',
  admin_note TEXT,
  status TEXT NOT NULL DEFAULT 'en_attente_paiement',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('abonnement','commande','offre')),
  ref_id INTEGER,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  transaction_ref TEXT,
  payer_phone TEXT,
  proof_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'en_attente',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
