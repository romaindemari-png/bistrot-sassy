# Instructions projet (Claude Code)

Ce projet suit **[LELAB.md](./LELAB.md)** — **lis-le en priorité** avant toute évolution (vision, charte, architecture, système de blocs, frontière LeDash/LeLab+).

## État
- La **fondation technique a été réparée et vérifiée en prod**. Point clé : `save-data` écrit dans GitHub via le **proxy Git Gateway** (`${process.env.URL}/.netlify/git/github`), **pas** `api.netlify.com`.

## Conventions de travail
- **Parler / écrire en français.**
- **Montrer le diff et le faire valider AVANT d'appliquer** une modification.
- **Tester / vérifier après chaque étape** (et travailler par étapes isolées et réversibles).
- Ne pas réécrire l'historique git ni committer/pousser sans accord explicite.

## Où sont les choses
- Données du site : **`_data/`** (`general`, `horaires`, `carte`, `photos`, `events`).
- Injection des données dans la page : **`sassy-cms-loader.js`** (par ID dans `index.html`).
- Admin custom : **`admin/index.html`** (POST vers la fonction de sauvegarde).
- Fonctions serverless : **`netlify/functions/`** (`save-data.js`, `publish-instagram.js`).
- Site : **`index.html`** (statique, sans build).
