export function createSummaryEngine({ callGroq, safeJsonParse, aiCall }) {
function smartChunkForSummary(text, maxChars = 12000, overlap = 600) {
  const out = [];
  if (!text) return out;
  if (text.length <= maxChars) return [text];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + maxChars, text.length);
    if (end < text.length) {
      const slice = text.slice(pos, end);
      const candidates = [
        slice.lastIndexOf("\n# "),
        slice.lastIndexOf("\n## "),
        slice.lastIndexOf("\n### "),
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
      ].filter(i => i > maxChars * 0.55);
      const cut = candidates.length ? Math.max(...candidates) : -1;
      if (cut > 0) end = pos + cut;
    }
    const piece = text.slice(pos, end).trim();
    if (piece.length > 80) out.push(piece);
    if (end >= text.length) break;
    pos = Math.max(end - overlap, pos + 1);
  }
  return out;
}

// Limiteur de concurrence — évite de saturer les rate-limits providers.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      try { results[idx] = await fn(items[idx], idx, items.length); }
      catch { results[idx] = null; }
    }
  });
  await Promise.all(workers);
  return results;
}

// Extraction forensique d'un chunk → digest JSON structuré (zéro perte).
async function extractChunkDigest(chunk, idx, total) {
  const sys = `Tu es un EXTRACTEUR FORENSIQUE de niveau God-Tier. Mission : extraire TOUT ce qui a la moindre valeur informative dans le passage, sans RIEN inventer.

RÈGLES NON NÉGOCIABLES :
- Aucune invention, aucune connaissance extérieure : tu n'extrais que ce qui est dans le PASSAGE.
- Conserve les termes EXACTS : vocabulaire, noms propres, formules, chiffres, dates, citations.
- Sois EXHAUSTIF : si le passage contient 30 concepts, liste-les tous. Mieux vaut 50 items courts qu'en oublier 3.
- Réponds UNIQUEMENT en JSON valide, sans markdown autour, sans texte avant/après.

SCHÉMA JSON (champs obligatoires, tableau vide si rien) :
{
 "sectionTitle": "titre court synthétisant ce passage",
 "tldr": "1 à 3 phrases résumant l'essentiel du passage",
 "keyConcepts": ["concept 1 (avec qualificatifs précis)", "concept 2", "..."],
 "definitions": [{"term":"X","def":"définition telle qu'elle apparaît dans le passage"}],
 "formulas":    [{"name":"optionnel","expr":"formule ou équation telle quelle"}],
 "numbers":     ["chiffres importants AVEC contexte (ex: '42% des cas en 2023')"],
 "dates":       ["dates ou périodes clés AVEC contexte"],
 "entities":    ["personnes, organisations, lieux, produits, technos cités"],
 "procedures":  [{"name":"...","steps":["étape 1","étape 2","..."]}],
 "examples":    ["exemples ou cas concrets cités tels quels"],
 "quotes":      ["phrases verbatim importantes du passage"],
 "warnings":    ["pièges, exceptions, contre-indications, erreurs courantes"],
 "openQuestions": ["questions ouvertes / points à creuser soulevés par le texte"]
}`;
  const user = `PASSAGE ${idx + 1}/${total} :\n\n${chunk}`;
  const raw = await callGroq(sys, user, 4000, true);
  try { return safeJsonParse(raw); } catch { return null; }
}

// Fusion + déduplication des digests en un seul digest global.
function mergeDigests(digests) {
  const out = {
    sections: [],
    keyConcepts: [], definitions: [], formulas: [], numbers: [],
    dates: [], entities: [], procedures: [], examples: [],
    quotes: [], warnings: [], openQuestions: [],
  };
  const seen = Object.fromEntries(Object.keys(out).map(k => [k, new Set()]));
  const norm = s => (typeof s === "string" ? s : "").trim().toLowerCase();
  const pushUniq = (bucket, value, keyFn) => {
    const k = norm(keyFn(value));
    if (!k || seen[bucket].has(k)) return;
    seen[bucket].add(k);
    out[bucket].push(value);
  };
  digests.forEach((d, i) => {
    if (!d || typeof d !== "object") return;
    out.sections.push({
      title: d.sectionTitle || `Section ${i + 1}`,
      tldr: d.tldr || "",
      keyConcepts: Array.isArray(d.keyConcepts) ? d.keyConcepts : [],
    });
    (d.keyConcepts || []).forEach(v => pushUniq("keyConcepts", v, x => x));
    (d.definitions || []).forEach(v => pushUniq("definitions", v, x => x?.term || ""));
    (d.formulas || []).forEach(v => pushUniq("formulas", v, x => x?.expr || x?.name || ""));
    (d.numbers || []).forEach(v => pushUniq("numbers", v, x => x));
    (d.dates || []).forEach(v => pushUniq("dates", v, x => x));
    (d.entities || []).forEach(v => pushUniq("entities", v, x => x));
    (d.procedures || []).forEach(v => pushUniq("procedures", v, x => x?.name || JSON.stringify(x?.steps || [])));
    (d.examples || []).forEach(v => pushUniq("examples", v, x => x));
    (d.quotes || []).forEach(v => pushUniq("quotes", v, x => x));
    (d.warnings || []).forEach(v => pushUniq("warnings", v, x => x));
    (d.openQuestions || []).forEach(v => pushUniq("openQuestions", v, x => x));
  });
  return out;
}

