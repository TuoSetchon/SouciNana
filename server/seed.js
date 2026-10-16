// Offres de départ (vérifiées le 16/10/2026) — à lancer une fois : node server/seed.js
const db = require('./db');
const OFFERS = [
  { title: 'Responsable des Ressources Humaines (H/F)', employer: 'FRUITEQ CI', location: 'Sédiogo, Sinématiali', category: 'ci', domain: 'Ressources humaines', contract: 'CDD évolutif',
    description: 'Rattaché(e) à la Direction Générale, sur le site industriel de Sédiogo : recrutement des saisonniers avant les pics de récolte, contrats, présences et heures supplémentaires, supervision de la paie avec la comptabilité, respect du droit du travail, prévention des risques (HSE), dialogue social.',
    requirements: 'Bac+4/5 en GRH ou droit du travail ; 5 à 10 ans d’expérience, idéalement dans l’industrie ou l’agriculture ; forte présence terrain ; français courant, anglais intermédiaire.',
    apply_url: 'https://www.emploi.ci/offre-emploi-cote-ivoire/responsable-ressources-humaines-hf-sediogo-sous-prefecture-sinematiali-0', source: 'emploi.ci' },
  { title: 'Senior Manager RH (H/F)', employer: 'C2S GROUP', location: 'Abidjan', category: 'ci', domain: 'Ressources humaines', contract: 'CDD', salary: '700 000 FCFA net / mois + 50 000 FCFA télécom',
    description: 'Stratégie RH avec la direction générale, structuration de l’organisation et GPEC, recrutement, développement des compétences, conformité, relations sociales, management de l’équipe RH, digitalisation, supervision de la gestion externalisée du personnel.',
    requirements: 'Bac+5 en RH, management, droit social ou équivalent ; 5 à plus de 10 ans d’expérience RH ; paie, SIRH, Excel.',
    apply_url: 'https://www.emploi.ci/offre-emploi-cote-ivoire/senior-manager-rh-hf-abidjan-2095410', source: 'emploi.ci' },
  { title: 'Programme Associate (G-6)', employer: 'UNFPA', location: 'Abidjan', category: 'onu', domain: 'Social & Humanitaire', contract: 'Recrutement local', deadline: '2026-10-20',
    description: 'Poste de soutien aux programmes du Fonds des Nations Unies pour la population en Côte d’Ivoire. Recrutement local.',
    apply_url: 'https://unvacancies.org/jobs/programme-associate-g6-abidjan-cote-d-ivoire-PA-37279', source: 'UNFPA via unvacancies.org' },
  { title: 'Economist (NO-C)', employer: 'Secrétariat des Nations Unies', location: 'Abidjan', category: 'onu', domain: 'Comptabilité & Finance', contract: 'Administrateur national', deadline: '2026-10-20',
    description: 'Poste d’économiste réservé aux ressortissants ivoiriens.', apply_url: 'https://unvacancies.org/jobs/economist-N-284608', source: 'ONU via unvacancies.org' },
  { title: 'Consultant international – Rédaction et révision', employer: 'UNICEF', location: 'Abidjan', category: 'onu', domain: 'Communication & Médias', contract: 'Consultance', deadline: '2026-10-27',
    description: 'Révision du rapport annuel et des rapports de situation du bureau pays en anglais.',
    apply_url: 'https://unvacancies.org/jobs/international-consultant-editing-and-review-the-english-country-office-annual-report-annual-sitrep-t-F-596251', source: 'UNICEF via unvacancies.org' },
];
async function seed() {
  let n = 0;
  for (const o of OFFERS) {
    if (await db.one('SELECT id FROM offers WHERE apply_url=$1', [o.apply_url])) continue;
    await db.q(`INSERT INTO offers(title,employer,location,category,domain,contract,salary,deadline,description,requirements,apply_url,source,status,published_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'publiee',now())`,
    [o.title, o.employer, o.location, o.category, o.domain, o.contract || null, o.salary || null, o.deadline || null, o.description || null, o.requirements || null, o.apply_url, o.source]);
    n++;
  }
  return n;
}
module.exports = { seed };
if (require.main === module) {
  db.init().then(seed).then((n) => { console.log(`${n} offre(s) ajoutée(s)`); process.exit(0); });
}
