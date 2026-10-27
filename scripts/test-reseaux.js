#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   RÉSEAUX — instagram / facebook de general.json atteignent-ils le site ?
   ═══════════════════════════════════════════════════════════════════════════
   Jusqu'au 27/10, les boutons réseaux de index.html étaient en dur (href="#") : les deux champs de
   general.json, éditables dans l'admin, n'allaient nulle part. general.json est INTERCEPTÉ (le fichier
   du dépôt n'est ni lu ni écrit) et servi en quatre variantes :
     1. les deux vides (l'état de Sassy)      → les deux boutons masqués, le bloc « réseaux » masqué ;
     2. instagram seul                         → son lien, nouvel onglet ; facebook masqué ; bloc visible ;
     3. les deux remplis                       → les deux liens ;
     4. clés ABSENTES (fork sans le champ)     → rien n'est touché : boutons et bloc tels que le HTML ;
     5. « javascript:alert(1) »                → bouton masqué, AUCUN href posé (seul http(s) passe).
   ⚠️ ROUGE avant le branchement du loader (boutons en href="#" et bloc visible quoi que dise le fichier).
   USAGE :  node <serveur statique> . 8080   puis   node scripts/test-reseaux.js 8080
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GENERAL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_data', 'general.json'), 'utf8'));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

const IG = 'https://www.instagram.com/sonde.reseaux/', FB = 'https://www.facebook.com/sonde.reseaux';
const sans = (o, ...cles) => { const c = { ...o }; cles.forEach(k => delete c[k]); return c; };
const CAS = [
  { nom: '1 · les deux vides',  data: { ...GENERAL, instagram: '', facebook: '' }, ig: null, fb: null, bloc: false },
  { nom: '2 · instagram seul',  data: { ...GENERAL, instagram: IG, facebook: '' }, ig: IG,   fb: null, bloc: true },
  { nom: '3 · les deux',        data: { ...GENERAL, instagram: IG, facebook: FB }, ig: IG,   fb: FB,   bloc: true },
  { nom: '4 · clés absentes',   data: sans(GENERAL, 'instagram', 'facebook'),      ig: '#',  fb: '#',  bloc: true },
  /* Un lien qui n'est pas http(s) n'est JAMAIS posé : masqué comme s'il était vide (href resté « # »). */
  { nom: '5 · javascript:',      data: { ...GENERAL, instagram: 'javascript:alert(1)', facebook: FB }, ig: null, fb: FB, bloc: true, hrefIg: '#' },
];

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const fails = [], lignes = [];
  for (const c of CAS){
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 390, height: 844, isMobile: true });
    await p.setRequestInterception(true);
    p.on('request', r => /\/_data\/general\.json(\?.*)?$/.test(r.url())
      ? r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(c.data) }) : r.continue());
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
    const m = await p.evaluate(() => {
      const lu = cle => { const a = document.querySelector(`.soc-btn[aria-label="${cle}"]`);
        if (!a || getComputedStyle(a).display === 'none') return null;
        return { href: a.getAttribute('href'), cible: a.getAttribute('target') }; };
      const bloc = document.querySelector('.socials'), ci = bloc && bloc.closest('.ci-block');
      const brut = document.querySelector('.soc-btn[aria-label="instagram"]');
      return { ig: lu('instagram'), fb: lu('facebook'), bloc: !!ci && getComputedStyle(ci).display !== 'none', hrefIg: brut && brut.getAttribute('href') };
    });
    const bon = (vu, attendu) => attendu === null ? vu === null : !!vu && vu.href === attendu && (attendu === '#' || vu.cible === '_blank');
    const ok = bon(m.ig, c.ig) && bon(m.fb, c.fb) && m.bloc === c.bloc && (c.hrefIg === undefined || m.hrefIg === c.hrefIg);
    const dit = v => v === null ? 'masqué' : `${v.href}${v.cible ? ' (' + v.cible + ')' : ''}`;
    lignes.push(`| ${c.nom} | instagram ${dit(m.ig)} (href posé : ${m.hrefIg}) · facebook ${dit(m.fb)} · bloc ${m.bloc ? 'visible' : 'masqué'} | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`${c.nom} : attendu instagram ${c.ig === null ? 'masqué' : c.ig}, facebook ${c.fb === null ? 'masqué' : c.fb}, bloc ${c.bloc ? 'visible' : 'masqué'}`);
    await ctx.close();
  }
  await b.close();
  console.log('\n═══ RÉSEAUX — general.json → boutons du site ═══\n\n| Cas | Mesuré | |\n|---|---|---|\n' + lignes.join('\n'));
  if (fails.length){ console.log('\n❌ ' + fails.length + ' échec(s) :\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('\n✅ RÉSEAUX — un lien rempli atteint son bouton, un vide le masque, une clé absente ne touche à rien.');
})();