// Synthèse finale Markdown selon le mode (DEEP / TLDR / ACTION / ELI5 / STUDY).
async function synthesizeFinalSummary(merged, mode, sourceText) {
  const digestJson = JSON.stringify(merged).slice(0, 28000);
  const sourceTaste = sourceText.slice(0, 6000);

  const briefs = {
    DEEP: `MODE EXHAUSTIF — produis le résumé LE PLUS COMPLET possible. Si le digest contient 40 définitions, le résumé doit toutes les mentionner. Le rendu peut (doit !) être très long.

Structure OBLIGATOIRE en markdown :
# 📌 Synthèse complète du document
## ⚡ TL;DR
3 à 5 phrases de synthèse globale.
## 🎯 Idées-forces
5 à 12 puces. Mets en **gras** les mots-clés EXACTS du document.
## 📚 Plan détaillé
Liste numérotée reprenant les titres exacts des sections du digest.
## 🧠 Résumé exhaustif structuré
Pour CHAQUE section du digest, un sous-titre \`### N. Titre\` puis 1 paragraphe dense + sous-listes couvrant TOUS ses keyConcepts/définitions/exemples. Aucune notion oubliée.
## 🔑 Glossaire
Tableau \`| Terme | Définition |\` listant TOUTES les définitions du digest.
## 📊 Données chiffrées
Toutes les entrées de "numbers" en puces avec contexte.
## 📐 Formules & équations
Bloc code ou table reprenant les formulas (omettre la rubrique seulement si tableau vide).
## 📅 Chronologie
Liste \`AAAA — événement\` triée chronologiquement.
## 💬 Citations notables
Bloc \`>\` pour chaque quote du digest, telle quelle.
## ⚠️ Pièges & exceptions
Toutes les warnings.
## ❓ FAQ générée
6 à 10 paires Q/R utiles à la révision (réponses tirées EXCLUSIVEMENT du document).
## ✅ Takeaways actionnables
6 à 12 puces : ce qu'il faut RETENIR ou FAIRE.
## 🗺️ Mind-map
Arborescence en listes imbriquées (thèmes → sous-thèmes → détails).`,
    TLDR: `MODE TL;DR — synthèse exécutive (300-450 mots) :
## ⚡ TL;DR
3 à 5 phrases.
## 🎯 Idées-forces
5-7 puces, **gras** sur les mots-clés exacts.
## ✅ À retenir
3-5 puces actionnables.`,
    ACTION: `MODE ACTIONS — orienté pratique :
## 🚀 Mission
1 phrase de contexte.
## ✅ Plan d'action
Liste numérotée de verbes à l'infinitif, regroupés par thème.
## ⚠️ Pièges à éviter
Toutes les warnings.
## 🧰 Boîte à outils
Outils, méthodes, formules, ressources nommés.
## 📊 Métriques à suivre
Chiffres-clés, KPIs, dates butoirs.`,
    ELI5: `MODE ELI5 — vulgarise comme à un enfant de 10 ans (analogies OK, faits hors digest INTERDITS) :
## 🤓 L'idée en 1 phrase
## 🌍 Imagine que…
Une analogie filée.
## 🧱 Les briques principales
Concepts clés réécrits simplement, en gardant le terme exact entre parenthèses.
## 🪄 Pourquoi c'est cool
2-3 phrases.
## 🧪 Petit récap
3-5 puces.`,
    STUDY: `MODE RÉVISION — orienté étudiant qui prépare un examen :
## 🎯 Objectifs d'apprentissage
5-8 puces "À la fin tu sauras…"
## 🧠 Concepts clés
Tableau \`| Concept | Définition courte | Pourquoi c'est important |\`.
## 🔁 Cartes mentales (Q/R)
8-15 paires Q/R prêtes à devenir des flashcards.
## 🧪 Exemples & cas
Tous les "examples" du digest, expliqués brièvement.
## ⚠️ Pièges classiques
Toutes les warnings.
## 🏁 Mini quiz auto-correctif
5 questions + réponses (cachées sous \`<details>\`).`,
  };

  const sys = `Tu es un rédacteur scientifique GOD-TIER, fidèle à la source.

RÈGLES NON NÉGOCIABLES :
1. Tu utilises EXCLUSIVEMENT les informations du DIGEST_JSON ci-dessous (et l'EXTRAIT_SOURCE pour le ton/le vocabulaire). Aucune invention, aucune connaissance extérieure.
2. Conserve termes, noms propres, chiffres, formules, dates EXACTEMENT comme dans le digest.
3. Markdown propre : hiérarchie de titres respectée, listes à puces, tableaux, blocs code quand pertinent.
4. Mets en **gras** les mots-clés exacts (l'app utilise un mode "Rayon-X" sur les **gras**).
5. Si une rubrique demandée est vide dans le digest, conserve la rubrique mais écris _(non couvert dans le document)_.
6. JAMAIS de "Voici le résumé :" ni de blabla d'intro/outro hors structure.

${briefs[mode] || briefs.DEEP}`;

  const user = `EXTRAIT_SOURCE (échantillon, pour préserver ton et vocabulaire) :
"""
${sourceTaste}
"""

DIGEST_JSON (structure exhaustive de référence — utilise TOUT) :
${digestJson}`;

  // DEEP / STUDY : on privilégie un modèle "pedagogy" (mistral-large) avec gros budget tokens.
  if (mode === "DEEP" || mode === "STUDY") {
    try {
      const { text } = await aiCall({
        task: "pedagogy",
        system: sys,
        user,
        maxTokens: 8192,
        temperature: 0.2,
      });
      if (text && text.trim().length > 200) return text.trim();
    } catch { /* fallback */ }
  }
  const raw = await callGroq(sys, user, mode === "DEEP" || mode === "STUDY" ? 8000 : 3500);
  return raw.trim();
}

