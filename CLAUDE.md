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
- Données du site : **`_data/`** (`general`, `horaires`, `carte`, `photos`, `events`, `config`).
- Injection des données dans la page : **`sassy-cms-loader.js`** (par ID dans `index.html`).
- Admin custom : **`admin/index.html`** (POST vers la fonction de sauvegarde).
- Fonctions serverless : **`netlify/functions/`** (`save-data.js`, `publish-instagram.js`).
- Site : **`index.html`** (statique, sans build).

## Frontend — animations & carte (à connaître avant d'y toucher)
- **Smooth scroll Lenis** : chargé par CDN, activé **desktop uniquement** (`window.innerWidth >= 768`) **et** seulement hors `prefers-reduced-motion`. En mobile / reduced-motion, on garde le scroll natif. Lenis pilote `ScrollTrigger.update`.
- **GSAP + ScrollTrigger** (CDN, `registerPlugin`) : **tous les reveals sont sous garde `!matchMedia('(prefers-reduced-motion: reduce)')`**. Reveals au scroll = `.s-title`, `.s-label`, stagger photos (`#about .about-photo`, `#galerie .galerie-cell`), `.horaires-row`, `.ci-block`, bloc `#cms-carte`. **Hero = reveal au _load_** (`immediateRender`, clip-path sur `.hero-title` — pas de ScrollTrigger). Ajouter une anim ⇒ la placer dans ce même bloc gardé.
- **Carte = « ardoise »** : générée par `renderCarte()` dans `sassy-cms-loader.js`, injectée dans `#cms-carte`. Layout une colonne, leader dots (`.plat-dots`), ordre de catégories fixe (`ORDER`), **auto-masquage des catégories vides**. Le tampon « cette semaine » est statique dans `index.html`.
- **Blocs optionnels** : `sassy-cms-loader.js` lit `_data/config.json` (`blocs.optionnels`) et **masque** les sections désactivées (`actif:false`). **Fallback sûr** : config absent / vide / illisible ⇒ tout reste affiché (on ne masque que ce qui est explicitement désactivé).
  ⚠️ **LE LOADER NE SAIT QUE MASQUER.** Il n'a aucune branche pour `actif:true` : mettre un bloc à `true` ne réaffiche rien, ça se contente de ne pas le masquer. Une section masquée par du **CSS statique** reste donc masquée quoi que dise le config — c'était le cas de `#events` du 20/07/2026 au 14/09/2026, avec un commentaire qui annonçait le contraire dans `index.html`, ici, et au BACKLOG. La règle statique a été retirée le 14/09 ; **ne pas en réintroduire** pour masquer un bloc, c'est `config.json` qui décide.
- Divers : `<meta name="color-scheme" content="light">` (pas de dark auto) ; année footer dynamique (`#yr`) ; **marquee retiré**.
