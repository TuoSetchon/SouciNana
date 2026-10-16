// Test des parcours BonPro via l'API (base PGlite en mémoire)
process.env.PGLITE_DIR = 'memory://';
process.env.ADMIN_PASSWORD = 'admin123';
process.env.PORT = '3222';
const assert = require('assert');
const { start } = require('../server/index.js');
const B = 'http://localhost:3222/api';

class Client {
  constructor() { this.cookie = ''; }
  async req(path, { method = 'GET', body, form } = {}) {
    const h = {}; if (this.cookie) h.Cookie = this.cookie;
    let b; if (form) b = form; else if (body) { b = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const r = await fetch(B + path, { method, headers: h, body: b });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    return { status: r.status, data };
  }
}
const file = (name, type, text = 'contenu') => new File([text], name, { type });
let ok = 0; const step = (m) => { ok++; console.log('✓', m); };

(async () => {
  await start(); await new Promise((r) => setTimeout(r, 300));
  const admin = new Client(); const cand = new Client(); const rec = new Client(); const anon = new Client();

  let r = await admin.req('/auth/login', { method: 'POST', body: { phone: '07 88 58 92 31', password: 'admin123' } });
  assert.equal(r.status, 200); assert.equal(r.data.user.role, 'admin'); step('connexion administrateur');

  r = await admin.req('/admin/offers', { method: 'POST', body: { title: 'Responsable RH', employer: 'FRUITEQ CI', location: 'Sinématiali', category: 'ci', domain: 'Ressources humaines', apply_url: 'https://www.emploi.ci/x', description: 'Gestion RH du site', salary: '500 000 FCFA' } });
  assert.equal(r.status, 200); const offerId = r.data.offer.id; step('admin publie une offre');
  await admin.req('/admin/offers', { method: 'POST', body: { title: 'Agent ONU', employer: 'UNICEF', location: 'Abidjan', category: 'onu', domain: 'Éducation & Formation', apply_url: 'https://jobs.unicef.org/1' } });

  r = await anon.req('/offers'); assert.equal(r.data.total, 2); step('liste publique des offres');
  r = await anon.req('/offers/' + offerId); assert.equal(r.data.locked, true); assert.equal(r.data.offer.apply_url, undefined); step('lien caché pour un visiteur');

  r = await cand.req('/auth/register', { method: 'POST', body: { role: 'candidat', name: 'Koné Awa', phone: '+225 05 11 22 33 44', password: 'secret1', city: 'Korhogo', categories: ['ci'], domains: ['Ressources humaines'] } });
  assert.equal(r.status, 200); assert.equal(r.data.user.status, 'en_attente'); assert.equal(r.data.user.active, false); step('inscription candidat → en attente');
  r = await cand.req('/auth/register', { method: 'POST', body: { role: 'candidat', name: 'X', phone: '0511223344', password: 'secret1' } });
  assert.equal(r.status, 400); step('doublon de numéro refusé');

  r = await cand.req('/offers/' + offerId); assert.equal(r.data.locked, true); step('candidat en attente : lien toujours caché');
  r = await cand.req('/orders', { method: 'POST', form: (() => { const f = new FormData(); f.set('formula', 'essentiel'); f.set('offer_text', 'x'); return f; })() });
  assert.equal(r.status, 402); step('commande refusée tant que le compte est en attente');

  r = await cand.req('/payments', { method: 'POST', form: (() => { const f = new FormData(); f.set('kind', 'abonnement'); f.set('method', 'wave'); return f; })() });
  assert.equal(r.status, 400); step('dépôt sans référence ni capture refusé');
  r = await cand.req('/payments', { method: 'POST', form: (() => { const f = new FormData(); f.set('kind', 'abonnement'); f.set('method', 'wave'); f.set('transaction_ref', 'WV123'); f.set('proof', file('capture.png', 'image/png')); return f; })() });
  assert.equal(r.status, 200); assert.equal(r.data.payment.amount, 500); step('dépôt de 500 FCFA déclaré');
  r = await cand.req('/payments', { method: 'POST', form: (() => { const f = new FormData(); f.set('kind', 'abonnement'); f.set('transaction_ref', 'WV124'); return f; })() });
  assert.equal(r.status, 400); step('second dépôt bloqué pendant la vérification');

  r = await admin.req('/admin/stats'); assert.equal(r.data.stats.paiements_a_verifier, 1); assert.equal(r.data.stats.en_attente, 1); step('statistiques admin');
  r = await admin.req('/admin/payments'); const pay = r.data.payments[0]; assert.equal(pay.transaction_ref, 'WV123');
  r = await admin.req('/files/' + pay.proof_file_id); assert.equal(r.status, 200); step('admin télécharge la capture');
  r = await cand.req('/files/' + pay.proof_file_id); assert.equal(r.status, 200);
  r = await rec.req('/files/' + pay.proof_file_id); assert.equal(r.status, 401); step('fichier protégé');
  r = await admin.req(`/admin/payments/${pay.id}/validate`, { method: 'POST', body: {} }); assert.equal(r.status, 200);
  r = await cand.req('/me'); assert.equal(r.data.user.active, true); assert.equal(r.data.user.status, 'actif');
  const days = (new Date(r.data.user.sub_until) - Date.now()) / 86400000; assert(days > 29 && days < 31); step('validation → compte actif 30 jours');
  assert(r.data.unread >= 1); step('notification d’activation reçue');

  r = await cand.req('/offers/' + offerId); assert.equal(r.data.locked, false); assert.equal(r.data.offer.apply_url, 'https://www.emploi.ci/x'); step('abonné actif : lien visible');
  r = await cand.req('/offers?mine=1'); assert.equal(r.data.total, 1); step('filtre « mon profil »');

  r = await admin.req('/admin/offers', { method: 'POST', body: { title: 'Chef RH', employer: 'SODECI', location: 'Abidjan', category: 'ci', domain: 'Ressources humaines' } });
  assert.equal(r.data.notified, 1); step('nouvelle offre → candidat concerné alerté');

  // commande de CV
  const of = new FormData(); of.set('formula', 'candidature'); of.set('express', 'true'); of.set('offer_url', 'https://www.emploi.ci/x'); of.set('notes', 'Master RH');
  of.set('cv', file('ancien cv.pdf', 'application/pdf')); of.set('photo', file('photo.jpg', 'image/jpeg'));
  r = await cand.req('/orders', { method: 'POST', form: of }); assert.equal(r.status, 200);
  assert.equal(r.data.order.price, 4000 + 2000); const orderId = r.data.order.id; step('commande Candidature + Express = 6 000 FCFA (−20 %)');
  r = await cand.req('/payments', { method: 'POST', form: (() => { const f = new FormData(); f.set('kind', 'commande'); f.set('ref_id', orderId); f.set('method', 'orange'); f.set('transaction_ref', 'OM55'); return f; })() });
  assert.equal(r.data.payment.amount, 6000); step('paiement de la commande déclaré');
  r = await admin.req('/admin/payments'); r = await admin.req(`/admin/payments/${r.data.payments[0].id}/validate`, { method: 'POST', body: {} });
  r = await admin.req('/admin/orders/' + orderId); assert.equal(r.data.order.status, 'payee'); assert.equal(r.data.files.length, 2); step('commande payée, fichiers du client visibles');
  const df = new FormData(); df.append('files', file('TUO cv.pdf', 'application/pdf', 'cv final')); df.append('files', file('lettre.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')); df.set('note', 'Bonne chance');
  r = await admin.req(`/admin/orders/${orderId}/deliver`, { method: 'POST', form: df }); assert.equal(r.status, 200);
  r = await cand.req('/orders/mine'); const o = r.data.orders[0]; assert.equal(o.status, 'livree'); assert.equal(o.delivered_file_ids.length, 2);
  r = await cand.req('/files/' + o.delivered_file_ids[0]); assert.equal(r.data, 'cv final'); step('dossier livré et téléchargé par le client');

  // recruteur
  r = await rec.req('/auth/register', { method: 'POST', body: { role: 'recruteur', name: 'M. Traoré', company: 'Société Nord BTP', phone: '0707070707', password: 'secret1' } });
  assert.equal(r.data.user.status, 'actif'); step('inscription recruteur');
  r = await rec.req('/recruiter/offers', { method: 'POST', body: { title: 'Assistant RH', location: 'Korhogo', category: 'ci', domain: 'Ressources humaines' } });
  const rOffer = r.data.offer.id; assert.equal(r.data.offer.status, 'en_attente_paiement'); step('offre recruteur créée, en attente de paiement');
  r = await anon.req('/offers/' + rOffer); assert.equal(r.status, 404); step('offre non payée invisible du public');
  r = await rec.req('/payments', { method: 'POST', form: (() => { const f = new FormData(); f.set('kind', 'offre'); f.set('ref_id', rOffer); f.set('transaction_ref', 'WV999'); return f; })() });
  assert.equal(r.data.payment.amount, 5000);
  r = await admin.req('/admin/payments'); await admin.req(`/admin/payments/${r.data.payments[0].id}/validate`, { method: 'POST', body: {} });
  r = await admin.req('/admin/offers?status=en_attente_validation'); assert.equal(r.data.offers.length, 1); step('paiement validé → offre à vérifier');
  r = await admin.req('/admin/offers/' + rOffer, { method: 'PUT', body: { status: 'publiee' } }); assert.equal(r.data.notified, 1); assert(r.data.offer.deadline); step('offre recruteur publiée (30 jours) et candidats alertés');

  const af = new FormData(); af.set('message', 'Je suis motivée'); af.set('cv', file('cv.pdf', 'application/pdf', 'mon cv'));
  r = await cand.req(`/offers/${rOffer}/apply`, { method: 'POST', form: af }); assert.equal(r.status, 200);
  r = await cand.req(`/offers/${rOffer}/apply`, { method: 'POST', form: af }); assert.equal(r.status, 400); step('candidature via BonPro (une seule fois)');
  r = await rec.req(`/recruiter/offers/${rOffer}/applications`); assert.equal(r.data.applications.length, 1);
  r = await rec.req('/files/' + r.data.applications[0].cv_file_id); assert.equal(r.data, 'mon cv'); step('recruteur télécharge le CV');
  r = await rec.req(`/recruiter/offers/${offerId}/applications`); assert.equal(r.status, 404); step('recruteur ne voit pas les offres des autres');
  r = await rec.req('/recruiter/applications/1', { method: 'PUT', body: { status: 'retenue' } });
  r = await cand.req('/applications/mine'); assert.equal(r.data.applications[0].status, 'retenue'); step('candidat voit « retenue »');

  // sécurité et réglages
  r = await cand.req('/admin/stats'); assert.equal(r.status, 403); step('espace admin interdit aux candidats');
  r = await admin.req('/admin/settings', { method: 'PUT', body: { sub_price: '600' } }); r = await anon.req('/config'); assert.equal(r.data.sub_price, 600);
  await admin.req('/admin/settings', { method: 'PUT', body: { sub_price: '500' } }); step('réglage du prix d’abonnement');
  r = await admin.req('/admin/settings'); const key = r.data.api_key;
  let x = await fetch(B + '/integration/offers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': key }, body: JSON.stringify([{ title: 'Consultant', employer: 'PNUD', location: 'Abidjan', category: 'onu', apply_url: 'https://jobs.undp.org/9' }, { title: 'Consultant', employer: 'PNUD', location: 'Abidjan', category: 'onu', apply_url: 'https://jobs.undp.org/9' }]) });
  x = await x.json(); assert.equal(x.results.length, 2); assert(x.results[1].skipped); step('publication automatique par clé API (doublon ignoré)');
  x = await fetch(B + '/integration/offers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'faux' }, body: '{}' }); assert.equal(x.status, 401); step('mauvaise clé API refusée');
  r = await admin.req('/admin/export/subscribers.csv'); assert(r.data.includes('Koné Awa')); step('export des abonnés');
  r = await admin.req(`/admin/users/${(await cand.req('/me')).data.user.id}/status`, { method: 'POST', body: { status: 'suspendu' } });
  r = await cand.req('/offers/' + offerId); assert.equal(r.data.locked, true); step('compte suspendu → accès coupé');

  console.log(`\n${ok} vérifications réussies`); process.exit(0);
})().catch((e) => { console.error('ÉCHEC :', e); process.exit(1); });
