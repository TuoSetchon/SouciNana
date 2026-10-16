// BonPro — serveur principal (API + fichiers de l'application PWA)
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const helmet = require('helmet');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------- constantes
const CATEGORIES = { ci: 'Côte d’Ivoire', onu: 'Nations Unies & partenaires', canada: 'Canada' };
const DOMAINS = ['Ressources humaines', 'Administration & Gestion', 'Comptabilité & Finance', 'Éducation & Formation',
  'Santé', 'BTP & Génie civil', 'Informatique & Numérique', 'Commerce & Marketing', 'Agriculture & Agro-industrie',
  'Logistique & Transport', 'Social & Humanitaire', 'Juridique', 'Communication & Médias', 'Autre'];
const DEFAULT_SETTINGS = {
  sub_price: '500',
  sub_days: '30',
  pay_wave: '07 08 50 77 12',
  pay_orange: '07 08 50 77 12',
  whatsapp: '07 88 58 92 31',
  recruiter_offer_price: '5000',
  recruiter_offer_days: '30',
  subscriber_discount: '20',
  formulas: JSON.stringify([
    { id: 'essentiel', name: 'Essentiel', price: 2000, desc: 'CV refait et adapté à 1 offre (Word + PDF), livré en 24 h' },
    { id: 'candidature', name: 'Candidature', price: 5000, desc: 'CV adapté + lettre de motivation + message au recruteur pour 1 offre' },
    { id: 'pack3', name: 'Pack 3 offres', price: 10000, desc: '3 dossiers complets pour 3 offres différentes, livrés en 48 h' },
    { id: 'carriere', name: 'Pack Carrière', price: 25000, desc: 'CV de base refait + jusqu’à 5 dossiers en 1 mois + offres repérées pour vous' },
  ]),
  express_price: '2000',
};
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

// ---------------------------------------------------------------- utilitaires
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => new HttpError(400, msg);
const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^00225/, '').replace(/^225(?=\d{10}$)/, '');
const clean = (s, max = 2000) => (s == null ? null : String(s).trim().slice(0, max) || null);
const money = (n) => Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';

let SETTINGS = {};
async function loadSettings() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
  const rows = await db.q('SELECT key, value FROM settings');
  SETTINGS = Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
const setting = (k) => SETTINGS[k] ?? DEFAULT_SETTINGS[k];
const formulas = () => { try { return JSON.parse(setting('formulas')); } catch { return JSON.parse(DEFAULT_SETTINGS.formulas); } };

async function secretValue(key, gen) {
  const row = await db.one('SELECT value FROM settings WHERE key=$1', [key]);
  if (row) return row.value;
  const v = gen();
  await db.q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', [key, v]);
  return (await db.one('SELECT value FROM settings WHERE key=$1', [key])).value;
}

let JWT_SECRET;
let API_KEY;
let VAPID_PUBLIC = null;

// ---------------------------------------------------------------- utilisateurs
function publicUser(u) {
  if (!u) return null;
  const active = isActive(u);
  return {
    id: u.id, role: u.role, name: u.name, phone: u.phone, email: u.email, city: u.city,
    domains: (u.domains || '').split('|').filter(Boolean),
    categories: (u.categories || '').split(',').filter(Boolean),
    company: u.company, status: effectiveStatus(u), sub_until: u.sub_until, active, created_at: u.created_at,
  };
}
function isActive(u) {
  if (!u) return false;
  if (u.role === 'admin' || u.role === 'recruteur') return u.status !== 'suspendu';
  return u.status === 'actif' && u.sub_until && new Date(u.sub_until) > new Date();
}
function effectiveStatus(u) {
  if (u.role !== 'candidat') return u.status === 'suspendu' ? 'suspendu' : 'actif';
  if (u.status === 'suspendu') return 'suspendu';
  if (u.status === 'actif' && u.sub_until && new Date(u.sub_until) <= new Date()) return 'expire';
  return u.status;
}

function setSession(res, user) {
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '60d' });
  res.cookie('bp_session', token, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 60 * 24 * 3600 * 1000 });
}

const auth = ah(async (req, res, next) => {
  const token = req.cookies.bp_session;
  if (token) {
    try {
      const { uid } = jwt.verify(token, JWT_SECRET);
      req.user = await db.one('SELECT * FROM users WHERE id=$1', [uid]);
    } catch { /* session invalide */ }
  }
  next();
});
const needUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Connectez-vous pour continuer.')));
const needRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Connectez-vous pour continuer.'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Accès réservé.'));
  if (req.user.status === 'suspendu') return next(new HttpError(403, 'Compte suspendu. Contactez BonPro.'));
  next();
};
const needActiveCandidate = (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Connectez-vous pour continuer.'));
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'candidat') return next(new HttpError(403, 'Réservé aux candidats.'));
  if (!isActive(req.user)) return next(new HttpError(402, 'Votre abonnement n’est pas actif. Faites votre dépôt pour activer votre compte.'));
  next();
};

// petite limite anti-force brute sur la connexion
const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length >= 10) throw new HttpError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
  a.push(now); attempts.set(key, a);
}

