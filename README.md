# BonPro

Application web installable (PWA) : offres d'emploi vérifiées (Côte d'Ivoire, Nations Unies & partenaires, Canada), comptes candidats avec abonnement mensuel validé manuellement (dépôt Wave / Orange Money), alertes, commande de CV en ligne et espace recruteurs payant.

## Lancer en local
```
npm install
npm start          # base PGlite locale dans ./data
npm test           # 38 vérifications des parcours
```

## Production
- `DATABASE_URL` : base PostgreSQL
- `ADMIN_PHONE`, `ADMIN_PASSWORD` : compte administrateur créé au premier démarrage
- `NODE_ENV=production`
- Facultatif : `JWT_SECRET`, `API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (générés et stockés en base sinon)

`npm run seed` ajoute les premières offres.

## Publication automatique d'offres
`POST /api/integration/offers` avec l'en-tête `X-API-Key` (clé visible dans Réglages) et un tableau d'offres :
`{ title, employer, location, category: ci|onu|canada, domain, contract, salary, deadline: AAAA-MM-JJ, description, requirements, apply_url, source }`.
Les doublons (même `apply_url`) sont ignorés.
