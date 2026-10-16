/* BonPro — application (PWA) */
(() => {
'use strict';

// ------------------------------------------------------------ outils
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcfa = (n) => Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const ago = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 86400 * 7) return `il y a ${Math.round(s / 86400)} j`;
  return date(d);
};
const view = $('#view');
const S = { config: null, user: null, unread: 0 };

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._t); t._t = setTimeout(() => (t.className = 'toast'), 3800);
}

async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.form) o.body = opts.form;
  else if (opts.body !== undefined) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch('/api' + path, o); } catch { throw new Error('Pas de connexion internet. Réessayez.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Une erreur est survenue.'); e.status = res.status; throw e; }
  return data;
}

// soumission de formulaire avec bouton en attente
function onSubmit(form, fn) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const label = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Patientez…'; }
    try { await fn(new FormData(form), form); } catch (e) { toast(e.message, true); }
    finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = label; } }
  });
}

const CAT_ICON = { ci: '🇨🇮', onu: '🌍', canada: '🍁' };
const catName = (c) => S.config.categories[c] || c;
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
  offers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  cv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
};

// ------------------------------------------------------------ navigation
function renderChrome() {
  const u = S.user; const path = location.hash.slice(1) || '/';
  const tabs = !u ? [
    ['/', 'Accueil', 'home'], ['/offres', 'Offres', 'offers'], ['/cv', 'CV', 'cv'], ['/connexion', 'Connexion', 'user'],
  ] : u.role === 'admin' ? [
    ['/admin', 'Tableau', 'admin'], ['/admin/paiements', 'Paiements', 'pay'], ['/admin/offres', 'Offres', 'offers'], ['/admin/commandes', 'Commandes', 'cv'], ['/notifications', 'Alertes', 'bell'],
  ] : u.role === 'recruteur' ? [
    ['/recruteur', 'Mes offres', 'offers'], ['/recruteur/nouvelle', 'Publier', 'plus'], ['/notifications', 'Alertes', 'bell'], ['/compte', 'Compte', 'user'],
  ] : [
    ['/offres', 'Offres', 'offers'], ['/notifications', 'Alertes', 'bell'], ['/commander', 'Mon CV', 'cv'], ['/compte', 'Compte', 'user'],
  ];
  $('#tabbar').innerHTML = tabs.map(([href, label, ic]) => {
    const on = path === href || (href !== '/' && path.startsWith(href + '/')) || (href === '/offres' && path.startsWith('/offre/'));
    const badge = ic === 'bell' && S.unread ? `<span class="badge">${S.unread > 9 ? '9+' : S.unread}</span>` : '';
    return `<a href="#${href}" class="${on ? 'on' : ''}">${ICONS[ic]}${badge}<span>${label}</span></a>`;
  }).join('');
  $('#topnav').innerHTML = `
    <button class="install" id="installBtn">Installer</button>
    <a href="#/offres" class="wide">Offres</a>
    <a href="#/cv" class="wide">CV sur mesure</a>
    <a href="#/recruteurs" class="wide">Recruteurs</a>
    ${u ? `<a href="#/compte">${esc(u.name.split(' ')[0])}</a>` : '<a href="#/inscription" class="cta">S’inscrire</a>'}`;
  const ib = $('#installBtn');
  if (deferredInstall) ib.classList.add('show');
  ib.onclick = installApp;
}

const routes = [];
const route = (re, fn) => routes.push([re, fn]);
async function router() {
  const path = location.hash.slice(1) || '/';
  view.innerHTML = '<div class="spinner"></div>';
  if (S.user) await refreshMe().catch(() => {});
  renderChrome();
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) {
        if (e.status === 401) { location.hash = '#/connexion?retour=' + encodeURIComponent(path); return; }
        view.innerHTML = `<div class="card empty"><h2>Oups</h2><p>${esc(e.message)}</p><a class="btn btn-ghost" href="#/">Retour à l’accueil</a></div>`;
      }
      view.focus({ preventScroll: true }); window.scrollTo(0, 0);
      return;
    }
  }
  view.innerHTML = '<div class="card empty"><h2>Page introuvable</h2><a class="btn btn-ghost" href="#/">Accueil</a></div>';
}
async function refreshMe() {
  const r = await api('/me');
  S.user = r.user; S.unread = r.unread || 0;
}
const go = (h) => { if (location.hash === h) router(); else location.hash = h; };
const need = (role) => {
  if (!S.user) { const e = new Error('Connectez-vous'); e.status = 401; throw e; }
  if (role && S.user.role !== role && S.user.role !== 'admin') throw new Error('Cette page n’est pas accessible avec votre compte.');
};

// ------------------------------------------------------------ composants
function offerCard(o) {
  const dl = o.deadline ? `⏳ ${date(o.deadline)}` : '⏳ Date limite non précisée';
  return `<a class="card offer" href="#/offre/${o.id}">
    <div class="row between"><span class="pill">${CAT_ICON[o.category] || ''} ${esc(catName(o.category))}</span>${o.from_recruiter ? '<span class="pill gold">Postuler via BonPro</span>' : ''}</div>
    <h3 style="margin-top:10px">${esc(o.title)}</h3>
    <div><b>${esc(o.employer)}</b></div>
    <div class="meta"><span>📍 ${esc(o.location)}</span><span>${esc(o.domain)}</span>${o.salary ? `<span>💰 ${esc(o.salary)}</span>` : ''}<span>${dl}</span></div>
    <small>Publiée ${ago(o.published_at)}</small>
  </a>`;
}
function statusPill(s) {
  const m = {
    en_attente: ['warn', 'En attente de dépôt'], actif: ['ok', 'Actif'], expire: ['err', 'Expiré'], suspendu: ['err', 'Suspendu'],
    valide: ['ok', 'Validé'], rejete: ['err', 'Refusé'],
    en_attente_paiement: ['warn', 'En attente de paiement'], payee: ['', 'Payée'], en_cours: ['gold', 'En préparation'], livree: ['ok', 'Livrée'], annulee: ['err', 'Annulée'],
    publiee: ['ok', 'Publiée'], brouillon: ['', 'Brouillon'], expiree: ['', 'Expirée'], refusee: ['err', 'Refusée'], en_attente_validation: ['gold', 'En vérification'],
    recue: ['', 'Reçue'], retenue: ['ok', 'Retenue'], non_retenue: ['err', 'Non retenue'],
  }[s] || ['', s];
  return `<span class="pill ${m[0]}">${m[1]}</span>`;
}

// panneau de dépôt Wave / Orange Money
function payPanel({ kind, refId, amount, title, intro }) {
  const c = S.config;
  return `<div class="paybox stack">
    <div><h3 style="margin:0">${esc(title)}</h3>${intro ? `<p class="muted" style="margin:4px 0 0">${intro}</p>` : ''}</div>
    <div class="row between"><span>Montant à envoyer</span><span class="amount">${fcfa(amount)}</span></div>
    <div class="grid g2">
      <div class="card" style="box-shadow:none"><small>Wave</small><div class="paynum">${esc(c.pay_wave)}</div></div>
      <div class="card" style="box-shadow:none;margin-top:0"><small>Orange Money</small><div class="paynum">${esc(c.pay_orange)}</div></div>
    </div>
    <form class="stack" data-pay>
      <input type="hidden" name="kind" value="${kind}">${refId ? `<input type="hidden" name="ref_id" value="${refId}">` : ''}
      <div class="field" style="margin:0"><label>Moyen utilisé</label>
        <div class="chips"><label class="chip on"><input type="radio" name="method" value="wave" checked hidden> Wave</label><label class="chip"><input type="radio" name="method" value="orange" hidden> Orange Money</label></div></div>
      <div class="field" style="margin:0"><label for="tx-${kind}">Référence de la transaction</label><input id="tx-${kind}" name="transaction_ref" placeholder="Ex. : le numéro reçu par SMS" autocomplete="off"></div>
      <div class="field" style="margin:0"><label for="pp-${kind}">Numéro qui a envoyé l’argent</label><input id="pp-${kind}" name="payer_phone" inputmode="tel" placeholder="07 00 00 00 00"></div>
      <div class="field" style="margin:0"><label for="pf-${kind}">Capture du paiement (conseillé)</label><input id="pf-${kind}" type="file" name="proof" accept="image/*,application/pdf"></div>
      <button class="btn btn-gold btn-block" type="submit">J’ai fait le dépôt, envoyer pour vérification</button>
      <p class="hint" style="margin:0">Votre dépôt est vérifié par BonPro, en général dans la journée. Vous recevez une notification dès la validation.</p>
    </form>
  </div>`;
}
function bindPay(root, after) {
  $$('form[data-pay]', root).forEach((f) => {
    $$('.chip input[type=radio]', f).forEach((r) => r.addEventListener('change', () => {
      $$('.chip', f).forEach((c) => c.classList.toggle('on', c.querySelector('input').checked));
    }));
    onSubmit(f, async (fd) => {
      if (!fd.get('transaction_ref') && !(fd.get('proof') && fd.get('proof').size)) throw new Error('Indiquez la référence ou joignez la capture du paiement.');
      await api('/payments', { method: 'POST', form: fd });
      toast('Dépôt envoyé. Il sera vérifié rapidement.');
      after ? after() : router();
    });
  });
}
function chipToggles(root) {
  $$('.chip input[type=checkbox]', root).forEach((i) => {
    const sync = () => i.closest('.chip').classList.toggle('on', i.checked);
    i.addEventListener('change', sync); sync();
  });
}