// Audit de couverture : repère les éléments du digest qui n'apparaissent pas
// dans le résumé final (utile pour le mode DEEP / STUDY).
function buildCoverageReport(merged, summary) {
  const lower = (summary || "").toLowerCase();
  const missing = [];
  const probe = (term) => {
    if (!term) return null;
    const words = String(term).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4);
    return words.slice(0, 2).join(" ").toLowerCase() || null;
  };
  const check = (kind, items, pick) => {
    (items || []).forEach(it => {
      const term = pick(it);
      const p = probe(term);
      if (p && !lower.includes(p)) missing.push({ kind, item: term, raw: it });
    });
  };
  check("définition", merged.definitions, x => x?.term);
  check("formule", merged.formulas, x => x?.expr || x?.name);
  check("chiffre", merged.numbers, x => x);
  check("date", merged.dates, x => x);
  check("entité", merged.entities, x => x);
  check("procédure", merged.procedures, x => x?.name);
  check("citation", merged.quotes, x => x);
  return missing.slice(0, 50);
}

async function appendCoverageRescue(summary, missing) {
  if (!missing.length) return summary;
  const sys = `Tu es un complétiste forensique. On te donne un résumé Markdown et une liste d'éléments du digest source ABSENTS de ce résumé.

Mission : produire UNIQUEMENT une section additionnelle "## 🛟 Compléments — à ne pas oublier" qui :
- liste TOUS les éléments manquants ci-dessous,
- regroupés par type (Définitions / Formules / Chiffres / Dates / Entités / Procédures / Citations),
- en utilisant les termes EXACTS, sans inventer,
- formatage : tableau pour Définitions, blocs code pour Formules, listes à puces pour le reste.

Réponds en markdown brut, en commençant directement par "## 🛟 Compléments — à ne pas oublier".`;
  const user = `RÉSUMÉ ACTUEL (extrait de fin) :
"""
${summary.slice(-10000)}
"""

ÉLÉMENTS MANQUANTS (JSON) :
${JSON.stringify(missing).slice(0, 12000)}`;

  try {
    const raw = await callGroq(sys, user, 3500);
    if (raw && raw.trim()) return summary + "\n\n" + raw.trim();
  } catch { /* fallback déterministe ci-dessous */ }

  const groups = missing.reduce((acc, m) => { (acc[m.kind] ||= []).push(m); return acc; }, {});
  const md = ["## 🛟 Compléments — à ne pas oublier"];
  for (const [kind, list] of Object.entries(groups)) {
    md.push(`\n### ${kind.charAt(0).toUpperCase() + kind.slice(1)}s`);
    list.forEach(m => {
      const r = m.raw;
      if (typeof r === "string") md.push(`- ${r}`);
      else if (r?.term && r?.def) md.push(`- **${r.term}** — ${r.def}`);
      else if (r?.expr) md.push("- `" + r.expr + "`");
      else if (r?.name && Array.isArray(r?.steps)) md.push(`- **${r.name}** : ${r.steps.join(" → ")}`);
      else md.push(`- ${JSON.stringify(r)}`);
    });
  }
  return summary + "\n\n" + md.join("\n");
}






return { smartChunkForSummary, mapWithConcurrency, extractChunkDigest, mergeDigests, synthesizeFinalSummary, buildCoverageReport, appendCoverageRescue };
}
