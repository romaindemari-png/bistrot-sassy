/* ════════════════════════════════════════════════════════════════════════
   SASSY_TOKENS — design tokens génériques du studio LeLab+ (bistrot-sassy).
   Source de vérité unique pour le renderer des templates (typo-carte / infos).
   Structure identique à MASAMADRE_TOKENS (portage), valeurs neutres Sassy.
   Romain ajuste ces valeurs par client ; les templates ne lisent QUE le sémantique.
   ════════════════════════════════════════════════════════════════════════ */
const SASSY_TOKENS = {
  // Niveau 1 — PRIMITIVES (valeurs brutes)
  primitives: {
    color: {
      creme:'#FAF1E2', blanc:'#FFFFFF', encre:'#211f1e', accent:'#2050E7',
      texte:'#3a3a3a', texteDoux:'#6b6b6b'
    },
    font: {
      titre: "'Bricolage Grotesque', sans-serif",
      body:  "Inter, sans-serif"
    }
  },
  // Niveau 2 — SÉMANTIQUE (rôles → réfèrent les primitives par CLÉ). Les templates ne lisent QUE ça.
  semantic: {
    // titre cuit dans le PNG → le studio ne pose QUE la liste produits/prix
    nomProduit: { font:'body',  color:'texte', sizeRatio:0.036, sizeMin:0.028, weight:600, baselineOffset:0.4, letterSpacing:0, uppercase:false },
    prix:       { font:'titre', color:'encre', weight:700, sizeScale:0.70, align:'right', letterSpacing:0 },
    separateur: { color:'encre', alpha:0.15, thicknessRatio:0.0019 },   // × W (≈2px@1080)
    infos:      { font:'body', color:'encre', sizeRatio:0.050, sizeMin:0.032, lineHeight:1.35, maxLines:4, weight:500, letterSpacing:0 },
    blockVAlign: 0.50, rowHeight: 1.8, fond: '#FAF1E2'
  },
  // Constantes de rendu (non-charte)
  render: {
    canvasW: 1080, jpegQuality: 0.92,
    zoneDefault: { x:.08, y:.25, w:.84, h:.55 },
    fit: { startRatio:0.085, startMin:8, startMax:20, floor:5, step:0.5 }
  }
};
if (typeof window !== 'undefined') window.SASSY_TOKENS = SASSY_TOKENS;