// ------------------------------------------------------------ pages publiques
route(/^\/$/, async () => {
  if (S.user?.role === 'admin') return go('#/admin');
  if (S.user?.role === 'recruteur') return go('#/recruteur');
  const { offers, total } = await api('/offers');
  const c = S.config;
  view.innerHTML = `
  <section class="hero">
    <h1>Les bonnes offres d’emploi, <em>vérifiées</em>, chaque jour.</h1>
    <p>Côte d’Ivoire, Nations Unies et partenaires, Canada : BonPro trie les offres sérieuses, écarte les arnaques et vous alerte dès qu’une offre correspond à votre profil.</p>
    <form class="search" id="hs"><input name="q" placeholder="Poste, entreprise, ville…" aria-label="Rechercher une offre"><button class="btn btn-gold">Chercher</button></form>
    <div class="chips">${Object.keys(c.categories).map((k) => `<a class="chip" href="#/offres?category=${k}">${CAT_ICON[k]} ${esc(c.categories[k])}</a>`).join('')}</div>
  </section>

  <section class="section">
    <div class="section-title"><h2>Dernières offres</h2><a href="#/offres">Voir les ${total} offres →</a></div>
    <div class="grid g2">${offers.slice(0, 6).map(offerCard).join('') || '<div class="card empty">Les premières offres arrivent bientôt.</div>'}</div>
  </section>

  <section class="section grid g3">
    <div class="card feature"><h3>Abonnement candidat</h3><div class="price-tag">${fcfa(c.sub_price)} <small>/ mois</small></div>
      <p>Accès complet aux offres et aux liens pour postuler, alertes sur votre téléphone, et −${c.subscriber_discount} % sur vos CV.</p>
      <a class="btn btn-primary btn-block" href="#/inscription">Créer mon compte</a></div>
    <div class="card feature"><h3>CV adapté à l’offre</h3><div class="price-tag">dès ${fcfa(Math.min(...c.formulas.map((f) => f.price)))}</div>
      <p>Votre CV, votre lettre de motivation et votre message au recruteur, préparés par un professionnel des ressources humaines.</p>
      <a class="btn btn-ghost btn-block" href="#/cv">Voir les formules</a></div>
    <div class="card feature"><h3>Vous recrutez ?</h3><div class="price-tag">${fcfa(c.recruiter_offer_price)} <small>/ offre</small></div>
      <p>Publiez votre offre pendant ${c.recruiter_offer_days} jours et recevez les candidatures directement dans votre espace.</p>
      <a class="btn btn-ghost btn-block" href="#/recruteurs">Publier une offre</a></div>
  </section>

  <section class="section card">
    <h2>Comment ça marche</h2>
    <div class="stack steps" style="margin-top:14px">
      <div class="step"><div><b>Inscrivez-vous gratuitement</b><br><small>Choisissez vos domaines et les offres qui vous intéressent.</small></div></div>
      <div class="step"><div><b>Faites votre dépôt de ${fcfa(c.sub_price)}</b><br><small>Par Wave ou Orange Money. Votre compte est activé dès la vérification.</small></div></div>
      <div class="step"><div><b>Recevez les offres et postulez</b><br><small>Notifications sur votre téléphone, lien officiel pour chaque offre.</small></div></div>
    </div>
  </section>
  <div class="notice section">🔒 <b>BonPro ne vous demandera jamais d’argent pour un emploi.</b> Si un « recruteur » vous demande des frais de dossier, de visa ou de formation, c’est une arnaque.</div>
  <p class="footer">BonPro · WhatsApp ${esc(c.whatsapp)} · <a href="#/offres">Offres</a> · <a href="#/cv">CV</a> · <a href="#/recruteurs">Recruteurs</a></p>`;
  onSubmit($('#hs'), async (fd) => go('#/offres?q=' + encodeURIComponent(fd.get('q') || '')));
});

