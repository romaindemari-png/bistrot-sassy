#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   ALLER-RETOUR NEUTRE — un éditeur ne doit pas corrompre ce qu'il n'a pas touché.
   ═══════════════════════════════════════════════════════════════════════════
   Il ouvre CHAQUE éditeur, appelle « Publier » SANS RIEN CHANGER, intercepte le POST RÉEL, et
   vérifie que le JSON envoyé est IDENTIQUE À L'OCTET PRÈS au fichier d'origine.

   POURQUOI : c'est le test qui a prouvé le correctif des horaires de Benoît — et qui, le 14/07, a
   sorti DEUX bugs de plus, tous deux invisibles autrement :
     · events.json portait un champ `photo` que l'éditeur EFFAÇAIT à chaque publication. Un éditeur
       ne doit JAMAIS détruire ce qu'il n'affiche pas → les clés inconnues sont restituées.
     · <input type="time"> IMPOSE les minutes : « 8h » revenait « 8h00 ». Un champ qu'on N'A PAS
       TOUCHÉ doit se réécrire TEL QUEL → l'écriture d'origine est mémorisée et restituée.
   Le master n'avait par ailleurs JAMAIS reçu le correctif du zéro-padding porté chez Masa : ici,
   l'éditeur d'horaires ne postait tout simplement RIEN.

   ⚠️ Rejouer après TOUT lot qui touche à un éditeur ou au chemin de sauvegarde.
   USAGE :  python3 -m http.server 8080   puis   node scripts/test-allerretour.js 8080
   Sortie non nulle si un seul éditeur modifie son fichier.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT = process.argv[2] || '8080';
const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
  const p=await b.newPage(); await p.setViewport({width:390,height:900});
  const err=[]; p.on('pageerror',e=>err.push(e.message));
  await p.goto(`http://localhost:${PORT}/admin/`,{waitUntil:'networkidle0'});
  const r=await p.evaluate(async()=>{
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    document.body.classList.add('authed');
    await loadSassyData();                      // ⚠️ le VRAI chargement, depuis les VRAIS _data/
    studioReady = true;
    await pause(300);
    const cartes = toutesLesCartes().filter(c => c.editable);
    const out = [];
    for (const c of cartes){
      window.__envoye = null;
      window.getToken = async () => 'x';
      window.authedFetch = async (u, body) => { window.__envoye = body; return { ok:true, json: async()=>({ok:true}) }; };
      openEdit(c.edit); await pause(700);
      const avant = await fetch('/_data/' + c.fichier + '.json').then(r => r.ok ? r.json() : null).catch(()=>null);
      await saveSection(); await pause(250);
      const envoye = window.__envoye;
      out.push({
        edit: c.edit, fichier: c.fichier,
        poste: !!envoye,
        section: envoye && envoye.section,
        identique: JSON.stringify(avant) === JSON.stringify(envoye && envoye.data),
        avant: JSON.stringify(avant || null),
        apres: JSON.stringify((envoye && envoye.data) || null),
      });
      closeEdit(); await pause(200);
    }
    return out;
  });
  console.log('\n═══ ALLER-RETOUR NEUTRE — publier SANS RIEN CHANGER ═══\n');
  let ko=0;
  r.forEach(x=>{
    const ok = x.poste && x.identique;
    if(!ok) ko++;
    console.log(`  ${ok?'✓':'✗'} ${x.edit.padEnd(10)} → _data/${(x.fichier+'.json').padEnd(14)} section=${String(x.section).padEnd(9)} ${ok?'IDENTIQUE':'⚠️ MODIFIÉ'}`);
    if(!ok){ console.log(`      avant : ${x.avant}`); console.log(`      écrit : ${x.apres}`); }
  });
  if(err.length) console.log('\n  ⚠️ erreurs JS : '+err.join(' | '));
  console.log(`\n──── ${ko===0 ? '✓ '+r.length+'/'+r.length+' — aucun éditeur ne corrompt ses données' : ko+' ÉDITEUR(S) CORROMPU(S)'} ────\n`);
  await b.close(); process.exit(ko?1:0);
})();
