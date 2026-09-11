/* ⚠️ SITE_URL et le jeton des Blobs étaient ÉCRITS EN DUR ici — et pas pareil selon le fork.
   Ils vivent désormais dans netlify/lib/site.mjs : UNE seule vérité, et le fichier redevient
   IDENTIQUE d'un fork à l'autre. (Le repli du master pointait sur « gorgeous-heliotrope », un
   domaine qui n'est même pas le sien ; et un `cp` vers Masa aurait cassé ses Blobs.) */
import { SITE_URL, verifyIdentity, storeOpts } from '../lib/site.mjs';
// netlify/functions/generate-caption.mjs
// Génère une légende Instagram + hashtags via Claude API (Instagram studio LeLab+).
// POST protégé par le JWT Netlify Identity. Clé ANTHROPIC_API_KEY côté serveur uniquement.

// Toujours cibler l'Identity de prod (même depuis un deploy preview)



/* 🐛 THEME_LABEL ÉTAIT PÉRIMÉ. Il connaissait « plat », « menu », « ambiance », « event » — mais les
   thèmes s'appellent aujourd'hui sassy-carte, sassy-dujour, sassy-photo, masamadre-cematin…
   AUCUN ne matchait, donc `theme` valait TOUJOURS « publication » : le modèle ne savait même pas de
   quel type de post il s'agissait.
   ⚠️ On indexe désormais sur le KIND (typo / photo / infos / annonce / event), qui est stable et
   commun à tous les forks — pas sur l'ID du thème, qui porte le nom du client. */
const KIND_LABEL = {
  typo:    'un visuel typographique (une liste de produits, sans photo)',
  photo:   'une photo',
  infos:   'un visuel d\'informations pratiques',
  annonce: 'une annonce',
  event:   'un événement',
};
const FORMAT_LABEL = { square: 'post carré', portrait: 'portrait', story: 'story' };