route(/^\/offres(?:\?(.*))?$/, async (qs) => {
  const p = new URLSearchParams(qs || '');
  const c = S.config;
  const cand = S.user?.role === 'candidat';
  const state = { category: p.get('category') || '', domain: p.get('domain') || '', q: p.get('q') || '', mine: p.get('mine') === '1', page: 0 };
  view.innerHTML = `
    <h1>Offres d’emploi</h1>
    ${cand && !S.user.active ? `<div class="notice warn" style="margin-bottom:12px">Votre compte est en attente. <a href="#/abonnement">Faites votre dépôt de ${fcfa(c.sub_price)}</a> pour voir les liens et postuler.</div>` : ''}
    <form id="flt" class="stack">
      <div class="search" style="margin:0;max-width:none"><input name="q" value="${esc(state.q)}" placeholder="Poste, entreprise, ville…" aria-label="Rechercher"><button class="btn btn-primary">Chercher</button></div>
      <div class="chips scroll-x" id="cats">
        <button type="button" class="chip ${!state.category ? 'on' : ''}" data-c="">Toutes</button>
        ${Object.keys(c.categories).map((k) => `<button type="button" class="chip ${state.category === k ? 'on' : ''}" data-c="${k}">${CAT_ICON[k]} ${esc(c.categories[k])}</button>`).join('')}
      </div>
      <div class="row">
        <select name="domain" style="flex:1;min-width:200px" aria-label="Domaine"><option value="">Tous les domaines</option>${c.domains.map((d) => `<option ${state.domain === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        ${cand ? `<label class="check"><input type="checkbox" name="mine" ${state.mine ? 'checked' : ''}> Mon profil seulement</label>` : ''}
      </div>
    </form>
    <p class="muted" id="count" style="margin-top:14px"></p>
    <div class="grid g2" id="list"></div>
    <div style="text-align:center;margin-top:16px"><button class="btn btn-ghost" id="more" hidden>Voir plus d’offres</button></div>`;
  const load = async (append) => {
    const qp = new URLSearchParams({ page: state.page });
    if (state.category) qp.set('category', state.category);
    if (state.domain) qp.set('domain', state.domain);
    if (state.q) qp.set('q', state.q);
    if (state.mine) qp.set('mine', '1');
    const r = await api('/offers?' + qp);
    $('#count').textContent = `${r.total} offre${r.total > 1 ? 's' : ''} ouverte${r.total > 1 ? 's' : ''}`;
    const html = r.offers.map(offerCard).join('');
    $('#list').innerHTML = append ? $('#list').innerHTML + html : (html || '<div class="card empty">Aucune offre pour ces critères. Élargissez votre recherche.</div>');
    $('#more').hidden = (state.page + 1) * 30 >= r.total;
  };
  const f = $('#flt');
  const apply = () => { state.page = 0; const fd = new FormData(f); state.q = fd.get('q') || ''; state.domain = fd.get('domain') || ''; state.mine = !!fd.get('mine'); load(); };
  f.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  f.domain.addEventListener('change', apply);
  if (f.mine) f.mine.addEventListener('change', apply);
  $$('#cats .chip').forEach((b) => b.addEventListener('click', () => {
    state.category = b.dataset.c; $$('#cats .chip').forEach((x) => x.classList.toggle('on', x === b)); apply();
  }));
  $('#more').addEventListener('click', () => { state.page++; load(true); });
  await load();
});

route(/^\/offre\/(\d+)$/, async (id) => {
  const { offer: o, locked, applied } = await api('/offers/' + id);
  const c = S.config; const u = S.user;
  let action = '';
  if (locked) {
    action = `<div class="card lock"><div class="ico">🔒</div><h3>Lien pour postuler réservé aux abonnés</h3>
      <p>Pour voir la description complète et le lien officiel, activez votre compte : ${fcfa(c.sub_price)} par mois.</p>
      ${!u ? '<div class="row" style="justify-content:center"><a class="btn btn-primary" href="#/inscription">Créer mon compte</a><a class="btn btn-ghost" href="#/connexion">J’ai déjà un compte</a></div>'
    : u.role === 'candidat' ? '<a class="btn btn-gold" href="#/abonnement">Activer mon compte</a>' : '<p class="muted">Réservé aux comptes candidats.</p>'}</div>`;
  } else {
    action = `<div class="card stack">
      ${o.apply_url ? `<a class="btn btn-primary btn-block" href="${esc(o.apply_url)}" target="_blank" rel="noopener noreferrer">Postuler sur le site officiel ↗</a>` : ''}
      ${o.accepts_bonpro ? (applied ? '<div class="notice ok">✅ Vous avez postulé à cette offre via BonPro.</div>' : `
        <form id="applyF" class="stack"><h3>Postuler via BonPro</h3>
          <div class="field"><label for="acv">Votre CV (PDF ou Word)</label><input id="acv" type="file" name="cv" accept=".pdf,.doc,.docx,application/pdf" required></div>
          <div class="field"><label for="amsg">Message au recruteur</label><textarea id="amsg" name="message" placeholder="Présentez-vous en quelques lignes…"></textarea></div>
          <button class="btn btn-gold btn-block">Envoyer ma candidature</button></form>`) : ''}
      <a class="btn btn-ghost btn-block" href="#/commander?offre=${o.id}">Besoin d’un CV adapté à cette offre ? (−${c.subscriber_discount} %)</a>
    </div>`;
  }
  view.innerHTML = `
    <a class="back" href="#/offres">← Toutes les offres</a>
    <div class="grid" style="grid-template-columns:minmax(0,1fr)">
      <div class="card">
        <div class="row"><span class="pill">${CAT_ICON[o.category] || ''} ${esc(catName(o.category))}</span><span class="pill gold">${esc(o.domain)}</span></div>
        <h1 style="margin-top:12px">${esc(o.title)}</h1>
        <p style="font-size:1.05rem"><b>${esc(o.employer)}</b></p>
        <dl class="kv">
          <dt>Lieu</dt><dd>${esc(o.location)}</dd>
          ${o.contract ? `<dt>Contrat</dt><dd>${esc(o.contract)}</dd>` : ''}
          <dt>Salaire</dt><dd>${esc(o.salary || 'Non communiqué')}</dd>
          <dt>Date limite</dt><dd>${o.deadline ? date(o.deadline) : 'Non précisée : postulez vite'}</dd>
          <dt>Publiée</dt><dd>${ago(o.published_at)}</dd>
        </dl>
        ${!locked && o.description ? `<div class="sep"></div><h3>Description</h3><div class="desc">${esc(o.description)}</div>` : ''}
        ${!locked && o.requirements ? `<div class="sep"></div><h3>Profil recherché</h3><div class="desc">${esc(o.requirements)}</div>` : ''}
        ${!locked && o.source ? `<p class="hint" style="margin-top:14px">Source : ${esc(o.source)}</p>` : ''}
      </div>
      ${action}
      ${o.category === 'canada' ? '<div class="notice warn">🍁 Une offre d’emploi ne garantit pas le permis de travail. Ne payez jamais un recruteur. Vérifiez les démarches sur le site officiel canada.ca.</div>' : ''}
    </div>`;
  const af = $('#applyF');
  if (af) onSubmit(af, async (fd) => { await api(`/offers/${o.id}/apply`, { method: 'POST', form: fd }); toast('Candidature envoyée ✅'); router(); });
});

route(/^\/cv$/, async () => {
  const c = S.config;
  view.innerHTML = `
    <h1>Un CV adapté à chaque offre</h1>
    <p class="muted">Préparé par un professionnel des ressources humaines. Vos vraies compétences mises en valeur, sans rien inventer. Livré en Word et en PDF.</p>
    <div class="grid g2" style="margin-top:14px">${c.formulas.map((f) => `
      <div class="card feature"><h3>${esc(f.name)}</h3><div class="price-tag">${fcfa(f.price)}</div>
      <p class="muted">Abonnés : ${fcfa(Math.round(f.price * (100 - c.subscriber_discount) / 100 / 50) * 50)}</p><p>${esc(f.desc)}</p></div>`).join('')}
    </div>
    <div class="notice" style="margin-top:14px">⚡ Option Express : +${fcfa(c.express_price)}, livraison le jour même pour une commande avant midi.</div>
    <div class="card" style="margin-top:14px;text-align:center">
      <a class="btn btn-gold" href="#/commander">Commander mon dossier</a>
      <p class="hint">La commande en ligne est réservée aux abonnés BonPro (${fcfa(c.sub_price)} / mois).</p>
    </div>`;
});

route(/^\/recruteurs$/, async () => {
  const c = S.config;
  view.innerHTML = `
    <h1>Recrutez avec BonPro</h1>
    <p class="muted">Publiez votre offre auprès de candidats abonnés et recevez les CV directement dans votre espace.</p>
    <div class="grid g3" style="margin-top:14px">
      <div class="card"><h3>1. Créez votre compte</h3><p>Gratuit, en une minute.</p></div>
      <div class="card"><h3>2. Rédigez votre offre</h3><p>Poste, lieu, profil recherché, date limite.</p></div>
      <div class="card"><h3>3. Payez ${fcfa(c.recruiter_offer_price)}</h3><p>Par Wave ou Orange Money. L’offre est publiée ${c.recruiter_offer_days} jours après vérification.</p></div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>Ce que vous obtenez</h3>
      <ul><li>Votre offre envoyée en notification aux candidats du domaine concerné</li><li>Les candidatures (CV + message) dans votre espace</li><li>Un tri simple : retenue / non retenue</li></ul>
      <a class="btn btn-primary" href="#/inscription?role=recruteur">Créer mon compte recruteur</a>
    </div>`;
});

// ------------------------------------------------------------ comptes
route(/^\/connexion(?:\?(.*))?$/, async (qs) => {
  const back = new URLSearchParams(qs || '').get('retour');
  if (S.user) return go('#' + (back || '/compte'));
  view.innerHTML = `
    <div class="card" style="max-width:440px;margin:10px auto">
      <h1>Connexion</h1>
      <form id="lf">
        <div class="field"><label for="lp">Numéro de téléphone</label><input id="lp" name="phone" inputmode="tel" autocomplete="tel" required placeholder="07 00 00 00 00"></div>
        <div class="field"><label for="lw">Mot de passe</label><input id="lw" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn btn-primary btn-block">Se connecter</button>
      </form>
      <p style="margin-top:14px;text-align:center">Pas encore de compte ? <a href="#/inscription">S’inscrire</a></p>
      <p class="hint" style="text-align:center">Mot de passe oublié ? Écrivez sur WhatsApp au ${esc(S.config.whatsapp)}.</p>
    </div>`;
  onSubmit($('#lf'), async (fd) => {
    const r = await api('/auth/login', { method: 'POST', body: Object.fromEntries(fd) });
    S.user = r.user; await refreshMe(); toast('Bienvenue ' + r.user.name.split(' ')[0] + ' 👋');
    go('#' + (back || (r.user.role === 'admin' ? '/admin' : r.user.role === 'recruteur' ? '/recruteur' : '/compte')));
  });
});

route(/^\/inscription(?:\?(.*))?$/, async (qs) => {
  if (S.user) return go('#/compte');
  const c = S.config;
  let role = new URLSearchParams(qs || '').get('role') === 'recruteur' ? 'recruteur' : 'candidat';
  const draw = () => {
    view.innerHTML = `
    <div class="card" style="max-width:620px;margin:10px auto">
      <h1>Créer un compte</h1>
      <div class="chips" style="margin:10px 0 18px">
        <button type="button" class="chip ${role === 'candidat' ? 'on' : ''}" data-r="candidat">Je cherche un emploi</button>
        <button type="button" class="chip ${role === 'recruteur' ? 'on' : ''}" data-r="recruteur">Je recrute</button>
      </div>
      <form id="rf">
        <input type="hidden" name="role" value="${role}">
        <div class="field"><label for="rn">${role === 'recruteur' ? 'Nom du contact' : 'Nom complet'}</label><input id="rn" name="name" required autocomplete="name"></div>
        ${role === 'recruteur' ? '<div class="field"><label for="rc">Entreprise ou organisation</label><input id="rc" name="company" required autocomplete="organization"></div>' : ''}
        <div class="grid g2">
          <div class="field"><label for="rp">Téléphone (WhatsApp)</label><input id="rp" name="phone" inputmode="tel" required autocomplete="tel" placeholder="07 00 00 00 00"></div>
          <div class="field"><label for="rv">Ville</label><input id="rv" name="city" autocomplete="address-level2" placeholder="Abidjan, Korhogo…"></div>
        </div>
        <div class="field"><label for="re">E-mail (facultatif)</label><input id="re" name="email" type="email" autocomplete="email"></div>
        ${role === 'candidat' ? `
        <div class="field"><label>Offres qui vous intéressent</label><div class="chips">${Object.keys(c.categories).map((k) => `<label class="chip"><input type="checkbox" name="categories" value="${k}" checked hidden>${CAT_ICON[k]} ${esc(c.categories[k])}</label>`).join('')}</div></div>
        <div class="field"><label>Vos domaines <small>(laissez vide pour tout recevoir)</small></label><div class="chips">${c.domains.map((d) => `<label class="chip"><input type="checkbox" name="domains" value="${esc(d)}" hidden>${esc(d)}</label>`).join('')}</div></div>` : ''}
        <div class="field"><label for="rw">Mot de passe</label><input id="rw" name="password" type="password" minlength="6" required autocomplete="new-password"><div class="hint">6 caractères minimum.</div></div>
        ${role === 'candidat' ? `<div class="notice" style="margin-bottom:14px">Après l’inscription, votre compte reste <b>en attente</b> jusqu’à votre dépôt de <b>${fcfa(c.sub_price)}</b> par mois (Wave ou Orange Money).</div>` : ''}
        <button class="btn btn-primary btn-block">Créer mon compte</button>
      </form>
      <p style="margin-top:14px;text-align:center">Déjà inscrit ? <a href="#/connexion">Se connecter</a></p>
    </div>`;
    $$('[data-r]').forEach((b) => b.addEventListener('click', () => { role = b.dataset.r; draw(); }));
    chipToggles(view);
    onSubmit($('#rf'), async (fd) => {
      const body = Object.fromEntries(fd);
      body.categories = fd.getAll('categories'); body.domains = fd.getAll('domains');
      const r = await api('/auth/register', { method: 'POST', body });
      S.user = r.user; await refreshMe();
      toast('Compte créé ✅');
      go(r.user.role === 'candidat' ? '#/abonnement' : '#/recruteur');
    });
  };
  draw();
});

route(/^\/abonnement$/, async () => {
  need('candidat');
  const u = S.user; const c = S.config;
  const { payments } = await api('/payments/mine');
  const pend = payments.find((p) => p.kind === 'abonnement' && p.status === 'en_attente');
  const lastRej = payments.find((p) => p.kind === 'abonnement' && p.status === 'rejete');
  view.innerHTML = `
    <h1>Mon abonnement</h1>
    <div class="card stack">
      <div class="row between"><span>Statut du compte</span>${statusPill(u.status)}</div>
      ${u.active ? `<p>Votre abonnement est valable jusqu’au <b>${date(u.sub_until)}</b>. Vous pouvez le prolonger dès maintenant : les jours s’ajoutent.</p>`
    : `<p>Pour activer votre compte, envoyez <b>${fcfa(c.sub_price)}</b> par Wave ou Orange Money, puis déclarez votre dépôt ci-dessous.</p>`}
    </div>
    <div style="margin-top:14px">${pend ? `<div class="notice ok">⏳ Votre dépôt de ${fcfa(pend.amount)} (${pend.method === 'wave' ? 'Wave' : 'Orange Money'}${pend.transaction_ref ? ', réf. ' + esc(pend.transaction_ref) : ''}) est en cours de vérification. Vous serez notifié dès l’activation.</div>`
    : (lastRej && !u.active ? `<div class="notice err" style="margin-bottom:12px">Votre dernier dépôt n’a pas été confirmé : ${esc(lastRej.note || '')}</div>` : '') + payPanel({ kind: 'abonnement', amount: c.sub_price, title: u.active ? `Prolonger de ${c.sub_days} jours` : 'Activer mon compte', intro: `Abonnement de ${c.sub_days} jours.` })}</div>
    <div class="card" style="margin-top:14px"><h3>Historique des dépôts</h3>${payments.length ? `<div class="list">${payments.map((p) => `
      <div class="row between"><span>${date(p.created_at)} · ${fcfa(p.amount)} · ${{ abonnement: 'Abonnement', commande: 'Commande', offre: 'Offre' }[p.kind]}</span>${statusPill(p.status)}</div>`).join('')}</div>` : '<p class="muted">Aucun dépôt pour le moment.</p>'}</div>`;
  bindPay(view, async () => { await refreshMe(); router(); });
});

route(/^\/compte$/, async () => {
  need();
  const u = S.user; const c = S.config;
  let apps = [];
  if (u.role === 'candidat') apps = (await api('/applications/mine')).applications;
  view.innerHTML = `
    <h1>Bonjour ${esc(u.name)}</h1>
    ${u.role === 'candidat' ? `
      <div class="card stack">
        <div class="row between"><h3 style="margin:0">Mon abonnement</h3>${statusPill(u.status)}</div>
        ${u.active ? `<p style="margin:0">Valable jusqu’au <b>${date(u.sub_until)}</b>.</p><a class="btn btn-ghost" href="#/abonnement">Prolonger</a>`
    : `<p style="margin:0">Votre compte est en attente de votre dépôt de <b>${fcfa(c.sub_price)}</b>.</p><a class="btn btn-gold" href="#/abonnement">Activer mon compte</a>`}
      </div>
      <div class="grid g2" style="margin-top:14px">
        <a class="stat" href="#/offres?mine=1"><b>🔎</b><span>Offres pour mon profil</span></a>
        <a class="stat" href="#/commandes"><b>📄</b><span>Mes commandes de CV</span></a>
      </div>
      ${apps.length ? `<div class="card" style="margin-top:14px"><h3>Mes candidatures via BonPro</h3><div class="list">${apps.map((a) => `<div class="row between"><a href="#/offre/${a.offer_id}">${esc(a.title)}</a>${statusPill(a.status)}</div>`).join('')}</div></div>` : ''}` : ''}
    <div class="card" style="margin-top:14px">
      <h3>Notifications sur ce téléphone</h3>
      <p class="muted">Recevez une alerte dès qu’une offre correspond à votre profil${u.role !== 'candidat' ? ' ou qu’une action vous concerne' : ''}.</p>
      <button class="btn btn-ghost" id="pushBtn">Activer les notifications</button>
    </div>
    <form class="card" id="pf" style="margin-top:14px">
      <h3>Mon profil</h3>
      <div class="grid g2">
        <div class="field"><label for="pn">Nom</label><input id="pn" name="name" value="${esc(u.name)}" required></div>
        <div class="field"><label>Téléphone</label><input value="${esc(u.phone)}" disabled></div>
        <div class="field"><label for="pe">E-mail</label><input id="pe" name="email" type="email" value="${esc(u.email || '')}"></div>
        <div class="field"><label for="pv">Ville</label><input id="pv" name="city" value="${esc(u.city || '')}"></div>
      </div>
      ${u.role === 'recruteur' ? `<div class="field"><label for="pc">Entreprise</label><input id="pc" name="company" value="${esc(u.company || '')}"></div>` : ''}
      ${u.role === 'candidat' ? `
      <div class="field"><label>Offres qui m’intéressent</label><div class="chips">${Object.keys(c.categories).map((k) => `<label class="chip"><input type="checkbox" name="categories" value="${k}" ${u.categories.includes(k) ? 'checked' : ''} hidden>${CAT_ICON[k]} ${esc(c.categories[k])}</label>`).join('')}</div></div>
      <div class="field"><label>Mes domaines</label><div class="chips">${c.domains.map((d) => `<label class="chip"><input type="checkbox" name="domains" value="${esc(d)}" ${u.domains.includes(d) ? 'checked' : ''} hidden>${esc(d)}</label>`).join('')}</div></div>` : ''}
      <details><summary style="cursor:pointer;font-weight:700;margin-bottom:10px">Changer mon mot de passe</summary>
        <div class="grid g2"><div class="field"><label for="cp">Mot de passe actuel</label><input id="cp" name="current_password" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="np">Nouveau mot de passe</label><input id="np" name="new_password" type="password" minlength="6" autocomplete="new-password"></div></div></details>
      <button class="btn btn-primary">Enregistrer</button>
    </form>
    <button class="btn btn-danger btn-block" id="logout" style="margin-top:14px">Se déconnecter</button>`;
  chipToggles(view);
  onSubmit($('#pf'), async (fd) => {
    const body = Object.fromEntries(fd); body.categories = fd.getAll('categories'); body.domains = fd.getAll('domains');
    const r = await api('/me', { method: 'PUT', body }); S.user = r.user; toast('Profil enregistré ✅');
  });
  $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); S.user = null; S.unread = 0; go('#/'); };
  setupPushButton($('#pushBtn'));
});

route(/^\/notifications$/, async () => {
  need();
  const { notifications } = await api('/notifications');
  S.unread = 0; renderChrome();
  view.innerHTML = `<h1>Alertes</h1>
    <div class="list">${notifications.map((n) => `
      <a class="item" href="${esc(n.link || '#/compte')}" style="text-decoration:none;color:inherit;${n.read ? '' : 'border-color:var(--gold);background:var(--gold-l)'}">
        <div class="top"><b>${esc(n.title)}</b><small>${ago(n.created_at)}</small></div>${n.body ? `<div class="muted">${esc(n.body)}</div>` : ''}</a>`).join('')
    || '<div class="card empty">Aucune alerte pour le moment. Activez les notifications dans votre compte pour être prévenu sur votre téléphone.</div>'}</div>`;
});

// ------------------------------------------------------------ commandes de CV
route(/^\/commander(?:\?(.*))?$/, async (qs) => {
  if (!S.user) return go('#/cv');
  need('candidat');
  const c = S.config; const u = S.user;
  if (!u.active && u.role !== 'admin') {
    view.innerHTML = `<h1>Commander mon dossier</h1><div class="card lock"><div class="ico">🔒</div><h3>Réservé aux abonnés</h3>
      <p>Activez votre compte (${fcfa(c.sub_price)} / mois) pour commander votre CV avec −${c.subscriber_discount} %.</p><a class="btn btn-gold" href="#/abonnement">Activer mon compte</a></div>
      <p style="margin-top:14px"><a href="#/cv">Voir les formules</a></p>`;
    return;
  }
  const offreId = new URLSearchParams(qs || '').get('offre');
  let pre = null;
  if (offreId) try { pre = (await api('/offers/' + offreId)).offer; } catch { /* ignore */ }
  const disc = (p) => Math.round(p * (100 - c.subscriber_discount) / 100 / 50) * 50;
  view.innerHTML = `
    <h1>Commander mon dossier</h1>
    <p class="muted">Abonné : −${c.subscriber_discount} % sur toutes les formules. <a href="#/commandes">Mes commandes →</a></p>
    <form id="of" class="stack">
      <div class="grid g2" id="forms">${c.formulas.map((f, i) => `
        <label class="card" style="cursor:pointer;margin:0">
          <div class="row between"><span class="check"><input type="radio" name="formula" value="${f.id}" ${i === 1 ? 'checked' : ''}> ${esc(f.name)}</span>
          <span><s class="muted">${fcfa(f.price)}</s> <b>${fcfa(disc(f.price))}</b></span></div>
          <p class="muted" style="margin:8px 0 0">${esc(f.desc)}</p></label>`).join('')}</div>
      <label class="check card" style="margin:0"><input type="checkbox" name="express" value="true"> ⚡ Express : livraison le jour même (+${fcfa(c.express_price)})</label>
      <div class="card">
        <div class="field"><label for="ou">Lien de l’offre visée</label><input id="ou" name="offer_url" type="url" placeholder="https://…" value="${pre?.apply_url ? esc(pre.apply_url) : ''}"></div>
        <div class="field"><label for="ot">Ou texte de l’annonce</label><textarea id="ot" name="offer_text" placeholder="Copiez ici le texte de l’offre">${pre ? esc(`${pre.title} — ${pre.employer} — ${pre.location}\n${pre.description || ''}`) : ''}</textarea></div>
        <div class="field"><label for="ocv">Votre CV actuel</label><input id="ocv" type="file" name="cv" accept=".pdf,.doc,.docx,image/*"><div class="hint">Même mal présenté : nous le refaisons entièrement.</div></div>
        <div class="field"><label for="oph">Votre photo (fond clair, de face)</label><input id="oph" type="file" name="photo" accept="image/*"></div>
        <div class="field"><label for="on">Informations utiles</label><textarea id="on" name="notes" placeholder="Diplômes, postes occupés avec les dates, tâches principales, langues… Précisez si vous êtes encore en poste."></textarea></div>
      </div>
      <div class="card row between"><span>Total à payer</span><span class="amount" id="tot"></span></div>
      <button class="btn btn-gold btn-block">Valider la commande</button>
    </form>`;
  const f = $('#of');
  const total = () => {
    const fd = new FormData(f); const fm = c.formulas.find((x) => x.id === fd.get('formula'));
    $('#tot').textContent = fcfa(disc(fm.price) + (fd.get('express') ? c.express_price : 0));
  };
  f.addEventListener('change', total); total();
  onSubmit(f, async (fd) => {
    const r = await api('/orders', { method: 'POST', form: fd });
    toast('Commande enregistrée. Il reste le paiement.');
    go('#/commande/' + r.order.id);
  });
});

route(/^\/commandes$/, async () => {
  need('candidat');
  const { orders, files } = await api('/orders/mine');
  const fname = (id) => files.find((x) => x.id === id)?.name || 'Fichier';
  view.innerHTML = `<div class="row between"><h1>Mes commandes</h1><a class="btn btn-gold btn-sm" href="#/commander">Nouvelle commande</a></div>
    <div class="list">${orders.map((o) => `
      <div class="item stack">
        <div class="top"><div><b>${esc(o.formula_name)}</b>${o.express ? ' ⚡' : ''}<br><small>${date(o.created_at)} · ${fcfa(o.price)}</small></div>${statusPill(o.status)}</div>
        ${o.status === 'en_attente_paiement' ? `<a class="btn btn-gold btn-sm" href="#/commande/${o.id}">Payer ${fcfa(o.price)}</a>` : ''}
        ${o.delivered_file_ids.length ? `<div class="stack">${o.delivered_file_ids.map((id) => `<a class="btn btn-primary btn-sm" href="/api/files/${id}">⬇ ${esc(fname(id))}</a>`).join('')}</div>` : ''}
        ${o.admin_note ? `<div class="notice">${esc(o.admin_note)}</div>` : ''}
      </div>`).join('') || '<div class="card empty">Aucune commande pour le moment.</div>'}</div>`;
});

route(/^\/commande\/(\d+)$/, async (id) => {
  need('candidat');
  const { orders } = await api('/orders/mine');
  const o = orders.find((x) => x.id === +id);
  if (!o) throw new Error('Commande introuvable.');
  const { payments } = await api('/payments/mine');
  const pend = payments.find((p) => p.kind === 'commande' && p.ref_id === o.id && p.status === 'en_attente');
  view.innerHTML = `<a class="back" href="#/commandes">← Mes commandes</a><h1>Commande n° ${o.id}</h1>
    <div class="card row between"><span><b>${esc(o.formula_name)}</b>${o.express ? ' · Express' : ''}</span>${statusPill(o.status)}</div>
    <div style="margin-top:14px">${o.status !== 'en_attente_paiement' ? '<div class="notice ok">Paiement reçu. Votre dossier est en préparation.</div>'
    : pend ? '<div class="notice ok">⏳ Votre dépôt est en cours de vérification.</div>'
      : payPanel({ kind: 'commande', refId: o.id, amount: o.price, title: 'Payer ma commande' })}</div>`;
  bindPay(view, () => go('#/commandes'));
});

// ------------------------------------------------------------ recruteurs
route(/^\/recruteur$/, async () => {
  need('recruteur');
  const { offers } = await api('/recruiter/offers');
  const c = S.config;
  view.innerHTML = `<div class="row between"><h1>Mes offres</h1><a class="btn btn-gold btn-sm" href="#/recruteur/nouvelle">+ Publier une offre</a></div>
    <p class="muted">${esc(S.user.company || '')} · Publication : ${fcfa(c.recruiter_offer_price)} par offre, ${c.recruiter_offer_days} jours.</p>
    <div class="list">${offers.map((o) => `
      <div class="item stack"><div class="top"><div><b>${esc(o.title)}</b><br><small>${esc(o.location)} · créée le ${date(o.created_at)}</small></div>${statusPill(o.status)}</div>
        <div class="row">
          ${o.status === 'en_attente_paiement' ? `<a class="btn btn-gold btn-sm" href="#/recruteur/payer/${o.id}">Payer ${fcfa(c.recruiter_offer_price)}</a>` : ''}
          ${o.status === 'publiee' ? `<a class="btn btn-ghost btn-sm" href="#/offre/${o.id}">Voir l’offre</a>` : ''}
          <a class="btn btn-primary btn-sm" href="#/recruteur/offre/${o.id}">Candidatures (${o.applications})</a>
        </div></div>`).join('') || '<div class="card empty">Vous n’avez pas encore publié d’offre.<br><br><a class="btn btn-gold" href="#/recruteur/nouvelle">Publier ma première offre</a></div>'}</div>`;
});

function offerForm(o = {}, adminMode = false) {
  const c = S.config;
  return `
    <div class="grid g2">
      <div class="field"><label for="ft">Intitulé du poste</label><input id="ft" name="title" required value="${esc(o.title || '')}"></div>
      <div class="field"><label for="fe">Employeur</label><input id="fe" name="employer" ${adminMode ? 'required' : ''} value="${esc(o.employer || (adminMode ? '' : S.user.company || ''))}"></div>
      <div class="field"><label for="fl">Lieu</label><input id="fl" name="location" required value="${esc(o.location || '')}" placeholder="Abidjan, Korhogo, télétravail…"></div>
      <div class="field"><label for="fc">Catégorie</label><select id="fc" name="category">${Object.keys(c.categories).map((k) => `<option value="${k}" ${o.category === k ? 'selected' : ''}>${esc(c.categories[k])}</option>`).join('')}</select></div>
      <div class="field"><label for="fd">Domaine</label><select id="fd" name="domain">${c.domains.map((d) => `<option ${o.domain === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
      <div class="field"><label for="fk">Type de contrat</label><input id="fk" name="contract" value="${esc(o.contract || '')}" placeholder="CDI, CDD, consultance…"></div>
      <div class="field"><label for="fs">Salaire</label><input id="fs" name="salary" value="${esc(o.salary || '')}" placeholder="Ex. : 450 000 FCFA / mois"></div>
      <div class="field"><label for="fx">Date limite</label><input id="fx" name="deadline" type="date" value="${o.deadline ? String(o.deadline).slice(0, 10) : ''}"></div>
    </div>
    <div class="field"><label for="fdesc">Description du poste</label><textarea id="fdesc" name="description" rows="6">${esc(o.description || '')}</textarea></div>
    <div class="field"><label for="freq">Profil recherché</label><textarea id="freq" name="requirements" rows="4">${esc(o.requirements || '')}</textarea></div>
    <div class="field"><label for="fu">Lien pour postuler ${adminMode ? '' : '(facultatif)'}</label><input id="fu" name="apply_url" type="url" value="${esc(o.apply_url || '')}" placeholder="https://…">
      ${adminMode ? '' : '<div class="hint">Sans lien, les candidats postulent directement via BonPro et vous recevez leur CV ici.</div>'}</div>
    ${adminMode ? `<div class="field"><label for="fso">Source</label><input id="fso" name="source" value="${esc(o.source || '')}" placeholder="emploi.ci, UNICEF, Guichet-Emplois…"></div>` : ''}`;
}

route(/^\/recruteur\/nouvelle$/, async () => {
  need('recruteur');
  const c = S.config;
  view.innerHTML = `<a class="back" href="#/recruteur">← Mes offres</a><h1>Publier une offre</h1>
    <form class="card" id="rof">${offerForm()}
      <div class="notice" style="margin-bottom:14px">Après l’enregistrement, payez ${fcfa(c.recruiter_offer_price)} par Wave ou Orange Money. L’offre est publiée après vérification, pour ${c.recruiter_offer_days} jours.</div>
      <button class="btn btn-gold btn-block">Enregistrer et passer au paiement</button></form>`;
  onSubmit($('#rof'), async (fd) => {
    const r = await api('/recruiter/offers', { method: 'POST', body: Object.fromEntries(fd) });
    go('#/recruteur/payer/' + r.offer.id);
  });
});

route(/^\/recruteur\/payer\/(\d+)$/, async (id) => {
  need('recruteur');
  const c = S.config;
  const { offers } = await api('/recruiter/offers');
  const o = offers.find((x) => x.id === +id);
  if (!o) throw new Error('Offre introuvable.');
  const { payments } = await api('/payments/mine');
  const pend = payments.find((p) => p.kind === 'offre' && p.ref_id === o.id && p.status === 'en_attente');
  view.innerHTML = `<a class="back" href="#/recruteur">← Mes offres</a><h1>${esc(o.title)}</h1>
    ${o.status !== 'en_attente_paiement' ? '<div class="notice ok">Paiement déjà reçu pour cette offre.</div>'
    : pend ? '<div class="notice ok">⏳ Votre dépôt est en cours de vérification. L’offre sera publiée ensuite.</div>'
      : payPanel({ kind: 'offre', refId: o.id, amount: c.recruiter_offer_price, title: 'Payer la publication', intro: `Publication pendant ${c.recruiter_offer_days} jours.` })}`;
  bindPay(view, () => go('#/recruteur'));
});

route(/^\/recruteur\/offre\/(\d+)$/, async (id) => {
  need('recruteur');
  const { offer, applications } = await api(`/recruiter/offers/${id}/applications`);
  view.innerHTML = `<a class="back" href="${S.user.role === 'admin' ? '#/admin/offres' : '#/recruteur'}">← Retour</a><h1>${esc(offer.title)}</h1>
    <p class="muted">${applications.length} candidature${applications.length > 1 ? 's' : ''}</p>
    <div class="list">${applications.map((a) => `
      <div class="item stack"><div class="top"><div><b>${esc(a.name)}</b><br><small>${esc(a.city || '')} · ${esc(a.phone)}${a.email ? ' · ' + esc(a.email) : ''} · ${ago(a.created_at)}</small></div>${statusPill(a.status)}</div>
        ${a.message ? `<div class="desc">${esc(a.message)}</div>` : ''}
        <div class="row">${a.cv_file_id ? `<a class="btn btn-primary btn-sm" href="/api/files/${a.cv_file_id}">⬇ Télécharger le CV</a>` : ''}
          <a class="btn btn-ghost btn-sm" href="https://wa.me/225${esc(a.phone)}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn btn-ok btn-sm" data-s="retenue" data-id="${a.id}">Retenir</button>
          <button class="btn btn-danger btn-sm" data-s="non_retenue" data-id="${a.id}">Non retenue</button></div></div>`).join('') || '<div class="card empty">Aucune candidature pour le moment.</div>'}</div>`;
  $$('[data-s]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/recruiter/applications/${b.dataset.id}`, { method: 'PUT', body: { status: b.dataset.s } }); toast('Statut mis à jour'); router(); } catch (e) { toast(e.message, true); }
  }));
});

// ------------------------------------------------------------ administration
route(/^\/admin$/, async () => {
  need('admin');
  const { stats: s } = await api('/admin/stats');
  const t = (href, n, label, alert) => `<a class="stat ${alert && n ? 'alert' : ''}" href="${href}"><b>${n}</b><span>${label}</span></a>`;
  view.innerHTML = `<h1>Tableau de bord</h1>
    <div class="grid g4" style="grid-template-columns:repeat(2,1fr)">
      ${t('#/admin/paiements', s.paiements_a_verifier, 'Dépôts à vérifier', true)}
      ${t('#/admin/commandes', s.commandes_a_traiter, 'Commandes à traiter', true)}
      ${t('#/admin/offres?status=en_attente_validation', s.offres_a_valider, 'Offres recruteurs à valider', true)}
      ${t('#/admin/utilisateurs?role=candidat', s.abonnes_actifs, 'Abonnés actifs')}
      ${t('#/admin/utilisateurs?role=candidat', s.en_attente, 'Comptes en attente de dépôt')}
      ${t('#/admin/utilisateurs?role=recruteur', s.recruteurs, 'Recruteurs')}
      ${t('#/admin/offres', s.offres_ouvertes, 'Offres ouvertes')}
      <div class="stat"><b>${fcfa(s.encaisse_mois)}</b><span>Encaissé ce mois-ci</span></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <a class="btn btn-gold" href="#/admin/offre/nouvelle">+ Ajouter une offre</a>
      <a class="btn btn-ghost" href="#/admin/reglages">Réglages, export et annonces</a>
    </div>`;
});

route(/^\/admin\/paiements(?:\?(.*))?$/, async (qs) => {
  need('admin');
  const status = new URLSearchParams(qs || '').get('status') || 'en_attente';
  const { payments } = await api('/admin/payments?status=' + status);
  const lab = { abonnement: 'Abonnement', commande: 'Commande de CV', offre: 'Publication d’offre' };
  view.innerHTML = `<h1>Dépôts Wave / Orange Money</h1>
    <div class="tabs">${[['en_attente', 'À vérifier'], ['valide', 'Validés'], ['rejete', 'Refusés']].map(([k, l]) => `<a class="chip ${status === k ? 'on' : ''}" href="#/admin/paiements?status=${k}">${l}</a>`).join('')}</div>
    ${status === 'en_attente' ? '<div class="notice" style="margin-bottom:12px">Vérifiez sur votre téléphone (Wave ou Orange Money) que le montant est bien arrivé avec cette référence, puis validez.</div>' : ''}
    <div class="list">${payments.map((p) => `
      <div class="item stack">
        <div class="top"><div><b>${fcfa(p.amount)}</b> · ${lab[p.kind]}${p.ref_id ? ' n° ' + p.ref_id : ''}<br><small>${esc(p.name)} (${esc(p.role)}) · ${esc(p.phone)} · ${ago(p.created_at)}</small></div>${statusPill(p.status)}</div>
        <dl class="kv"><dt>Moyen</dt><dd>${p.method === 'wave' ? 'Wave' : 'Orange Money'}</dd>
          <dt>Référence</dt><dd>${esc(p.transaction_ref || '—')}</dd><dt>Envoyé depuis</dt><dd>${esc(p.payer_phone || '—')}</dd>
          ${p.note ? `<dt>Note</dt><dd>${esc(p.note)}</dd>` : ''}</dl>
        <div class="row">${p.proof_file_id ? `<a class="btn btn-ghost btn-sm" href="/api/files/${p.proof_file_id}">⬇ Capture</a>` : ''}
          ${p.status === 'en_attente' ? `<button class="btn btn-ok btn-sm" data-v="${p.id}">✓ Valider</button><button class="btn btn-danger btn-sm" data-x="${p.id}">Refuser</button>` : ''}</div>
      </div>`).join('') || '<div class="card empty">Rien à afficher.</div>'}</div>`;
  $$('[data-v]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api(`/admin/payments/${b.dataset.v}/validate`, { method: 'POST', body: {} }); toast('Dépôt validé ✅'); router(); } catch (e) { toast(e.message, true); b.disabled = false; }
  }));
  $$('[data-x]').forEach((b) => b.addEventListener('click', async () => {
    const note = prompt('Motif du refus (envoyé au client) :', 'Dépôt introuvable sur notre compte.');
    if (note === null) return;
    try { await api(`/admin/payments/${b.dataset.x}/reject`, { method: 'POST', body: { note } }); toast('Dépôt refusé'); router(); } catch (e) { toast(e.message, true); }
  }));
});