// ---------------------------------------------------------------- fichiers
const ALLOWED = {
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(bad('Format non accepté. Envoyez un PDF, un Word ou une image (JPG, PNG).'))),
});
async function saveFile(ownerId, f) {
  if (!f) return null;
  const name = f.originalname.replace(/[^\w.\- ()àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ']/g, '_').slice(0, 120);
  const row = await db.one('INSERT INTO files(owner_id,name,mime,size,data) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [ownerId, name, f.mimetype, f.size, f.buffer]);
  return row.id;
}

// ---------------------------------------------------------------- notifications
async function notify(userId, title, body, link) {
  await db.q('INSERT INTO notifications(user_id,title,body,link) VALUES($1,$2,$3,$4)', [userId, title, body || null, link || null]);
  if (!VAPID_PUBLIC) return;
  const subs = await db.q('SELECT id, data FROM push_subs WHERE user_id=$1', [userId]);
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.data), JSON.stringify({ title, body, link }));
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db.q('DELETE FROM push_subs WHERE id=$1', [s.id]);
    }
  }
}
async function notifyAdmins(title, body, link) {
  const admins = await db.q("SELECT id FROM users WHERE role='admin'");
  for (const a of admins) await notify(a.id, title, body, link);
}
async function announceOffer(offer) {
  const cands = await db.q("SELECT * FROM users WHERE role='candidat' AND status='actif' AND sub_until > now()");
  let n = 0;
  for (const u of cands) {
    const cats = (u.categories || '').split(',').filter(Boolean);
    const doms = (u.domains || '').split('|').filter(Boolean);
    if (cats.length && !cats.includes(offer.category)) continue;
    if (doms.length && !doms.includes(offer.domain)) continue;
    await notify(u.id, `Nouvelle offre : ${offer.title}`, `${offer.employer} · ${offer.location}`, `#/offre/${offer.id}`);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- application
const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(auth);

const api = express.Router();

// ----- informations publiques
api.get('/config', (req, res) => {
  res.json({
    categories: CATEGORIES, domains: DOMAINS,
    sub_price: +setting('sub_price'), sub_days: +setting('sub_days'),
    pay_wave: setting('pay_wave'), pay_orange: setting('pay_orange'), whatsapp: setting('whatsapp'),
    recruiter_offer_price: +setting('recruiter_offer_price'), recruiter_offer_days: +setting('recruiter_offer_days'),
    subscriber_discount: +setting('subscriber_discount'), formulas: formulas(), express_price: +setting('express_price'),
    vapid_public: VAPID_PUBLIC,
  });
});

// ----- comptes
api.post('/auth/register', ah(async (req, res) => {
  const b = req.body || {};
  const role = b.role === 'recruteur' ? 'recruteur' : 'candidat';
  const name = clean(b.name, 120);
  const phone = normPhone(b.phone);
  const password = String(b.password || '');
  if (!name) throw bad('Indiquez votre nom complet.');
  if (phone.length < 8 || phone.length > 15) throw bad('Numéro de téléphone invalide.');
  if (password.length < 6) throw bad('Le mot de passe doit faire au moins 6 caractères.');
  if (role === 'recruteur' && !clean(b.company)) throw bad('Indiquez le nom de votre entreprise ou organisation.');
  if (await db.one('SELECT id FROM users WHERE phone=$1', [phone])) throw bad('Un compte existe déjà avec ce numéro. Connectez-vous.');
  const domains = (Array.isArray(b.domains) ? b.domains : []).filter((d) => DOMAINS.includes(d)).join('|');
  const cats = (Array.isArray(b.categories) ? b.categories : Object.keys(CATEGORIES)).filter((c) => CATEGORIES[c]).join(',') || 'ci,onu,canada';
  const hash = await bcrypt.hash(password, 10);
  const u = await db.one(`INSERT INTO users(role,name,phone,email,password_hash,city,domains,categories,company,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
  [role, name, phone, clean(b.email, 160), hash, clean(b.city, 80), domains, cats, clean(b.company, 160), role === 'candidat' ? 'en_attente' : 'actif']);
  setSession(res, u);
  await notifyAdmins(role === 'candidat' ? 'Nouvelle inscription candidat' : 'Nouveau recruteur inscrit', `${u.name} · ${u.phone}`, '#/admin/utilisateurs');
  res.json({ user: publicUser(u) });
}));

api.post('/auth/login', ah(async (req, res) => {
  const phone = normPhone(req.body?.phone);
  throttle(req.ip + ':' + phone);
  const u = await db.one('SELECT * FROM users WHERE phone=$1', [phone]);
  if (!u || !(await bcrypt.compare(String(req.body?.password || ''), u.password_hash))) throw bad('Numéro ou mot de passe incorrect.');
  setSession(res, u);
  res.json({ user: publicUser(u) });
}));

api.post('/auth/logout', (req, res) => { res.clearCookie('bp_session'); res.json({ ok: true }); });

api.get('/me', ah(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const unread = await db.one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT read', [req.user.id]);
  res.json({ user: publicUser(req.user), unread: unread.n });
}));

api.put('/me', needUser, ah(async (req, res) => {
  const b = req.body || {};
  const domains = (Array.isArray(b.domains) ? b.domains : []).filter((d) => DOMAINS.includes(d)).join('|');
  const cats = (Array.isArray(b.categories) ? b.categories : []).filter((c) => CATEGORIES[c]).join(',') || 'ci,onu,canada';
  const name = clean(b.name, 120) || req.user.name;
  const u = await db.one(`UPDATE users SET name=$1, email=$2, city=$3, domains=$4, categories=$5, company=COALESCE($6, company)
     WHERE id=$7 RETURNING *`, [name, clean(b.email, 160), clean(b.city, 80), domains, cats, clean(b.company, 160), req.user.id]);
  if (b.new_password) {
    if (String(b.new_password).length < 6) throw bad('Le nouveau mot de passe doit faire au moins 6 caractères.');
    if (!(await bcrypt.compare(String(b.current_password || ''), req.user.password_hash))) throw bad('Mot de passe actuel incorrect.');
    await db.q('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(b.new_password), 10), req.user.id]);
  }
  res.json({ user: publicUser(u) });
}));

// ----- offres
function offerOut(o, full) {
  const base = {
    id: o.id, title: o.title, employer: o.employer, location: o.location, category: o.category, domain: o.domain,
    contract: o.contract, salary: o.salary, deadline: o.deadline, published_at: o.published_at,
    accepts_bonpro: o.accepts_bonpro, from_recruiter: !!o.recruiter_id,
  };
  if (full) Object.assign(base, { description: o.description, requirements: o.requirements, apply_url: o.apply_url, source: o.source });
  return base;
}
const OPEN = "status='publiee' AND (deadline IS NULL OR deadline >= CURRENT_DATE)";

api.get('/offers', ah(async (req, res) => {
  const where = [OPEN]; const p = [];
  if (CATEGORIES[req.query.category]) { p.push(req.query.category); where.push(`category=$${p.length}`); }
  if (DOMAINS.includes(req.query.domain)) { p.push(req.query.domain); where.push(`domain=$${p.length}`); }
  if (req.query.q) {
    p.push('%' + String(req.query.q).slice(0, 60).toLowerCase() + '%');
    where.push(`(lower(title) LIKE $${p.length} OR lower(employer) LIKE $${p.length} OR lower(location) LIKE $${p.length})`);
  }
  if (req.query.mine === '1' && req.user?.role === 'candidat') {
    const cats = (req.user.categories || '').split(',').filter(Boolean);
    const doms = (req.user.domains || '').split('|').filter(Boolean);
    if (cats.length) { p.push(cats); where.push(`category = ANY($${p.length})`); }
    if (doms.length) { p.push(doms); where.push(`domain = ANY($${p.length})`); }
  }
  const page = Math.max(0, parseInt(req.query.page || '0', 10) || 0);
  const rows = await db.q(`SELECT * FROM offers WHERE ${where.join(' AND ')} ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 30 OFFSET ${page * 30}`, p);
  const total = await db.one(`SELECT count(*)::int AS n FROM offers WHERE ${where.join(' AND ')}`, p);
  res.json({ offers: rows.map((o) => offerOut(o, false)), total: total.n, page });
}));

api.get('/offers/:id', ah(async (req, res) => {
  const o = await db.one('SELECT * FROM offers WHERE id=$1', [+req.params.id || 0]);
  const owner = req.user && (req.user.role === 'admin' || o?.recruiter_id === req.user.id);
  if (!o || (o.status !== 'publiee' && !owner)) throw new HttpError(404, 'Offre introuvable.');
  await db.q('UPDATE offers SET views=views+1 WHERE id=$1', [o.id]);
  const unlocked = owner || isActive(req.user) && req.user.role === 'candidat';
  let applied = false;
  if (req.user?.role === 'candidat') applied = !!(await db.one('SELECT id FROM applications WHERE offer_id=$1 AND user_id=$2', [o.id, req.user.id]));
  res.json({ offer: offerOut(o, unlocked), locked: !unlocked, applied });
}));

api.post('/offers/:id/apply', needActiveCandidate, upload.single('cv'), ah(async (req, res) => {
  const o = await db.one(`SELECT * FROM offers WHERE id=$1 AND ${OPEN}`, [+req.params.id || 0]);
  if (!o || !o.accepts_bonpro) throw bad('Cette offre ne reçoit pas de candidatures via BonPro.');
  if (!req.file) throw bad('Joignez votre CV.');
  if (await db.one('SELECT id FROM applications WHERE offer_id=$1 AND user_id=$2', [o.id, req.user.id])) throw bad('Vous avez déjà postulé à cette offre.');
  const fid = await saveFile(req.user.id, req.file);
  await db.q('INSERT INTO applications(offer_id,user_id,message,cv_file_id) VALUES($1,$2,$3,$4)', [o.id, req.user.id, clean(req.body.message, 2000), fid]);
  if (o.recruiter_id) await notify(o.recruiter_id, `Nouvelle candidature : ${o.title}`, req.user.name, `#/recruteur/offre/${o.id}`);
  res.json({ ok: true });
}));

api.get('/applications/mine', needRole('candidat'), ah(async (req, res) => {
  res.json({ applications: await db.q(`SELECT a.id, a.offer_id, a.status, a.created_at, o.title FROM applications a JOIN offers o ON o.id=a.offer_id
    WHERE a.user_id=$1 ORDER BY a.id DESC`, [req.user.id]) });
}));

// ----- paiements (dépôts Wave / Orange Money)
async function amountFor(kind, refId, user) {
  if (kind === 'abonnement') return +setting('sub_price');
  if (kind === 'commande') {
    const o = await db.one('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [refId, user.id]);
    if (!o) throw bad('Commande introuvable.');
    if (o.status !== 'en_attente_paiement') throw bad('Cette commande est déjà payée.');
    return o.price;
  }
  if (kind === 'offre') {
    const o = await db.one('SELECT * FROM offers WHERE id=$1 AND recruiter_id=$2', [refId, user.id]);
    if (!o) throw bad('Offre introuvable.');
    if (o.status !== 'en_attente_paiement') throw bad('Cette offre est déjà réglée.');
    return +setting('recruiter_offer_price');
  }
  throw bad('Type de paiement inconnu.');
}

api.post('/payments', needUser, upload.single('proof'), ah(async (req, res) => {
  const b = req.body || {};
  const kind = String(b.kind);
  if (kind === 'abonnement' && req.user.role !== 'candidat') throw bad('L’abonnement concerne les candidats.');
  const refId = b.ref_id ? +b.ref_id : null;
  const method = b.method === 'orange' ? 'orange' : 'wave';
  const tx = clean(b.transaction_ref, 80);
  if (!tx && !req.file) throw bad('Indiquez la référence de la transaction ou joignez la capture du paiement.');
  const pending = await db.one(`SELECT id FROM payments WHERE user_id=$1 AND kind=$2 AND COALESCE(ref_id,0)=$3 AND status='en_attente'`,
    [req.user.id, kind, refId || 0]);
  if (pending) throw bad('Un dépôt est déjà en cours de vérification. Patientez, vous serez notifié.');
  const amount = await amountFor(kind, refId, req.user);
  const fid = await saveFile(req.user.id, req.file);
  const p = await db.one(`INSERT INTO payments(user_id,kind,ref_id,amount,method,transaction_ref,payer_phone,proof_file_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [req.user.id, kind, refId, amount, method, tx, normPhone(b.payer_phone) || null, fid]);
  const label = { abonnement: 'Abonnement', commande: 'Commande de CV', offre: 'Publication d’offre' }[kind];
  await notifyAdmins(`Dépôt à vérifier : ${money(amount)}`, `${label} · ${req.user.name} · ${method === 'wave' ? 'Wave' : 'Orange Money'}${tx ? ' · réf. ' + tx : ''}`, '#/admin/paiements');
  res.json({ payment: p });
}));

api.get('/payments/mine', needUser, ah(async (req, res) => {
  res.json({ payments: await db.q('SELECT id,kind,ref_id,amount,method,transaction_ref,status,note,created_at,validated_at FROM payments WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [req.user.id]) });
}));

// ----- commandes de CV
api.post('/orders', needActiveCandidate, upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), ah(async (req, res) => {
  const b = req.body || {};
  const f = formulas().find((x) => x.id === b.formula);
  if (!f) throw bad('Choisissez une formule.');
  if (!clean(b.offer_url) && !clean(b.offer_text) && f.id !== 'carriere') throw bad('Indiquez l’offre visée (lien ou texte de l’annonce).');
  const express = b.express === 'true' || b.express === true;
  const discount = isActive(req.user) ? +setting('subscriber_discount') : 0;
  const price = Math.round((f.price * (100 - discount)) / 100 / 50) * 50 + (express ? +setting('express_price') : 0);
  const cv = await saveFile(req.user.id, req.files?.cv?.[0]);
  const photo = await saveFile(req.user.id, req.files?.photo?.[0]);
  const o = await db.one(`INSERT INTO orders(user_id,formula,express,price,offer_url,offer_text,notes,cv_file_id,photo_file_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
  [req.user.id, f.id, express, price, clean(b.offer_url, 600), clean(b.offer_text, 8000), clean(b.notes, 3000), cv, photo]);
  await notifyAdmins(`Nouvelle commande : ${f.name}`, `${req.user.name} · ${money(price)} · en attente de paiement`, `#/admin/commande/${o.id}`);
  res.json({ order: o });
}));

function orderOut(o) {
  const f = formulas().find((x) => x.id === o.formula);
  return { ...o, formula_name: f ? f.name : o.formula, delivered_file_ids: (o.delivered_file_ids || '').split(',').filter(Boolean).map(Number) };
}
api.get('/orders/mine', needUser, ah(async (req, res) => {
  const rows = await db.q('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [req.user.id]);
  const files = await db.q('SELECT id,name FROM files WHERE owner_id IN (SELECT id FROM users WHERE role=\'admin\') AND id = ANY($1)',
    [rows.flatMap((o) => (o.delivered_file_ids || '').split(',').filter(Boolean).map(Number))]);
  res.json({ orders: rows.map(orderOut), files });
}));

// ----- recruteurs
api.post('/recruiter/offers', needRole('recruteur'), ah(async (req, res) => {
  const b = req.body || {};
  const o = offerFromBody(b);
  const row = await db.one(`INSERT INTO offers(title,employer,location,category,domain,contract,salary,deadline,description,requirements,apply_url,source,recruiter_id,accepts_bonpro,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'en_attente_paiement') RETURNING *`,
  [o.title, o.employer || req.user.company || req.user.name, o.location, o.category, o.domain, o.contract, o.salary, o.deadline,
    o.description, o.requirements, o.apply_url, 'Recruteur BonPro', req.user.id]);
  res.json({ offer: row });
}));
api.get('/recruiter/offers', needRole('recruteur'), ah(async (req, res) => {
  const rows = await db.q(`SELECT o.*, (SELECT count(*)::int FROM applications a WHERE a.offer_id=o.id) AS applications
    FROM offers o WHERE recruiter_id=$1 ORDER BY id DESC`, [req.user.id]);
  res.json({ offers: rows });
}));
api.get('/recruiter/offers/:id/applications', needRole('recruteur', 'admin'), ah(async (req, res) => {
  const o = await db.one('SELECT * FROM offers WHERE id=$1', [+req.params.id || 0]);
  if (!o || (req.user.role !== 'admin' && o.recruiter_id !== req.user.id)) throw new HttpError(404, 'Offre introuvable.');
  const rows = await db.q(`SELECT a.id, a.message, a.cv_file_id, a.status, a.created_at, u.name, u.phone, u.email, u.city
    FROM applications a JOIN users u ON u.id=a.user_id WHERE a.offer_id=$1 ORDER BY a.id DESC`, [o.id]);
  res.json({ offer: o, applications: rows });
}));
api.put('/recruiter/applications/:id', needRole('recruteur', 'admin'), ah(async (req, res) => {
  const a = await db.one('SELECT a.*, o.recruiter_id, o.title FROM applications a JOIN offers o ON o.id=a.offer_id WHERE a.id=$1', [+req.params.id || 0]);
  if (!a || (req.user.role !== 'admin' && a.recruiter_id !== req.user.id)) throw new HttpError(404, 'Candidature introuvable.');
  const status = ['recue', 'retenue', 'non_retenue'].includes(req.body?.status) ? req.body.status : 'recue';
  await db.q('UPDATE applications SET status=$1 WHERE id=$2', [status, a.id]);
  if (status === 'retenue') await notify(a.user_id, 'Votre candidature a été retenue 🎉', `${a.title} : le recruteur va vous contacter.`, '#/compte');
  res.json({ ok: true });
}));

function offerFromBody(b) {
  const o = {
    title: clean(b.title, 160), employer: clean(b.employer, 160), location: clean(b.location, 120),
    category: CATEGORIES[b.category] ? b.category : 'ci', domain: DOMAINS.includes(b.domain) ? b.domain : 'Autre',
    contract: clean(b.contract, 60), salary: clean(b.salary, 80), deadline: /^\d{4}-\d{2}-\d{2}$/.test(b.deadline || '') ? b.deadline : null,
    description: clean(b.description, 12000), requirements: clean(b.requirements, 6000), apply_url: clean(b.apply_url, 600),
    source: clean(b.source, 120),
  };
  if (!o.title) throw bad('Indiquez l’intitulé du poste.');
  if (!o.location) throw bad('Indiquez le lieu de travail.');
  if (o.apply_url && !/^https?:\/\//i.test(o.apply_url) && !/^mailto:/i.test(o.apply_url)) throw bad('Le lien pour postuler doit commencer par http:// ou https://');
  return o;
}

// ----- fichiers (téléchargement protégé)
api.get('/files/:id', needUser, ah(async (req, res) => {
  const f = await db.one('SELECT * FROM files WHERE id=$1', [+req.params.id || 0]);
  if (!f) throw new HttpError(404, 'Fichier introuvable.');
  let allowed = req.user.role === 'admin' || f.owner_id === req.user.id;
  if (!allowed) {
    const viaApp = await db.one(`SELECT a.id FROM applications a JOIN offers o ON o.id=a.offer_id WHERE a.cv_file_id=$1 AND o.recruiter_id=$2`, [f.id, req.user.id]);
    const viaOrder = await db.one(`SELECT id FROM orders WHERE user_id=$1 AND (','||delivered_file_ids||',') LIKE $2`, [req.user.id, `%,${f.id},%`]);
    allowed = !!(viaApp || viaOrder);
  }
  if (!allowed) throw new HttpError(403, 'Accès refusé.');
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(f.data);
}));

// ----- notifications
api.get('/notifications', needUser, ah(async (req, res) => {
  const rows = await db.q('SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 60', [req.user.id]);
  await db.q('UPDATE notifications SET read=true WHERE user_id=$1 AND NOT read', [req.user.id]);
  res.json({ notifications: rows });
}));
api.post('/push/subscribe', needUser, ah(async (req, res) => {
  const s = req.body?.subscription;
  if (!s?.endpoint) throw bad('Abonnement aux notifications invalide.');
  await db.q(`INSERT INTO push_subs(user_id,endpoint,data) VALUES($1,$2,$3)
    ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, data=EXCLUDED.data`, [req.user.id, s.endpoint, JSON.stringify(s)]);
  res.json({ ok: true });
}));

// ================================================================ ADMIN
const admin = express.Router();
admin.use(needRole('admin'));

admin.get('/stats', ah(async (req, res) => {
  const s = await db.one(`SELECT
    (SELECT count(*)::int FROM users WHERE role='candidat') AS candidats,
    (SELECT count(*)::int FROM users WHERE role='candidat' AND status='actif' AND sub_until > now()) AS abonnes_actifs,
    (SELECT count(*)::int FROM users WHERE role='candidat' AND (status='en_attente' OR (status='actif' AND sub_until <= now()))) AS en_attente,
    (SELECT count(*)::int FROM users WHERE role='recruteur') AS recruteurs,
    (SELECT count(*)::int FROM offers WHERE ${OPEN}) AS offres_ouvertes,
    (SELECT count(*)::int FROM payments WHERE status='en_attente') AS paiements_a_verifier,
    (SELECT count(*)::int FROM orders WHERE status IN ('payee','en_cours')) AS commandes_a_traiter,
    (SELECT count(*)::int FROM offers WHERE status='en_attente_validation') AS offres_a_valider,
    (SELECT COALESCE(sum(amount),0)::int FROM payments WHERE status='valide' AND validated_at >= date_trunc('month', now())) AS encaisse_mois`);
  res.json({ stats: s });
}));

admin.get('/payments', ah(async (req, res) => {
  const status = ['en_attente', 'valide', 'rejete'].includes(req.query.status) ? req.query.status : 'en_attente';
  const rows = await db.q(`SELECT p.*, u.name, u.phone, u.role FROM payments p JOIN users u ON u.id=p.user_id
    WHERE p.status=$1 ORDER BY p.id ${status === 'en_attente' ? 'ASC' : 'DESC'} LIMIT 200`, [status]);
  res.json({ payments: rows });
}));

admin.post('/payments/:id/validate', ah(async (req, res) => {
  const p = await db.one("SELECT * FROM payments WHERE id=$1 AND status='en_attente'", [+req.params.id || 0]);
  if (!p) throw bad('Paiement introuvable ou déjà traité.');
  await db.q("UPDATE payments SET status='valide', validated_at=now(), note=$2 WHERE id=$1", [p.id, clean(req.body?.note, 300)]);
  if (p.kind === 'abonnement') {
    const days = +setting('sub_days');
    const u = await db.one(`UPDATE users SET status='actif',
      sub_until = GREATEST(COALESCE(sub_until, now()), now()) + ($2 || ' days')::interval WHERE id=$1 RETURNING *`, [p.user_id, String(days)]);
    await notify(p.user_id, 'Votre compte BonPro est activé ✅', `Abonnement valable jusqu’au ${new Date(u.sub_until).toLocaleDateString('fr-FR')}.`, '#/compte');
  } else if (p.kind === 'commande') {
    await db.q("UPDATE orders SET status='payee' WHERE id=$1 AND status='en_attente_paiement'", [p.ref_id]);
    await notify(p.user_id, 'Paiement de votre commande reçu ✅', 'Votre dossier est en préparation. Vous serez notifié à la livraison.', '#/commandes');
  } else if (p.kind === 'offre') {
    await db.q("UPDATE offers SET status='en_attente_validation' WHERE id=$1 AND status='en_attente_paiement'", [p.ref_id]);
    await notify(p.user_id, 'Paiement reçu pour votre offre ✅', 'Votre offre est en cours de vérification avant publication.', '#/recruteur');
  }
  res.json({ ok: true });
}));

admin.post('/payments/:id/reject', ah(async (req, res) => {
  const p = await db.one("SELECT * FROM payments WHERE id=$1 AND status='en_attente'", [+req.params.id || 0]);
  if (!p) throw bad('Paiement introuvable ou déjà traité.');
  const note = clean(req.body?.note, 300) || 'Dépôt introuvable sur notre compte.';
  await db.q("UPDATE payments SET status='rejete', validated_at=now(), note=$2 WHERE id=$1", [p.id, note]);
  await notify(p.user_id, 'Dépôt non confirmé', `${note} Vérifiez la référence et renvoyez votre preuve de paiement.`,
    p.kind === 'abonnement' ? '#/abonnement' : p.kind === 'commande' ? '#/commandes' : '#/recruteur');
  res.json({ ok: true });
}));

admin.get('/users', ah(async (req, res) => {
  const p = []; const where = [];
  if (['candidat', 'recruteur', 'admin'].includes(req.query.role)) { p.push(req.query.role); where.push(`role=$${p.length}`); }
  if (req.query.q) { p.push('%' + String(req.query.q).toLowerCase() + '%'); where.push(`(lower(name) LIKE $${p.length} OR phone LIKE $${p.length} OR lower(COALESCE(company,'')) LIKE $${p.length})`); }
  const rows = await db.q(`SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`, p);
  res.json({ users: rows.map(publicUser) });
}));

admin.post('/users/:id/subscription', ah(async (req, res) => {
  const days = parseInt(req.body?.days, 10);
  if (!days || Math.abs(days) > 3660) throw bad('Nombre de jours invalide.');
  const u = await db.one(`UPDATE users SET status='actif', sub_until = GREATEST(COALESCE(sub_until, now()), now()) + ($2 || ' days')::interval
    WHERE id=$1 AND role='candidat' RETURNING *`, [+req.params.id, String(days)]);
  if (!u) throw bad('Candidat introuvable.');
  if (days > 0) await notify(u.id, 'Abonnement prolongé ✅', `Valable jusqu’au ${new Date(u.sub_until).toLocaleDateString('fr-FR')}.`, '#/compte');
  res.json({ user: publicUser(u) });
}));

admin.post('/users/:id/status', ah(async (req, res) => {
  const s = req.body?.status === 'suspendu' ? 'suspendu' : 'reactiver';
  const u = await db.one('SELECT * FROM users WHERE id=$1', [+req.params.id]);
  if (!u || u.role === 'admin') throw bad('Utilisateur introuvable.');
  const next = s === 'suspendu' ? 'suspendu' : (u.role === 'candidat' ? (u.sub_until && new Date(u.sub_until) > new Date() ? 'actif' : 'en_attente') : 'actif');
  await db.q('UPDATE users SET status=$1 WHERE id=$2', [next, u.id]);
  res.json({ ok: true });
}));

admin.get('/export/subscribers.csv', ah(async (req, res) => {
  const rows = await db.q("SELECT name, phone, email, city, categories, domains, sub_until FROM users WHERE role='candidat' AND status='actif' AND sub_until > now() ORDER BY name");
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Nom;Téléphone;E-mail;Ville;Catégories;Domaines;Fin abonnement']
    .concat(rows.map((r) => [r.name, r.phone, r.email, r.city, r.categories, (r.domains || '').replace(/\|/g, ', '),
      new Date(r.sub_until).toLocaleDateString('fr-FR')].map(esc).join(';'))).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="abonnes-bonpro.csv"');
  res.send('﻿' + csv);
}));

admin.get('/offers', ah(async (req, res) => {
  const p = []; const where = [];
  if (req.query.status) { p.push(String(req.query.status)); where.push(`o.status=$${p.length}`); }
  const rows = await db.q(`SELECT o.*, u.company AS recruiter_company, (SELECT count(*)::int FROM applications a WHERE a.offer_id=o.id) AS applications
    FROM offers o LEFT JOIN users u ON u.id=o.recruiter_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 300`, p);
  res.json({ offers: rows });
}));
admin.get('/offers/:id', ah(async (req, res) => {
  res.json({ offer: await db.one('SELECT * FROM offers WHERE id=$1', [+req.params.id]) });
}));
admin.post('/offers', ah(async (req, res) => {
  const o = offerFromBody(req.body || {});
  if (!o.employer) throw bad('Indiquez l’employeur.');
  const publish = req.body.status !== 'brouillon';
  const row = await db.one(`INSERT INTO offers(title,employer,location,category,domain,contract,salary,deadline,description,requirements,apply_url,source,accepts_bonpro,status,published_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14) RETURNING *`,
  [o.title, o.employer, o.location, o.category, o.domain, o.contract, o.salary, o.deadline, o.description, o.requirements, o.apply_url, o.source,
    publish ? 'publiee' : 'brouillon', publish ? new Date() : null]);
  const notified = publish ? await announceOffer(row) : 0;
  res.json({ offer: row, notified });
}));
admin.put('/offers/:id', ah(async (req, res) => {
  const cur = await db.one('SELECT * FROM offers WHERE id=$1', [+req.params.id]);
  if (!cur) throw new HttpError(404, 'Offre introuvable.');
  const o = offerFromBody({ ...cur, ...req.body });
  const status = ['brouillon', 'publiee', 'expiree', 'refusee', 'en_attente_paiement', 'en_attente_validation'].includes(req.body.status) ? req.body.status : cur.status;
  const publishing = status === 'publiee' && cur.status !== 'publiee';
  let row = await db.one(`UPDATE offers SET title=$1,employer=$2,location=$3,category=$4,domain=$5,contract=$6,salary=$7,deadline=$8,description=$9,
    requirements=$10,apply_url=$11,source=$12,status=$13, published_at = CASE WHEN $14 THEN now() ELSE published_at END WHERE id=$15 RETURNING *`,
  [o.title, o.employer || cur.employer, o.location, o.category, o.domain, o.contract, o.salary, o.deadline, o.description, o.requirements,
    o.apply_url, o.source, status, publishing, cur.id]);
  let notified = 0;
  if (publishing) {
    if (row.recruiter_id) {
      const days = +setting('recruiter_offer_days');
      if (!row.deadline) row = await db.one(`UPDATE offers SET deadline = CURRENT_DATE + $2::int WHERE id=$1 RETURNING *`, [row.id, days]);
      await notify(row.recruiter_id, 'Votre offre est publiée ✅', row.title, '#/recruteur');
    }
    notified = await announceOffer(row);
  }
  if (status === 'refusee' && cur.status !== 'refusee' && row.recruiter_id) {
    await notify(row.recruiter_id, 'Offre non publiée', `${row.title} : ${clean(req.body.reason, 300) || 'elle ne respecte pas nos règles de publication.'}`, '#/recruteur');
  }
  res.json({ offer: row, notified });
}));
admin.delete('/offers/:id', ah(async (req, res) => {
  await db.q('DELETE FROM offers WHERE id=$1', [+req.params.id]);
  res.json({ ok: true });
}));

admin.get('/orders', ah(async (req, res) => {
  const rows = await db.q(`SELECT o.*, u.name, u.phone FROM orders o JOIN users u ON u.id=o.user_id ORDER BY
    CASE o.status WHEN 'payee' THEN 0 WHEN 'en_cours' THEN 1 WHEN 'en_attente_paiement' THEN 2 ELSE 3 END, o.id DESC LIMIT 300`);
  res.json({ orders: rows.map(orderOut) });
}));
admin.get('/orders/:id', ah(async (req, res) => {
  const o = await db.one(`SELECT o.*, u.name, u.phone, u.email, u.city FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=$1`, [+req.params.id]);
  if (!o) throw new HttpError(404, 'Commande introuvable.');
  const ids = [o.cv_file_id, o.photo_file_id, ...(o.delivered_file_ids || '').split(',').filter(Boolean).map(Number)].filter(Boolean);
  const files = await db.q('SELECT id,name,size,mime FROM files WHERE id = ANY($1)', [ids]);
  res.json({ order: orderOut(o), files });
}));
admin.post('/orders/:id/deliver', upload.array('files', 6), ah(async (req, res) => {
  const o = await db.one('SELECT * FROM orders WHERE id=$1', [+req.params.id]);
  if (!o) throw new HttpError(404, 'Commande introuvable.');
  if (!req.files?.length) throw bad('Joignez au moins un fichier à livrer.');
  const ids = [];
  for (const f of req.files) ids.push(await saveFile(req.user.id, f));
  const all = (o.delivered_file_ids || '').split(',').filter(Boolean).concat(ids.map(String)).join(',');
  await db.q("UPDATE orders SET delivered_file_ids=$1, status='livree', admin_note=COALESCE($2, admin_note) WHERE id=$3", [all, clean(req.body?.note, 2000), o.id]);
  await notify(o.user_id, 'Votre dossier de candidature est prêt 📄', 'Téléchargez vos fichiers dans « Mes commandes ».', '#/commandes');
  res.json({ ok: true });
}));
admin.put('/orders/:id', ah(async (req, res) => {
  const status = ['en_attente_paiement', 'payee', 'en_cours', 'livree', 'annulee'].includes(req.body?.status) ? req.body.status : null;
  if (!status) throw bad('Statut invalide.');
  const o = await db.one('UPDATE orders SET status=$1, admin_note=COALESCE($2, admin_note) WHERE id=$3 RETURNING *', [status, clean(req.body?.note, 2000), +req.params.id]);
  if (status === 'en_cours') await notify(o.user_id, 'Votre dossier est en préparation ✍️', 'Nous travaillons sur votre candidature.', '#/commandes');
  res.json({ ok: true });
}));

admin.get('/settings', ah(async (req, res) => {
  res.json({ settings: Object.fromEntries(SETTING_KEYS.map((k) => [k, setting(k)])), api_key: API_KEY });
}));
admin.put('/settings', ah(async (req, res) => {
  const b = req.body || {};
  for (const k of SETTING_KEYS) {
    if (b[k] === undefined) continue;
    let v = String(b[k]);
    if (k === 'formulas') { const arr = JSON.parse(v); if (!Array.isArray(arr) || !arr.every((f) => f.id && f.name && Number.isFinite(+f.price))) throw bad('Formules invalides.'); v = JSON.stringify(arr.map((f) => ({ id: f.id, name: f.name, price: +f.price, desc: f.desc || '' }))); }
    else if (/price|days|discount/.test(k) && !(Number.isFinite(+v) && +v >= 0)) throw bad(`Valeur invalide pour ${k}.`);
    await db.q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, v]);
  }
  await loadSettings();
  res.json({ ok: true });
}));

admin.post('/broadcast', ah(async (req, res) => {
  const title = clean(req.body?.title, 120); const body = clean(req.body?.body, 500);
  if (!title) throw bad('Indiquez un titre.');
  const users = await db.q("SELECT id FROM users WHERE role='candidat' AND status='actif' AND sub_until > now()");
  for (const u of users) await notify(u.id, title, body, clean(req.body?.link, 200));
  res.json({ sent: users.length });
}));

// ----- intégration : la veille automatique peut publier des offres
const integration = express.Router();
integration.use((req, res, next) => (req.get('X-API-Key') && req.get('X-API-Key') === API_KEY ? next() : next(new HttpError(401, 'Clé API invalide.'))));
integration.post('/offers', ah(async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [req.body];
  const out = [];
  for (const b of list.slice(0, 50)) {
    const o = offerFromBody(b);
    if (!o.employer) throw bad('Indiquez l’employeur.');
    if (o.apply_url && (await db.one('SELECT id FROM offers WHERE apply_url=$1', [o.apply_url]))) { out.push({ skipped: o.apply_url }); continue; }
    const row = await db.one(`INSERT INTO offers(title,employer,location,category,domain,contract,salary,deadline,description,requirements,apply_url,source,status,published_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'publiee',now()) RETURNING *`,
    [o.title, o.employer, o.location, o.category, o.domain, o.contract, o.salary, o.deadline, o.description, o.requirements, o.apply_url, o.source]);
    out.push({ id: row.id, notified: await announceOffer(row) });
  }
  res.json({ results: out });
}));

api.use('/admin', admin);
api.use('/integration', integration);
app.use('/api', api);

// ----- fichiers de l'application
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, p) => {
    if (p.endsWith('sw.js') || p.endsWith('.html') || p.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ----- erreurs
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) err = bad(err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (5 Mo maximum).' : 'Envoi de fichier invalide.');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erreur du serveur. Réessayez dans un instant.' : err.message });
});

// ---------------------------------------------------------------- démarrage
async function start() {
  await db.init();
  await loadSettings();
  JWT_SECRET = process.env.JWT_SECRET || (await secretValue('_jwt_secret', () => crypto.randomBytes(48).toString('hex')));
  API_KEY = process.env.API_KEY || (await secretValue('_api_key', () => 'bp_' + crypto.randomBytes(24).toString('hex')));
  let pub = process.env.VAPID_PUBLIC_KEY; let priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const raw = await secretValue('_vapid', () => JSON.stringify(webpush.generateVAPIDKeys()));
    ({ publicKey: pub, privateKey: priv } = JSON.parse(raw));
  }
  webpush.setVapidDetails('mailto:' + (process.env.CONTACT_EMAIL || 'gninimin@gmail.com'), pub, priv);
  VAPID_PUBLIC = pub;

  // compte administrateur
  const adminPhone = normPhone(process.env.ADMIN_PHONE || '0788589231');
  const exists = await db.one("SELECT id FROM users WHERE role='admin'");
  if (!exists) {
    const pwd = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
    await db.q(`INSERT INTO users(role,name,phone,password_hash,status) VALUES('admin',$1,$2,$3,'actif')
      ON CONFLICT (phone) DO UPDATE SET role='admin', status='actif', password_hash=EXCLUDED.password_hash`,
    [process.env.ADMIN_NAME || 'Administrateur BonPro', adminPhone, await bcrypt.hash(pwd, 10)]);
    console.log(`Compte administrateur créé : ${adminPhone} / ${process.env.ADMIN_PASSWORD ? '(mot de passe ADMIN_PASSWORD)' : pwd}`);
  }
  if (!(await db.one('SELECT id FROM offers LIMIT 1'))) {
    const n = await require('./seed').seed();
    console.log(`${n} offre(s) de départ ajoutée(s)`);
  }
  if (IS_PROD && !process.env.DATABASE_URL) console.warn('ATTENTION : DATABASE_URL absente, les données seront perdues au redémarrage.');
  app.listen(PORT, () => console.log(`BonPro en ligne sur le port ${PORT}`));
}

if (require.main === module) start().catch((e) => { console.error(e); process.exit(1); });
module.exports = { app, start };
