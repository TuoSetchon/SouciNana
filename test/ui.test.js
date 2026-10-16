// Parcours dans l'interface sur un écran de téléphone (Playwright)
const { chromium } = require('playwright');
const OUT = process.argv[2]; const BASE = 'http://localhost:3333';
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
  const goto = async (h) => { await page.goto(BASE + '/' + h); await page.waitForSelector('#view :not(.spinner)'); await page.waitForTimeout(400); };

  await goto(''); await shot('01-accueil');
  await goto('#/offres'); await shot('02-offres');
  await page.click('.offer'); await page.waitForTimeout(600); await shot('03-offre-verrouillee');
  await goto('#/cv'); await shot('04-formules-cv');

  // inscription candidat
  await goto('#/inscription');
  await page.fill('#rn', 'Koné Awa'); await page.fill('#rp', '0511223344'); await page.fill('#rv', 'Korhogo'); await page.fill('#rw', 'secret1');
  await page.click('text=Ressources humaines');
  await shot('05-inscription');
  await page.click('button:has-text("Créer mon compte")'); await page.waitForURL(/abonnement/); await page.waitForTimeout(700);
  await shot('06-compte-en-attente-paiement');
  await page.fill('[name=transaction_ref]', 'WV-8899'); await page.fill('[name=payer_phone]', '0511223344');
  await page.click('button:has-text("J’ai fait le dépôt")'); await page.waitForTimeout(900); await shot('07-depot-envoye');

  // admin valide
  const a = await ctx.browser().newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const ap = await a.newPage(); ap.on('pageerror', (e) => errors.push('admin: ' + e));
  await ap.goto(BASE + '/#/connexion'); await ap.waitForSelector('#lp');
  await ap.fill('#lp', '0788589231'); await ap.fill('#lw', 'admin123'); await ap.click('button:has-text("Se connecter")');
  await ap.waitForURL(/admin/); await ap.waitForTimeout(800); await ap.screenshot({ path: `${OUT}/08-admin-tableau.png`, fullPage: true });
  await ap.goto(BASE + '/#/admin/paiements'); await ap.waitForTimeout(800); await ap.screenshot({ path: `${OUT}/09-admin-depots.png`, fullPage: true });
  await ap.click('button:has-text("Valider")'); await ap.waitForTimeout(800);

  // candidat actif
  await goto('#/compte'); await shot('10-compte-actif');
  await goto('#/offre/1'); await shot('11-offre-debloquee');
  await goto('#/commander'); await shot('12-commande-cv');
  await goto('#/notifications'); await shot('13-alertes');

  // recruteur
  const r = await ctx.browser().newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const rp = await r.newPage(); rp.on('pageerror', (e) => errors.push('rec: ' + e));
  await rp.goto(BASE + '/#/inscription?role=recruteur'); await rp.waitForSelector('#rc');
  await rp.fill('#rn', 'M. Traoré'); await rp.fill('#rc', 'Nord BTP'); await rp.fill('#rp', '0707070707'); await rp.fill('#rw', 'secret1');
  await rp.click('button:has-text("Créer mon compte")'); await rp.waitForURL(/recruteur/); await rp.waitForTimeout(500);
  await rp.goto(BASE + '/#/recruteur/nouvelle'); await rp.waitForSelector('#ft');
  await rp.fill('#ft', 'Conducteur de travaux'); await rp.fill('#fl', 'Korhogo'); await rp.selectOption('#fd', 'BTP & Génie civil');
  await rp.fill('#fdesc', 'Suivi de chantiers de forages et châteaux d’eau.');
  await rp.screenshot({ path: `${OUT}/14-recruteur-publier.png`, fullPage: true });
  await rp.click('button:has-text("Enregistrer et passer au paiement")'); await rp.waitForTimeout(900);
  await rp.screenshot({ path: `${OUT}/15-recruteur-paiement.png`, fullPage: true });

  await ap.goto(BASE + '/#/admin/reglages'); await ap.waitForTimeout(800); await ap.screenshot({ path: `${OUT}/16-admin-reglages.png`, fullPage: true });
  // desktop
  const d = await ctx.browser().newContext({ viewport: { width: 1280, height: 860 }, locale: 'fr-FR' });
  const dp = await d.newPage(); await dp.goto(BASE + '/'); await dp.waitForTimeout(1200); await dp.screenshot({ path: `${OUT}/17-accueil-ordinateur.png` });
  // largeur : pas de défilement horizontal
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log('Débordement horizontal mobile :', over);
  console.log('Erreurs :', errors.length ? errors : 'aucune');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