route(/^\/admin\/offres(?:\?(.*))?$/, async (qs) => {
  need('admin');
  const status = new URLSearchParams(qs || '').get('status') || '';
  const { offers } = await api('/admin/offers' + (status ? '?status=' + status : ''));
  view.innerHTML = `<div class="row between"><h1>Offres</h1><a class="btn btn-gold btn-sm" href="#/admin/offre/nouvelle">+ Ajouter</a></div>
    <div class="tabs scroll-x chips">${[['', 'Toutes'], ['publiee', 'Publiées'], ['en_attente_validation', 'À valider'], ['en_attente_paiement', 'Non payées'], ['brouillon', 'Brouillons'], ['expiree', 'Expirées']].map(([k, l]) => `<a class="chip ${status === k ? 'on' : ''}" href="#/admin/offres${k ? '?status=' + k : ''}">${l}</a>`).join('')}</div>
    <div class="list">${offers.map((o) => `
      <div class="item stack"><div class="top"><div><b>${esc(o.title)}</b><br><small>${esc(o.employer)} · ${esc(o.location)} · ${CAT_ICON[o.category]} ${o.recruiter_id ? '· Recruteur : ' + esc(o.recruiter_company || '') : ''}</small></div>${statusPill(o.status)}</div>
        <div class="row"><a class="btn btn-ghost btn-sm" href="#/admin/offre/${o.id}">Modifier</a>
          ${o.status === 'en_attente_validation' ? `<button class="btn btn-ok btn-sm" data-pub="${o.id}">✓ Publier</button><button class="btn btn-danger btn-sm" data-ref="${o.id}">Refuser</button>` : ''}
          ${o.recruiter_id ? `<a class="btn btn-ghost btn-sm" href="#/recruteur/offre/${o.id}">Candidatures (${o.applications})</a>` : ''}
          <small class="muted">${o.views} vues</small></div></div>`).join('') || '<div class="card empty">Aucune offre.</div>'}</div>`;
  $$('[data-pub]').forEach((b) => b.addEventListener('click', async () => {
    try { const r = await api(`/admin/offers/${b.dataset.pub}`, { method: 'PUT', body: { status: 'publiee' } }); toast(`Offre publiée · ${r.notified} candidat(s) alerté(s)`); router(); } catch (e) { toast(e.message, true); }
  }));
  $$('[data-ref]').forEach((b) => b.addEventListener('click', async () => {
    const reason = prompt('Motif du refus (envoyé au recruteur) :'); if (reason === null) return;
    try { await api(`/admin/offers/${b.dataset.ref}`, { method: 'PUT', body: { status: 'refusee', reason } }); toast('Offre refusée'); router(); } catch (e) { toast(e.message, true); }
  }));
});