// Extrait le 1er objet JSON d'un texte (tolère ```json … ``` ou texte autour)
function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!(await verifyIdentity(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Non autorisé' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY manquante' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const nom   = (body.nom   || 'le commerce').toString().slice(0, 80);
  const type  = (body.type  || 'restaurant').toString().slice(0, 40);
  const ville = (body.ville || 'Marseille').toString().slice(0, 60);
  // (le libellé est calculé plus bas, une fois `kind` connu)
  const format = FORMAT_LABEL[body.format] || 'post';
  const contentText = (body.contentText || '').toString().slice(0, 600);
  // base64 JPEG nu (sans préfixe data:) — envoyé seulement si le champ texte est vide côté client
  const imageBase64 = (body.imageBase64 || '').toString().replace(/^data:image\/\w+;base64,/, '');

  const adresse   = (body.adresse   || '').toString().slice(0, 200);
  const horaires  = (body.horaires  || '').toString().slice(0, 500);
  const telephone = (body.telephone || '').toString().slice(0, 40);
  const kind      = (body.kind      || '').toString().slice(0, 20);
  const date      = (body.date      || '').toString().slice(0, 60);   // « mardi 14 juillet 2026 »
  const theme     = KIND_LABEL[kind] || 'une publication';
  const aVuLImage = !!imageBase64;

  const isInfos = body.mode === 'infos';                            // rédaction du TEXTE DU VISUEL (infos)
  const isAnnonce = body.mode === 'annonce';                        // MISE EN FORME du texte du visuel (annonce)
  /* 🔴 `isStory` SE DÉDUISAIT DU FORMAT, ET C'ÉTAIT FAUX :
           const isStory = !isInfos && !isAnnonce && body.format === 'story';
     « Format story » ne veut pas dire « texte peint sur l'image ». Seul le genre PHOTO est dans ce
     cas ; la carte, le plat du jour, les infos et l'annonce ont leur propre machinerie de texte et
     gardent une légende Instagram normale, story ou pas. Conséquences mesurées :
       · ANNONCE en story → cette branche gagnait, `isAnnonceCaption` devenait MORT-NÉ, et le
         modèle répondait une accroche de 10 mots au lieu de la légende de l'annonce ;
       · CARTE en story → même branche, donc une légende de 10 mots et AUCUN hashtag.
     ⚠️ ON NE LA RECALCULE PLUS ICI. Le client SAIT quel geste il demande — il le DÉCLARE, comme il
        déclarait déjà 'infos' et 'annonce'. La règle vit en UN endroit (studioStoryMode, côté
        client) au lieu de trois qui divergeaient. Le format reste dans le corps de la requête : il
        sert au LIBELLÉ du prompt, plus à décider du geste.
     ⚠️ CHANGEMENT DE CONTRAT : cette fonction et le client qui l'appelle doivent voyager ENSEMBLE.
        Un serveur neuf avec un client ancien perdrait l'accroche des stories photo (aucun `mode`
        envoyé → légende normale) ; l'inverse rétablirait les deux bugs. */
  const isStory = body.mode === 'story';                            // accroche courte peinte SUR la photo
  const isAnnonceCaption = !isAnnonce && !isStory && kind === 'annonce';  // LÉGENDE d'une annonce
  const isInfosCaption = !isInfos && !isStory && kind === 'infos';  // LÉGENDE d'un post infos → sobre & utile

  // L'annonce est ÉCRITE par le client : sans message, il n'y a rien à mettre en forme.
  // Garde-fou serveur (le client garde déjà le bouton) : on ne laisse pas l'IA inventer une annonce.
  if (isAnnonce && !contentText.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Écrivez votre annonce : l\'IA la met en forme, elle ne l\'invente pas.' }) };
  }

  /* ═══ LE SOCLE — les règles de LELAB.md, écrites UNE SEULE FOIS ═══════════════════════════
     ⚠️ AUCUN RÔLE INCARNÉ. Les anciens prompts disaient « Tu es community manager pour un {type}
     nommé {nom} » : un rôle incarné produit du PASTICHE — « Rien de tel qu'un bon moment en
     terrasse », « On vous attend ! ». On donne une CONSIGNE, pas un personnage.
     ⚠️ Les formules interdites sont NOMMÉES. « Évite les clichés » ne veut rien dire pour un modèle. */
  /* ⚠️ LA DISTINCTION QUI COMPTE, et qu'on avait ratée : on interdit les FAITS INVENTÉS, PAS
     L'ÉCRITURE. Le premier jet interdisait tellement de choses qu'il produisait des télégrammes
     (« Aujourd'hui, on décore. ») — exact, et mort. Décrire une croûte dorée qu'on VOIT : oui.
     Affirmer qu'elle est « faite maison » : non, on n'en sait rien. */
  const RIEN_INVENTER =
    `⚠️ LA SEULE LIGNE À NE PAS FRANCHIR : LES FAITS.\n` +
    `Tu peux écrire, décrire, donner envie. Tu ne peux pas AFFIRMER ce qui ne t'a pas été donné.\n` +
    `- Décrire ce que tu VOIS sur la photo : OUI, c'est même ce qu'on attend de toi.\n` +
    `- Affirmer un prix, une provenance, un ingrédient, un horaire : NON. Tu ne les as pas.\n` +
    `- Écrire « fait maison », « artisanal », « bio », « de saison », « local » : NON. Ce sont des ALLÉGATIONS invérifiables — et le commerçant en est juridiquement responsable.\n` +
    `- Déduire une saison, une météo, une fête : NON. La date t'est donnée ; tout le reste, tu l'ignores.\n` +
    `- Écrire « ce matin », « ce midi », « ce soir », « aujourd'hui » : NON. Tu ne sais NI quand la photo a été prise, NI quand le commerçant publiera. (Testé : le modèle écrit « ce midi » sans y penser — c'est un fait, et il est faux une fois sur deux.)\n` +
    `Le commerçant publie sous SON nom. Un fait inventé est un MENSONGE qu'il signe.\n`;

  const FORMULES_INTERDITES =
    `FORMULES INTERDITES — ne les produis JAMAIS, sous aucune variante :\n` +
    `- « On vous attend », « On vous attend nombreux », « Venez nombreux », « À très vite »\n` +
    `- « Rien de tel qu'un/une… », « Quoi de mieux que… », « Il n'y a pas mieux que… »\n` +
    `- « Un moment convivial », « dans la joie et la bonne humeur », « comme à la maison »\n` +
    `- « Chers clients », « Toute l'équipe vous remercie », « Toute l'équipe vous souhaite »\n` +
    `- « pour bien démarrer la journée », « pour bien commencer la semaine »\n` +
    `- « Le plaisir des papilles », « un régal », « un délice », « une pure gourmandise »\n` +
    `- « Venez découvrir », « Laissez-vous tenter », « Craquez pour »\n` +
    `- Toute question rhétorique (« Envie d'une pause ? »)\n` +
    `- Tout superlatif non fourni (« le meilleur », « incontournable », « exceptionnel »)\n`;

  /* ⚠️ VOIR N'EST PAS SAVOIR. Même avec l'image, le modèle peut confondre un croissant et un pain
     au chocolat, ou inventer un prix qu'il croit lire. Il décrit ce qu'il VOIT, il ne NOMME que ce
     que le client a écrit. */
  const AVEC_IMAGE =
    `TU AS LA PHOTO. C'EST TA MATIÈRE PREMIÈRE — SERS-T'EN.\n` +
    `Regarde-la vraiment, et parle de ce qu'elle montre : les couleurs, les textures, ce qui est posé à côté, le geste en cours.\n` +
    `Une légende qui ne dit rien de la photo est une légende ratée.\n\n` +
    `⚠️ Mais VOIR N'EST PAS SAVOIR :\n` +
    `- Tu peux DÉCRIRE librement ce que tu vois.\n` +
    `- Tu ne NOMMES un produit que si le commerçant l'a écrit — tu peux te tromper (un croissant n'est pas un pain au chocolat).\n` +
    `- ⚠️ Cela vaut pour TOUT ce que tu vois, pas seulement les produits : un couvert, un contenant, une matière, un ingrédient. (Testé : le modèle a écrit « une cuillère » devant une FOURCHETTE.)\n` +
    `- Si tu n'es pas sûr du nom, DÉCRIS au lieu de NOMMER : « un couvert » plutôt que « une cuillère », « des petites baies rouges » plutôt que « des grains de grenade », « ce qui sort du four » plutôt que « des croissants ».\n` +
    `- Ne lis aucun prix ni aucune étiquette sur l'image : tu peux mal lire.\n`;

  const SANS_IMAGE =
    `⚠️ TU N'AS PAS LA PHOTO. Tu ne sais donc PAS ce qui est montré.\n` +
    `- NE DÉCRIS RIEN. Ne mentionne ni produit, ni couleur, ni lieu, ni ambiance, ni assiette, ni terrasse.\n` +
    `- Écris uniquement à partir de ce qui t'est donné : le nom du commerce, le texte du commerçant, la date.\n` +
    `- Si le commerçant n'a rien écrit, produis une légende NEUTRE et courte, qui n'affirme rien (ex. « Aujourd'hui à la boulangerie. »). C'est acceptable. Inventer ne l'est pas.\n`;

  /* ⚠️ LES EXEMPLES sont ce qui a le mieux marché pour l'annonce. Une règle abstraite se contourne ;
     un exemple, non. On en donne des BONS (le niveau visé) ET des MAUVAIS (les deux façons de rater :
     le pastiche… et le télégramme, qu'on avait nous-mêmes provoqué en interdisant trop). */
  const EXEMPLES =
    `EXEMPLES — le niveau attendu.\n\n` +
    `✅ BON (photo : des pommes de terre rôties, persil, lamelles d'oignon rouge)\n` +
    `« Des pommes de terre rôties, du persil, quelques lamelles d'oignon rouge. Simple, et c'est très bien comme ça. »\n` +
    `→ Il a regardé la photo. Il décrit. Il ne survend pas. Il n'invente rien.\n\n` +
    `✅ BON (photo : une vitrine pleine de viennoiseries)\n` +
    `« La vitrine est pleine ce matin. Il va falloir choisir 🥐 »\n` +
    `→ Court, mais vivant. Une image, un sourire, zéro formule.\n\n` +
    `✅ BON (photo : une affiche de concert punaisée au mur)\n` +
    `« Une nouvelle affiche est arrivée sur notre mur. On aime bien savoir ce qui se passe dans le quartier 🎶 »\n` +
    `→ Il parle de ce qu'il voit, même quand ce n'est pas un produit.\n\n` +
    `❌ MAUVAIS — LE PASTICHE\n` +
    `« Rien de tel qu'un bon plat pour bien démarrer la journée ! Venez découvrir nos spécialités, on vous attend nombreux ☀️ »\n` +
    `→ Formules creuses, la photo n'est pas regardée, ça survend. C'est le défaut le plus fréquent.\n\n` +
    `❌ MAUVAIS — LE TÉLÉGRAMME\n` +
    `« Aujourd'hui, on décore. »\n` +
    `→ Exact, et MORT. Ça ne décrit rien, ça ne donne envie de rien. Ne pas mentir n'excuse pas de ne rien dire.\n\n` +
    `❌ MAUVAIS — LE FAIT INVENTÉ\n` +
    `« Nos légumes de saison, cuisinés maison, à savourer en terrasse au soleil. »\n` +
    `→ Ni « de saison », ni « maison », ni la terrasse, ni le soleil ne t'ont été donnés. Quatre mensonges en une phrase.\n`;

  const system = isAnnonce
    ? `Tu mets en forme l'annonce d'un commerçant, destinée à être affichée sur un visuel Instagram.\n` +
      `Le message brut est souvent télégraphique (« fermé jeudi », « congés du 5 au 20 »). ` +
      `Ta seule tâche : le réécrire proprement. Tu ne l'enrichis pas, tu ne le commentes pas, tu n'y ajoutes rien.\n\n` +
      `RÈGLES\n` +
      `- N'invente RIEN : ni date, ni motif, ni horaire, ni réouverture qui ne soit pas dans le message. Une information absente reste absente.\n` +
      `- 1 à 2 phrases, 140 caractères maximum : le texte doit tenir dans le visuel.\n` +
      `- Ton neutre et direct. Une annonce informe, elle ne vend pas.\n` +
      `- Aucun hashtag, aucun emoji, aucune majuscule d'insistance, pas de points d'exclamation en rafale.\n` +
      `- Ni salutation, ni signature, ni remerciement.\n\n` +
      `FORMULES INTERDITES — ne les produis JAMAIS :\n` +
      `- « Chers clients », « Chère clientèle »\n` +
      `- « Nous avons le plaisir de vous annoncer », « Nous sommes ravis de »\n` +
      `- « Nous vous attendons nombreux », « On vous attend de pied ferme »\n` +
      `- « dans la joie et la bonne humeur », « un moment convivial »\n` +
      `- « Toute l'équipe vous remercie », « Toute l'équipe vous souhaite »\n` +
      `- « À très vite ! », « Restez connectés »\n\n` +
      `EXEMPLES (message brut → texte attendu)\n` +
      `- « fermé jeudi » → « Fermé ce jeudi. »\n` +
      `- « congés du 5 au 20 août » → « Fermé pour congés du 5 au 20 août. »\n` +
      `- « horaires d'été on ouvre à 19h » → « Horaires d'été : ouverture à 19h. »\n` +
      `- « nouvelle carte lundi » → « Nouvelle carte à partir de lundi. »`
      + `\n\nNous sommes le ${date || 'jour non précisé'}. N'en déduis AUCUNE saison, météo ou fête qui ne te soit pas donnée.\n`
      + FORMULES_INTERDITES
    : isAnnonceCaption
    ? `Tu rédiges la légende Instagram d'une ANNONCE. Le visuel affiche déjà l'annonce ; la légende la reprend en clair, ` +
      `et n'ajoute qu'une précision réellement utile si elle figure dans les données fournies.\n` +
      `Style : factuel, direct. 1 à 2 phrases. 0 à 1 emoji. Aucun hashtag.\n` +
      `N'invente aucune information absente de l'annonce (ni date, ni motif, ni réouverture).\n` +
      `INTERDIT : « Chers clients », « Nous vous attendons nombreux », « dans la joie et la bonne humeur », ` +
      `« À très vite », « Toute l'équipe vous remercie », et tout remplissage générique.`
      + `\n\nNous sommes le ${date || 'jour non précisé'}. N'en déduis AUCUNE saison, météo ou fête qui ne te soit pas donnée.\n`
      + FORMULES_INTERDITES
    : isInfos
    ? `Tu rédiges un court texte d'informations pratiques pour un visuel Instagram de commerce. ` +
      `Style : SIMPLE, factuel, direct. Pas de chaleur forcée, pas de formules toutes faites, pas de superlatifs. ` +
      `1 à 2 phrases, 160 caractères maximum. Aucun hashtag, aucun emoji.\n\n` +
      `Formule type : « [Nom] vous accueille [horaires simples]. [Adresse]. »\n\n` +
      `RÈGLE ABSOLUE SUR LES HORAIRES :\n` +
      `- Si les horaires se regroupent PROPREMENT (mêmes heures sur plusieurs jours consécutifs), écris-les simplement : « du lundi au vendredi, 7h-19h ».\n` +
      `- Si les horaires sont IRRÉGULIERS et ne se regroupent pas proprement (heures différentes chaque jour), NE MENTIONNE PAS LES HORAIRES DU TOUT. Écris juste le nom et l'adresse. Ne les résume jamais approximativement.\n` +
      `- N'invente JAMAIS un horaire. Mieux vaut ne rien dire qu'être inexact.\n` +
      `- Mentionne le jour de fermeture s'il y en a un ET si les horaires sont réguliers.`
      + `\n\nNous sommes le ${date || 'jour non précisé'}. N'en déduis AUCUNE saison, météo ou fête qui ne te soit pas donnée.\n`
      + FORMULES_INTERDITES
    : isStory
    ? `Tu écris le texte court affiché EN GROS sur une story Instagram — pas une légende, une ACCROCHE.\n` +
      `Commerce : « ${nom} »${type ? ` (${type})` : ''}${ville ? `, ${ville}` : ''}. Nous sommes le ${date || 'jour non précisé'}.\n\n` +
      `ÉCRIS COMME LE FERAIT UN BON COMMUNITY MANAGER : il regarde la photo, il trouve LE détail qui accroche, et il le dit en peu de mots. Chaleureux, jamais mielleux.\n\n` +
      `CONTRAINTES\n` +
      `- 10 mots MAXIMUM. Le texte s'affiche EN GROS sur l'image.\n` +
      `- Français. 0 à 1 emoji. Aucun hashtag. Aucune phrase longue.\n\n` +
      `EXEMPLES\n` +
      `✅ « La vitrine est pleine. » · « Ça sort du four. » · « Nouvelle affiche sur le mur 🎶 »\n` +
      `❌ « Venez découvrir nos délices ! » (pastiche) · « Aujourd'hui. » (vide)\n\n` +
      RIEN_INVENTER + `\n` + FORMULES_INTERDITES + `\n` +
      (aVuLImage ? AVEC_IMAGE : SANS_IMAGE)
    : isInfosCaption
    ? `Tu rédiges une légende Instagram SOBRE et UTILE pour un post d'INFOS PRATIQUES. ` +
      `Elle COMPLÈTE le visuel avec des précisions concrètes qu'il ne montre pas (horaires détaillés, téléphone). ` +
      `Style : factuel, direct, aucune formule marketing. ` +
      `INTERDIT : « moment convivial », « venez comme vous êtes », « dans la chaleur du quartier », et tout remplissage générique. ` +
      `1 à 2 phrases. 0 à 1 emoji.\n` +
      `RÈGLE HORAIRES : ne JAMAIS inventer un horaire ; si irréguliers, ne pas les mentionner.`
      + `\n\nNous sommes le ${date || 'jour non précisé'}. N'en déduis AUCUNE saison, météo ou fête qui ne te soit pas donnée.\n`
      + FORMULES_INTERDITES
    /* 🔴 C'ÉTAIT LA MACHINE À PASTICHE — et elle couvrait QUATRE thèmes (carte, plat du jour, photo,
       événement) :
           « Tu es community manager pour un ${type} nommé "${nom}" à ${ville}.
             Tu écris des légendes Instagram : chaleureuses… sans clichés marketing. »
       Un RÔLE INCARNÉ (interdit par LELAB.md), une consigne d'être « chaleureux » (qui PRODUIT le
       cliché), et une interdiction vague (« sans clichés ») qui ne veut rien dire pour un modèle.
       Résultat en production : « Rien de tel qu'un bon moment en terrasse », « On vous attend ! »,
       et « quand le printemps s'invite » — GÉNÉRÉ EN JUILLET, sur une photo jamais vue. */
    /* ⚠️ ON NE DONNE PAS UN COSTUME, ON DONNE UN STANDARD DE QUALITÉ. La nuance est décisive, et on
       s'est fait avoir trois fois : « Tu es community manager » fait JOUER un rôle → le modèle
       produit ce qu'il croit qu'un community manager écrit, c'est-à-dire du pastiche. « Écris comme
       le ferait un BON community manager : [ce qui caractérise le bon travail] » donne un CRITÈRE.
       Le premier fait imiter. Le second fait viser. */
    : `Tu rédiges la légende Instagram d'un commerce de quartier. C'est LUI qui publie, sous SON nom.\n` +
      `Commerce : « ${nom} »${type ? ` (${type})` : ''}${ville ? `, ${ville}` : ''}. Nous sommes le ${date || 'jour non précisé'}.\n` +
      `Type de publication : ${theme}.\n\n` +
      `ÉCRIS COMME LE FERAIT UN BON COMMUNITY MANAGER — pas en jouant un rôle, mais en visant ce qui fait la qualité de son travail :\n` +
      `- il REGARDE la photo et il en parle. Ce qu'il voit est sa matière première.\n` +
      `- il est CHALEUREUX sans être mielleux. Un commerce de quartier parle à ses voisins, pas à une agence.\n` +
      `- il écrit 2 à 3 phrases VIVANTES. Ni télégramme, ni tunnel marketing.\n` +
      `- il donne envie SANS survendre. Un emoji ou deux, jamais plus, jamais en début de phrase.\n` +
      `- il n'affirme QUE ce qu'il sait. Il n'a pas besoin d'inventer pour bien écrire.\n\n` +
      `AUTRES CONTRAINTES\n` +
      `- Français. Pas de majuscules d'insistance, pas de points d'exclamation en rafale.\n` +
      `- 3 à 5 hashtags en minuscules, tirés de ce que tu SAIS (le métier, la ville, ce que le commerçant a écrit). Aucun hashtag creux (#food, #instafood, #yummy).\n\n` +
      RIEN_INVENTER + `\n` + FORMULES_INTERDITES + `\n` +
      (aVuLImage ? AVEC_IMAGE : SANS_IMAGE) + `\n` + EXEMPLES;

  const jsonInstruction = isAnnonce
    ? `\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :\n` +
      `{"caption": "l'annonce mise en forme", "hashtags": []}`
    : isAnnonceCaption
    ? `\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :\n` +
      `{"caption": "la légende de l'annonce", "hashtags": []}`
    : isInfos
    ? `\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :\n` +
      `{"caption": "le texte d'infos pratiques rédigé", "hashtags": []}`
    : isStory
    ? `\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :\n` +
      `{"caption": "le texte court (max 10 mots)", "hashtags": []}`
    : isInfosCaption
    ? `\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :\n` +
      `{"caption": "la légende", "hashtags": []}`
    : `\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :\n` +
      `{"caption": "la légende", "hashtags": ["#tag1", "#tag2", "#tag3"]}`;

  /* 🔴 C'EST CETTE LIGNE QUI A PRODUIT LA TERRASSE ET LE PRINTEMPS. C'était :
         `Identifie ce qui est montré (plat, ambiance, lieu…) et rédige une légende adaptée.`
     …et elle partait AUSSI QUAND IL N'Y AVAIT PAS D'IMAGE. On ORDONNAIT au modèle d'identifier ce
     qui est montré EN NE LUI MONTRANT RIEN. Le prompt COMMANDAIT l'invention ; le modèle a obéi.
     ⚠️ La consigne dépend désormais de ce qu'on lui a RÉELLEMENT donné. */
  const task = isStory
    ? (aVuLImage
        ? `Propose une accroche courte (max 10 mots) pour cette story, en t'appuyant sur ce que montre la photo.`
        : `Propose une accroche courte (max 10 mots). Tu n'as PAS la photo : ne décris rien, n'affirme rien.`)
    : (aVuLImage
        ? `Rédige la légende, en t'appuyant sur ce que montre la photo — sans nommer ce dont tu n'es pas certain.`
        : `Rédige la légende À PARTIR DES SEULES INFORMATIONS CI-DESSUS. Tu n'as PAS la photo : ne décris rien de ce qu'elle pourrait contenir.`);

  // Message utilisateur : infos (rédaction depuis les données) → texte ; sinon vision (photo) si fournie, sinon contexte texte
  let userContent;
  if (isAnnonce) {
    userContent =
      `Message brut du commerçant : « ${contentText} »\n` +
      `Nom du commerce : ${nom}\n` +
      (adresse ? `Adresse : ${adresse} (ne l'ajoute au texte QUE si le message y fait référence)\n` : '') +
      `\nMets ce message en forme.` +
      jsonInstruction;
  } else if (isAnnonceCaption) {
    userContent =
      `Annonce affichée sur le visuel : « ${contentText} »\n` +
      `Nom du commerce : ${nom}\n` +
      (adresse ? `Adresse : ${adresse}\n` : '') +
      `\nRédige la légende de cette annonce (1 à 2 phrases, sans rien inventer).` +
      jsonInstruction;
  } else if (isInfos) {
    userContent =
      `Voici mes informations :\n` +
      `- Nom : ${nom}\n` +
      `- Type de commerce : ${type}\n` +
      (adresse ? `- Adresse : ${adresse}\n` : '') +
      (horaires ? `- Horaires (données brutes à reformuler naturellement, PAS à recopier telles quelles) : ${horaires}\n` : '') +
      `\nRédige mon texte d'infos pratiques.` +
      jsonInstruction;
  } else if (isInfosCaption) {
    userContent =
      `Contexte : légende pour un post d'INFOS PRATIQUES (le visuel affiche déjà un court texte d'accueil).\n` +
      `La légende doit COMPLÉTER avec des précisions utiles — ni répétition, ni marketing.\n` +
      `Données du commerce :\n` +
      (adresse   ? `- Adresse : ${adresse}\n` : '') +
      (telephone ? `- Téléphone : ${telephone}\n` : '') +
      (horaires  ? `- Horaires (bruts — reformuler naturellement, NE PAS inventer ; si irréguliers, ne pas les mentionner) : ${horaires}\n` : '') +
      `\nRédige une légende sobre et utile (1 à 2 phrases).` +
      jsonInstruction;
  } else if (imageBase64) {
    /* ⚠️ Le texte du commerçant part AVEC l'image. Avant, l'un excluait l'autre : dès qu'il écrivait
       un titre, on cessait d'envoyer la photo — donc plus il donnait de contexte, plus le modèle
       devenait aveugle. Les deux se complètent : l'image montre, le texte NOMME. */
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
      { type: 'text', text:
        `Photo à publier sur Instagram.\n` +
        `- Commerce : ${nom}${type ? ` (${type})` : ''}${ville ? `, ${ville}` : ''}\n` +
        `- Date : ${date || 'non précisée'}\n` +
        `- Type de publication : ${theme} · Format : ${format}\n` +
        (contentText
          ? `- Texte écrit par le commerçant (c'est LUI qui nomme les produits — appuie-toi dessus) : « ${contentText} »\n`
          : `- Le commerçant n'a rien écrit : ne nomme aucun produit dont tu ne sois pas certain.\n`) +
        `\n` + task + jsonInstruction }
    ];
  } else {
    userContent =
      `Ce que tu sais — et rien d'autre :\n` +
      `- Commerce : ${nom}${type ? ` (${type})` : ''}${ville ? `, ${ville}` : ''}\n` +
      `- Date : ${date || 'non précisée'}\n` +
      `- Type de publication : ${theme}\n` +
      `- Format : ${format}\n` +
      (contentText ? `- Texte écrit par le commerçant : « ${contentText} »\n` : `- Le commerçant n'a rien écrit.\n`) +
      `\n${task}` +
      jsonInstruction;
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: data.error?.message || 'Erreur Claude API' }) };
    }

    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const parsed = parseJson(text);

    let caption, hashtags;
    if (parsed && typeof parsed.caption === 'string') {
      caption = parsed.caption.trim();
      hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map(h => String(h).trim()).filter(Boolean).map(h => h.startsWith('#') ? h : '#' + h).slice(0, 5)
        : [];
    } else {
      // Fallback : pas de JSON exploitable → tout le texte en légende
      caption = text.trim();
      hashtags = [];
    }

    return { statusCode: 200, body: JSON.stringify({ caption, hashtags }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
