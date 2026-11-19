# Organisation du travail

## Branches
- `main` : toujours fonctionnel (compile + tests verts). On ne pousse JAMAIS directement dessus.
- `feat/roles-acces` (Personne A), `feat/emission` (Personne B), `feat/verification-revocation` (Personne C).

## Cycle de travail
1. `git checkout main && git pull`
2. `git checkout -b feat/ma-branche`
3. Commits petits et clairs (`feat: ...`, `test: ...`, `docs: ...`, `fix: ...`)
4. `git push -u origin feat/ma-branche` puis Pull Request vers `main`
5. Relecture croisée : A relit B, B relit C, C relit A. Merge après validation.

## Règles
- Avant chaque PR : `npx hardhat test`.
- Ne jamais commiter `.env`, clés privées, phrases de récupération.
- `frontend/contract-config.js` est généré par `npm run deploy:local` (ignoré par git).