route(/^\/admin\/offre\/(nouvelle|\d+)$/, async (id) => {
  need('admin');
  const isNew = id === 'nouvelle';
  const o = isNew ? { category: 'ci', domain: 'Autre' } : (await api('/admin/offers/' + id)).offer;
  view.innerHTML = `<a class="back" href="#/admin/offres">← Offres</a><h1>${isNew ? 'Nouvelle offre' : 'Modifier l’offre'}</h1>
    <form class="card" id="aof">${offerForm(o, true)}
      <div class="field"><label for="ast">Statut</label><select id="ast" name="status">${[['publiee', 'Publiée (les abonnés concernés sont alertés)'], ['brouillon', 'Brouillon'], ['expiree', 'Expirée'], ['refusee', 'Refusée'], ...(o.recruiter_id ? [['en_attente_validation', 'En vérification'], ['en_attente_paiement', 'En attente de paiement']] : [])]
    .map(([k, l]) => `<option value="${k}" ${(o.status || 'publiee') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="row"><button class="btn btn-primary">Enregistrer</button>${!isNew ? '<button type="button" class="btn btn-danger" id="del">Supprimer</button>' : ''}</div></form>`;
  onSubmit($('#aof'), async (fd) => {
    const body = Object.fromEntries(fd);
    const r = await api(isNew ? '/admin/offers' : '/admin/offers/' + id, { method: isNew ? 'POST' : 'PUT', body });
    toast(r.notified ? `Enregistrée · ${r.notified} candidat(s) alerté(s)` : 'Offre enregistrée ✅');
    go('#/admin/offres');
  });
  const del = $('#del');
  if (del) del.onclick = async () => { if (!confirm('Supprimer définitivement cette offre ?')) return; await api('/admin/offers/' + id, { method: 'DELETE' }); toast('Offre supprimée'); go('#/admin/offres'); };
});

route(/^\/admin\/commandes$/, async () => {
  need('admin');
  const { orders } = await api('/admin/orders');
  view.innerHTML = `<h1>Commandes de CV</h1><div class="list">${orders.map((o) => `
    <a class="item" href="#/admin/commande/${o.id}" style="text-decoration:none;color:inherit"><div class="top"><div><b>n° ${o.id} · ${esc(o.formula_name)}</b>${o.express ? ' ⚡' : ''}<br><small>${esc(o.name)} · ${esc(o.phone)} · ${fcfa(o.price)} · ${ago(o.created_at)}</small></div>${statusPill(o.status)}</div></a>`).join('') || '<div class="card empty">Aucune commande.</div>'}</div>`;
});

route(/^\/admin\/commande\/(\d+)$/, async (id) => {
  need('admin');
  const { order: o, files } = await api('/admin/orders/' + id);
  const f = (fid) => files.find((x) => x.id === fid);
  const dl = (fid, label) => (fid && f(fid) ? `<a class="btn btn-ghost btn-sm" href="/api/files/${fid}">⬇ ${label} (${esc(f(fid).name)})</a>` : '');
  view.innerHTML = `<a class="back" href="#/admin/commandes">← Commandes</a><h1>Commande n° ${o.id}</h1>
    <div class="card stack">
      <div class="row between"><b>${esc(o.formula_name)}${o.express ? ' · ⚡ Express' : ''} · ${fcfa(o.price)}</b>${statusPill(o.status)}</div>
      <dl class="kv"><dt>Client</dt><dd>${esc(o.name)}</dd><dt>Téléphone</dt><dd><a href="https://wa.me/225${esc(o.phone)}" target="_blank" rel="noopener">${esc(o.phone)}</a></dd>
        ${o.email ? `<dt>E-mail</dt><dd>${esc(o.email)}</dd>` : ''}${o.city ? `<dt>Ville</dt><dd>${esc(o.city)}</dd>` : ''}<dt>Commandée</dt><dd>${date(o.created_at)}</dd></dl>
      ${o.offer_url ? `<p><b>Offre :</b> <a href="${esc(o.offer_url)}" target="_blank" rel="noopener">${esc(o.offer_url)}</a></p>` : ''}
      ${o.offer_text ? `<details><summary style="cursor:pointer;font-weight:700">Texte de l’offre</summary><div class="desc">${esc(o.offer_text)}</div></details>` : ''}
      ${o.notes ? `<div><b>Informations du client</b><div class="desc">${esc(o.notes)}</div></div>` : ''}
      <div class="row">${dl(o.cv_file_id, 'CV actuel')}${dl(o.photo_file_id, 'Photo')}</div>
      ${o.delivered_file_ids.length ? `<div><b>Fichiers livrés</b><div class="row">${o.delivered_file_ids.map((x) => dl(x, 'Livré')).join('')}</div></div>` : ''}
    </div>
    <div class="card" style="margin-top:14px"><h3>Changer le statut</h3><div class="row">
      ${[['payee', 'Payée'], ['en_cours', 'En préparation'], ['livree', 'Livrée'], ['annulee', 'Annulée']].map(([k, l]) => `<button class="btn btn-ghost btn-sm" data-st="${k}">${l}</button>`).join('')}</div></div>
    <form class="card" id="dlv" style="margin-top:14px"><h3>Livrer le dossier</h3>
      <div class="field"><label for="dfs">Fichiers (CV, lettre, PDF fusionné…)</label><input id="dfs" type="file" name="files" multiple accept=".pdf,.doc,.docx" required></div>
      <div class="field"><label for="dno">Message au client (facultatif)</label><textarea id="dno" name="note" placeholder="Ex. : le message à coller dans le formulaire du site…"></textarea></div>
      <button class="btn btn-gold">Envoyer au client</button></form>`;
  $$('[data-st]').forEach((b) => b.addEventListener('click', async () => {
    try { await api('/admin/orders/' + id, { method: 'PUT', body: { status: b.dataset.st } }); toast('Statut mis à jour'); router(); } catch (e) { toast(e.message, true); }
  }));
  onSubmit($('#dlv'), async (fd) => { await api(`/admin/orders/${id}/deliver`, { method: 'POST', form: fd }); toast('Dossier livré ✅ Le client est notifié.'); router(); });
});

route(/^\/admin\/utilisateurs(?:\?(.*))?$/, async (qs) => {
  need('admin');
  const p = new URLSearchParams(qs || '');
  const role = p.get('role') || 'candidat'; const q = p.get('q') || '';
  const { users } = await api(`/admin/users?role=${role}&q=${encodeURIComponent(q)}`);
  view.innerHTML = `<h1>Utilisateurs</h1>
    <div class="tabs">${[['candidat', 'Candidats'], ['recruteur', 'Recruteurs'], ['admin', 'Admin']].map(([k, l]) => `<a class="chip ${role === k ? 'on' : ''}" href="#/admin/utilisateurs?role=${k}">${l}</a>`).join('')}</div>
    <form id="us" class="search" style="max-width:none;margin:0 0 14px"><input name="q" value="${esc(q)}" placeholder="Nom, téléphone, entreprise…"><button class="btn btn-primary">Chercher</button></form>
    <div class="list">${users.map((u) => `
      <div class="item stack"><div class="top"><div><b>${esc(u.name)}</b>${u.company ? ' · ' + esc(u.company) : ''}<br><small>${esc(u.phone)} · ${esc(u.city || '')} · inscrit ${ago(u.created_at)}</small></div>${statusPill(u.status)}</div>
        ${u.role === 'candidat' ? `<small class="muted">${u.sub_until ? 'Abonnement jusqu’au ' + date(u.sub_until) : 'Jamais abonné'} · ${u.categories.map((c) => CAT_ICON[c]).join(' ')} ${esc(u.domains.join(', '))}</small>` : ''}
        <div class="row"><a class="btn btn-ghost btn-sm" href="https://wa.me/225${esc(u.phone)}" target="_blank" rel="noopener">WhatsApp</a>
          ${u.role === 'candidat' ? `<button class="btn btn-ok btn-sm" data-days="${u.id}">+ ${S.config.sub_days} jours</button>` : ''}
          ${u.role !== 'admin' ? (u.status === 'suspendu' ? `<button class="btn btn-ghost btn-sm" data-unsus="${u.id}">Réactiver</button>` : `<button class="btn btn-danger btn-sm" data-sus="${u.id}">Suspendre</button>`) : ''}</div></div>`).join('') || '<div class="card empty">Aucun utilisateur.</div>'}</div>`;
  onSubmit($('#us'), async (fd) => go(`#/admin/utilisateurs?role=${role}&q=${encodeURIComponent(fd.get('q'))}`));
  $$('[data-days]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Activer ou prolonger cet abonnement sans dépôt enregistré ?')) return;
    try { await api(`/admin/users/${b.dataset.days}/subscription`, { method: 'POST', body: { days: S.config.sub_days } }); toast('Abonnement prolongé'); router(); } catch (e) { toast(e.message, true); }
  }));
  $$('[data-sus],[data-unsus]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/users/${b.dataset.sus || b.dataset.unsus}/status`, { method: 'POST', body: { status: b.dataset.sus ? 'suspendu' : 'actif' } }); router(); } catch (e) { toast(e.message, true); }
  }));
});

