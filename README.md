# CertChain - Certification de diplômes sur Ethereum

Projet Blockchain IGL4 (2026) - DApp : smart contract Solidity `CertificateRegistry` + interface web (HTML, ethers.js, MetaMask).

**Équipe** : Maha Tlili (rôles & accès)_, Emna Kallel (émission)_, Yossr Galai (vérification & révocation)_

## Principe
Seul le **hash SHA-256** du diplôme est enregistré on-chain (jamais le PDF, jamais de donnée personnelle). Un employeur dépose le fichier : le navigateur recalcule le hash et interroge le contrat -> **valide / révoqué / expiré / inconnu**.

| Rôle | Droits |
|---|---|
| Admin (université) | ajouter / retirer des émetteurs |
| Émetteur (département) | émettre un certificat, révoquer ses propres certificats |
| Vérificateur (n'importe qui) | vérifier (lecture seule) |

## Prérequis
- Node.js 18+ (LTS recommandé), npm, Git
- Extension MetaMask

## Installation
```bash
git clone <url-du-depot>
cd certchain
npm install
```

## Lancer en local (3 terminaux)
```bash
# Terminal 1 : blockchain locale (chainId 31337, 20 comptes de test)
npx hardhat node

# Terminal 2 : déploiement (écrit l'adresse dans frontend/contract-config.js)
npm run deploy:local

# Terminal 3 : interface web
npm run front        # http://localhost:3000
```

## Configurer MetaMask
1. Ajouter un réseau : RPC `http://127.0.0.1:8545`, Chain ID `31337`, symbole `ETH`.
2. Importer 2 comptes de test affichés par `npx hardhat node` :
   compte #0 = **admin**, compte #1 = **émetteur** (ajouté automatiquement au déploiement).
   Ces clés sont publiques et ne valent rien : n'utilisez jamais de vrais fonds.

## Tests
```bash
npx hardhat test
```

## Scénarios de démo
- Réussi : admin ajoute un émetteur -> l'émetteur émet un certificat -> n'importe qui le vérifie (Valide).
- Rejeté : un non-admin ajoute un émetteur ; doublon ; hash vide ; révocation par un tiers.

## Structure
```
contracts/   smart contract Solidity
test/        tests Hardhat (réussi / rejeté)
scripts/     déploiement
frontend/    interface web
docs/        schémas, slides, preuves de tests
```

## Limites
- La blockchain prouve l'enregistrement par un émetteur autorisé, pas la véracité du diplôme.
- Coûts de gas, tout est public (d'où le hash uniquement).
- Si l'on perd le fichier original, on ne peut pas recalculer le hash.