route(/^\/admin\/reglages$/, async () => {
  need('admin');
  const { settings: s, api_key } = await api('/admin/settings');
  const fm = JSON.parse(s.formulas);
  const num = (k, l, h) => `<div class="field"><label for="s-${k}">${l}</label><input id="s-${k}" name="${k}" type="number" min="0" value="${esc(s[k])}">${h ? `<div class="hint">${h}</div>` : ''}</div>`;
  const txt = (k, l) => `<div class="field"><label for="s-${k}">${l}</label><input id="s-${k}" name="${k}" value="${esc(s[k])}"></div>`;
  view.innerHTML = `<h1>Réglages</h1>
    <form class="card" id="sf"><h3>Prix et numéros</h3>
      <div class="grid g2">${num('sub_price', 'Abonnement candidat (FCFA)')}${num('sub_days', 'Durée de l’abonnement (jours)')}
        ${txt('pay_wave', 'Numéro Wave')}${txt('pay_orange', 'Numéro Orange Money')}${txt('whatsapp', 'Numéro WhatsApp Business')}
        ${num('subscriber_discount', 'Réduction abonnés sur les CV (%)')}${num('recruiter_offer_price', 'Prix d’une offre recruteur (FCFA)')}${num('recruiter_offer_days', 'Durée d’une offre recruteur (jours)')}${num('express_price', 'Option Express (FCFA)')}</div>
      <h3>Formules de CV</h3>
      ${fm.map((f, i) => `<div class="grid g2" style="grid-template-columns:2fr 1fr"><div class="field"><label>Nom</label><input name="f_name_${i}" value="${esc(f.name)}"></div><div class="field"><label>Prix (FCFA)</label><input name="f_price_${i}" type="number" min="0" value="${f.price}"></div></div>
        <div class="field"><label>Description</label><input name="f_desc_${i}" value="${esc(f.desc)}"></div>`).join('<div class="sep"></div>')}
      <button class="btn btn-primary">Enregistrer les réglages</button></form>
    <div class="card"><h3>Abonnés actifs</h3><p class="muted">Liste des abonnés (nom, téléphone, catégories) pour vos groupes WhatsApp.</p><a class="btn btn-ghost" href="/api/admin/export/subscribers.csv">⬇ Télécharger (Excel / CSV)</a></div>
    <form class="card" id="bc"><h3>Annonce à tous les abonnés actifs</h3>
      <div class="field"><label for="bt">Titre</label><input id="bt" name="title" required></div>
      <div class="field"><label for="bb">Message</label><textarea id="bb" name="body"></textarea></div>
      <button class="btn btn-gold">Envoyer la notification</button></form>
    <div class="card"><h3>Clé API (publication automatique)</h3><p class="muted">Permet à la veille automatique de publier des offres directement sur BonPro. Ne la partagez pas.</p><input id="apik" value="${esc(api_key)}" readonly></div>`;
  onSubmit($('#sf'), async (fd) => {
    const body = {};
    for (const k of ['sub_price', 'sub_days', 'pay_wave', 'pay_orange', 'whatsapp', 'subscriber_discount', 'recruiter_offer_price', 'recruiter_offer_days', 'express_price']) body[k] = fd.get(k);
    body.formulas = JSON.stringify(fm.map((f, i) => ({ id: f.id, name: fd.get('f_name_' + i), price: +fd.get('f_price_' + i), desc: fd.get('f_desc_' + i) })));
    await api('/admin/settings', { method: 'PUT', body });
    S.config = await api('/config'); toast('Réglages enregistrés ✅');
  });
  $('#apik').addEventListener('focus', (e) => e.target.select());
  onSubmit($('#bc'), async (fd, f) => { const r = await api('/admin/broadcast', { method: 'POST', body: Object.fromEntries(fd) }); toast(`Envoyée à ${r.sent} abonné(s)`); f.reset(); });
});

// ------------------------------------------------------------ PWA : installation et notifications
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#installBtn')?.classList.add('show'); });
async function installApp() {
  if (!deferredInstall) return;
  deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#installBtn')?.classList.remove('show');
}
function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function setupPushButton(btn) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !S.config.vapid_public) {
    btn.disabled = true; btn.textContent = 'Non disponible sur ce navigateur'; return;
  }
  const reg = await navigator.serviceWorker.ready;
  const cur = await reg.pushManager.getSubscription();
  if (cur && Notification.permission === 'granted') { btn.textContent = '✅ Notifications activées'; btn.disabled = true; return; }
  btn.onclick = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Autorisez les notifications dans les réglages de votre navigateur.');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(S.config.vapid_public) });
      await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      btn.textContent = '✅ Notifications activées'; btn.disabled = true; toast('Notifications activées');
    } catch (e) { toast(e.message, true); }
  };
}

// ------------------------------------------------------------ démarrage
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    [S.config] = await Promise.all([api('/config'), refreshMe()]);
  } catch (e) {
    view.innerHTML = `<div class="card empty"><h2>Connexion impossible</h2><p>${esc(e.message)}</p><button class="btn btn-primary" id="retry">Réessayer</button></div>`;
    $('#retry').onclick = () => location.reload();
    return;
  }
  window.addEventListener('hashchange', router);
  setInterval(async () => { if (S.user && document.visibilityState === 'visible') { const old = S.unread; await refreshMe().catch(() => {}); if (S.unread !== old) renderChrome(); } }, 60000);
  router();
}
boot();
})();
