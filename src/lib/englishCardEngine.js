import { stripJsonWrapper } from "./cardOptimizer.js";
// src/lib/englishCardEngine.js — Moteur Universel d'Élite pour Fiches d'Anglais (Format WhatsApp / BBC / SLA)
// Remplace définitivement le faux templating abstrait par une pédagogie active (Vrai sens + Règle réflexe + Mini-dialogue A/B + Piège).

import { safeParseJSON } from "./jsonRepair.js";
import { isNovaMistakeCard } from "./memoryLab.js";

/**
 * Règle de structure pour les fiches d'anglais générées par l'IA
 */
export const ENGLISH_CARD_STRUCTURE_INSTRUCTION = `
⚠️ STRUCTURE D'ÉLITE POUR TOUTE FICHE D'ANGLAIS (Format Direct & Vivant) :
Le champ "front" DOIT être une expression ou phrase anglaise 100% CORRECTE et naturelle.
Le champ "back" DOIT suivre STRICTEMENT cette structure claire (sans jargon abstrait) :

📖 **Vrai sens :** [Traduction française naturelle et idiomatique. INTERDICTION ABSOLUE de recopier l'anglais.]

🧩 **La Règle Réflexe / Structure :** [1 à 2 phrases simples expliquant le fonctionnement en anglais ou l'image littérale si c'est un idiome. Zéro jargon type 'glissement sémantique' ou 'modèle mental'.]

💬 **Mini-dialogue :**
* **A :** \`[Phrase A naturelle en anglais]\`  
  ↳ *[Traduction française de la réplique A]*
* **B :** \`[Phrase B naturelle en anglais]\`  
  ↳ *[Traduction française de la réplique B]*

⚠️ **Attention au piège & Exception :**
* 🚫 **Le piège :** [Calque mot-à-mot du français ou confusion typique à éviter]
* ⚡ **L'exception / Nuance native :** [VÉRACITÉ STRICTE OXFORD/CAMBRIDGE. INTERDICTION d'inventer de fausses règles du type "aucun article n'est utilisé avec more". Donne le cas réel où la règle change (ex: « The more..., the more... » ou comparatif de 2 éléments « health is the more important of the two »). Si aucune exception grammaticale n'existe, donne la formule orale idiomatique alternative préférée des natifs (ex: « What matters most »).]
`;

/**
 * Détecte si une carte appartient à la catégorie Anglais
 */
export function isEnglishCategory(category = "") {
  const cat = String(category || "").toLowerCase();
  return cat.includes("anglais") || cat.includes("english") || category.includes("🇬🇧");
}

/**
 * Détecte si une fiche d'anglais comporte des incohérences ou du texte robotique pré-rempli
 */
/**
 * Détecte si une fiche ou un texte est issu d'une hésitation orale humaine, répétition ou bégaiement (ex: "can can", "I can I can")
 */
export function isHesitationCard(card) {
  if (!card) return false;
  const str = `${card.front || ""} ${card.back || ""} ${card.userMistake || ""}`;
  return (
    /bégaiement|hésitation orale|répétition inutile|tendance à doubler|doubler inutilement|Cette formulation répète/i.test(str)
  ) || (
    /doubler\s*(?:souvent\s*)?(?:les\s*)?auxiliaires/i.test(str)
  ) || (
    /modal\s*[«"']?\s*can\s*[»"']?/i.test(str) && /répèt|doubl/i.test(str)
  ) || (
    /\b(\w+(?:\s+\w+)?)\s+\1\b/i.test(card.userMistake || "")
  );
}

/**
 * Détecte si une fiche d'anglais comporte des incohérences ou du texte robotique pré-rempli
 */
export function isDefectiveEnglishCard(card) {
  if (!card) return false;
  const front = String(card.front || "").trim();
  const back = String(card.back || "").trim();

  // 1. Détection de phrases d'anglais cassé connues ou tronquées
  if (/^i want you believe that$/i.test(front)) return true;
  if (front.includes("I got the, I have the")) return true;

  // 2. Détection du faux templating mécanique ("fastCardModernizer")
  if (back.includes("widely used in modern workflows")) return true;
  if (back.includes("In daily practice:")) return true;
  if (back.includes("Glissement sémantique : structure essentielle")) return true;
  if (back.includes("Transition Métaphorique") && back.includes("Sens physique / conceptuel")) return true;

  // 3. Traduction vide ou recopie bête du front en anglais
  const tradMatch = back.match(/Traduction\s*:\s*([^\n]+)/i);
  if (tradMatch && tradMatch[1]) {
    const tradVal = tradMatch[1].trim().toLowerCase();
    if (tradVal === front.toLowerCase()) return true;
  }

  // 4. Exemple incohérent (ex: "The book that is on the table is mine" pour la fiche "who")
  if (front.toLowerCase() === "who" && back.includes("The book")) return true;

  // 5. Fausse règle sur un bégaiement ou hésitation orale humaine (ex: "doubler can", "répétition inutile")
  if (isHesitationCard(card)) return true;

  // 6. Dialogue avec traduction sur la même ligne (ex: "• A : ... ↳ ...")
  if (/^[•*-\s]*\*{0,2}[AB]\*{0,2}\s*:[^\n↳]+[ \t]*(?:↳|->)/m.test(back)) return true;

  // 7. Dialogue ou contenu pollué par des blocs d'astérisques vides ou lignes orphelines d'astérisques
  if (/^[ \t]*(?:[•·\-\–]|\*(?!\*))?\s*(?:\*{2}[AB]\s*:\s*\*{2}|[AB]\s*:)\s*(?:`\*{1,2}`|\*{2,})/m.test(back)) return true;
  if (/^\s*\*{2,}\s*$/m.test(back)) return true;

  // 8. Fausse règle grammaticale ou exception mensongère (ex: "Aucun article n'est utilisé avec more")
  if (/aucun article n['’]est utilisé avec more|on ne met jamais (?:d['’]article|the) avec more|jamais d['’]article avec more/i.test(back)) return true;

  return false;
}

/**
 * Construit le prompt système pour restructurer chirurgicalement une fiche d'anglais avec l'IA
 */
export function buildEnglishRestructureSystemPrompt() {
  return `Tu es un Coach d'anglais d'élite et expert en répétition espacée (FSRS).
Tu transformes UNE fiche d'anglais en fiche de révision évaluable en 5 à 8 secondes, sans scroll, en RAPPEL ACTIF.

Il existe DEUX types de fiches. Tu choisis selon la demande :
- "standard" : vocabulaire, idiome, tournure, grammaire. L'élève n'a commis AUCUNE faute.
  INTERDICTION FORMELLE d'écrire "Vous avez dit" ou d'inventer une faute de l'élève.
- "nova_mistake" : UNIQUEMENT si la demande signale explicitement une "Fiche d'erreur de l'élève".
  On cite la faute exacte (effet miroir : Vous avez dit : « ... »), puis on répare le réflexe français.

RÈGLES D'OR :
1. RECTO = un défi actif clair. Standard : une phrase FRANÇAISE naturelle à exprimer en anglais + un indice court. Nova : la faute exacte, l'élève doit la réparer.
2. CONCISION : chaque règle tient en 1 phrase courte. Maximum 2 puces de réflexe. Zéro jargon ("glissement sémantique", "modèle mental"…).
3. EXACTITUDE (Oxford / Cambridge) : n'invente JAMAIS de fausse règle ni d'absolutisme ("aucun article n'est utilisé avec more" est FAUX). Nomme correctement les choses (adjectif/attribut ≠ sujet).
4. DIALOGUE : exactement 2 répliques A/B, naturelles, chacune avec SA traduction française. Les répliques ne recopient pas mot pour mot la phrase du recto ; elles la mettent en situation.
5. HÉSITATIONS ORALES : une répétition de mot ("I can I can", "the the") n'est PAS une faute de langue. Ne parle jamais de répétition ni de bégaiement : fais une fiche "standard" sur l'expression.
6. Texte brut uniquement dans les valeurs : pas de Markdown, pas d'astérisques, pas de backticks.

Réponds STRICTEMENT en JSON pur (aucun markdown autour), selon l'un des deux schémas :

SCHÉMA "standard" :
{
  "card_type": "standard",
  "recto_prompt_fr": "phrase française à dire en anglais",
  "recto_hint": "indice très court (ex: proud + ?)",
  "expression_en": "la phrase anglaise correcte",
  "reflex": ["règle réflexe 1 (1 phrase)", "règle réflexe 2 optionnelle"],
  "trap": { "wrong_en": "calque fautif typique d'un francophone", "right_en": "forme correcte", "why_fr": "pourquoi le français piège (1 phrase)" },
  "nuance_fr": "vraie exception ou alternative native (optionnel, 1 phrase, chaîne vide sinon)",
  "dialogue": [ { "speaker": "A", "en": "...", "fr": "..." }, { "speaker": "B", "en": "...", "fr": "..." } ]
}

SCHÉMA "nova_mistake" :
{
  "card_type": "nova_mistake",
  "what_you_said": "faute EXACTE dite par l'élève",
  "native_fix": "la forme native correcte",
  "native_alt": "variante correcte (optionnel, chaîne vide sinon)",
  "why_fr": "pourquoi le cerveau francophone produit cette faute (1 phrase)",
  "contrast": [ { "fr": "élément français", "en": "équivalent anglais + explication très courte" } ],
  "punchline": "la formule choc à retenir (1 ligne)",
  "dialogue": [ { "speaker": "A", "en": "...", "fr": "..." }, { "speaker": "B", "en": "...", "fr": "..." } ]
}

EXEMPLE PARFAIT "standard" (fiche "Which projects are you most proud of?") :
{"card_type":"standard","recto_prompt_fr":"Quels sont les projets dont tu es le plus fier ?","recto_hint":"proud + ?","expression_en":"Which projects are you most proud of?","reflex":["On dit toujours proud of (jamais proud about ni proud from).","En anglais parlé, la préposition se place à la fin : the projects you're proud of."],"trap":{"wrong_en":"Which projects are you the most proud?","right_en":"Which projects are you most proud of?","why_fr":"Le « dont » français cache la préposition : on l'oublie en anglais."},"nuance_fr":"À l'écrit très formel : Of which projects are you most proud?","dialogue":[{"speaker":"A","en":"Which projects are you most proud of at work?","fr":"De quels projets es-tu le plus fier au travail ?"},{"speaker":"B","en":"Definitely the AI assistant we launched last quarter.","fr":"Sans hésiter, l'assistant IA qu'on a lancé le trimestre dernier."}]}

EXEMPLE PARFAIT "nova_mistake" (faute : "I live here since two years") :
{"card_type":"nova_mistake","what_you_said":"I live here since two years","native_fix":"I've been living here for two years.","native_alt":"I've lived here for two years.","why_fr":"En français, « je vis ici depuis » se dit au présent ; l'anglais exige le present perfect pour une action qui dure encore.","contrast":[{"fr":"Je vis (présent)","en":"I've been living / I've lived (commencé avant, continue)"},{"fr":"depuis + durée (2 ans)","en":"FOR (since = point de départ : since 2024)"}],"punchline":"Durée écoulée = FOR. Point de départ = SINCE.","dialogue":[{"speaker":"A","en":"How long have you been in the city?","fr":"Depuis combien de temps es-tu en ville ?"},{"speaker":"B","en":"I've been living here for two years now!","fr":"J'habite ici depuis deux ans maintenant !"}]}`;
}

function cleanPlain(v) {
  return String(v == null ? "" : v)
    .replace(/[`*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDialogue(dialogue) {
  if (!Array.isArray(dialogue)) return [];
  return dialogue
    .map((t, i) => ({
      speaker: /^b$/i.test(cleanPlain(t?.speaker)) ? "B" : (/^a$/i.test(cleanPlain(t?.speaker)) ? "A" : (i % 2 ? "B" : "A")),
      en: cleanPlain(t?.en),
      fr: cleanPlain(t?.fr).replace(/^↳\s*/, ""),
    }))
    .filter((t) => t.en)
    .slice(0, 2);
}

function renderDialogue(title, turns) {
  if (!turns.length) return "";
  const lines = turns.map((t) => `* **${t.speaker} :** \`${t.en}\`` + (t.fr ? `  \n  ↳ *${t.fr}*` : ""));
  return `${title}\n${lines.join("\n")}`;
}

/** Vrai si l'IA a renvoyé le nouveau format structuré (card_type / champs dédiés). */
export function isStructuredEnglishPayload(parsed) {
  return Boolean(
    parsed && typeof parsed === "object" &&
    (parsed.card_type || parsed.expression_en || parsed.native_fix || parsed.recto_prompt_fr)
  );
}

/**
 * Convertit la réponse JSON structurée en fiche { front, back, example } compacte.
 * isMistake vient TOUJOURS de la fiche source : l'IA ne peut pas transformer une
 * fiche standard en Erreur Nova (ni l'inverse).
 */
export function renderStructuredEnglishCard(parsed, fallbackCard = {}, isMistake = false) {
  if (!isStructuredEnglishPayload(parsed)) return null;
  const turns = normalizeDialogue(parsed.dialogue);

  if (isMistake) {
    const said = cleanPlain(parsed.what_you_said || fallbackCard.userMistake);
    const fix = cleanPlain(parsed.native_fix || parsed.expression_en);
    if (!fix) return null;
    const alt = cleanPlain(parsed.native_alt);
    const why = cleanPlain(parsed.why_fr);
    const punch = cleanPlain(parsed.punchline);
    const contrast = (Array.isArray(parsed.contrast) ? parsed.contrast : [])
      .map((r) => ({ fr: cleanPlain(r?.fr).replace(/\|/g, "/"), en: cleanPlain(r?.en).replace(/\|/g, "/").replace(/^➔\s*/, "") }))
      .filter((r) => r.fr && r.en)
      .slice(0, 3);

    const front = said
      ? `🎙️ Erreur de ton appel avec Nova\n❌ « ${said} »\n🎯 Comment le dire correctement ?`
      : `🎙️ Erreur de ton appel avec Nova\n🎯 Comment dire correctement : « ${fix} » ?`;

    const parts = [];
    parts.push(`✅ **Le réflexe natif :** \`${fix}\`` + (alt ? `  \n↳ *ou :* \`${alt}\`` : ""));
    parts.push(`🧩 **La Règle Réflexe :** ${said ? `Vous avez dit : « ${said} ». ` : ""}${why}`.trim());
    if (contrast.length) {
      parts.push(`⚡ **Le déclic :**\n\n| En français | En anglais |\n|---|---|\n${contrast.map((r) => `| ${r.fr} | ➔ ${r.en} |`).join("\n")}`);
    }
    if (punch) parts.push(`🧠 **La formule :** ${punch}`);
    const dlg = renderDialogue("💬 **Comme dans ta conversation :**", turns);
    if (dlg) parts.push(dlg);
    return { front, back: parts.join("\n\n"), example: fix };
  }

  const expr = cleanPlain(parsed.expression_en || parsed.native_fix || fallbackCard.front);
  if (!expr) return null;
  const prompt = cleanPlain(parsed.recto_prompt_fr);
  const hint = cleanPlain(parsed.recto_hint);
  const reflex = (Array.isArray(parsed.reflex) ? parsed.reflex : [parsed.reflex])
    .map(cleanPlain).filter(Boolean).slice(0, 2);
  const trap = parsed.trap && typeof parsed.trap === "object" ? parsed.trap : {};
  const wrong = cleanPlain(trap.wrong_en);
  const right = cleanPlain(trap.right_en) || expr;
  const trapWhy = cleanPlain(trap.why_fr);
  const nuance = cleanPlain(parsed.nuance_fr);

  const front = prompt
    ? `🎯 Comment dire en anglais :\n« ${prompt} »` + (hint ? `\n💡 Indice : ${hint}` : "")
    : expr;

  const parts = [`🔊 \`${expr}\``];
  if (reflex.length) parts.push(`⚡ **Le Réflexe :**\n${reflex.map((r) => `- ${r}`).join("\n")}`);
  if (wrong && wrong.toLowerCase() !== right.toLowerCase()) {
    parts.push(`⚠️ **Le piège :**\n- ❌ \`${wrong}\`\n- ✅ \`${right}\`` + (trapWhy ? `\n\n${trapWhy}` : ""));
  } else if (trapWhy) {
    parts.push(`⚠️ **Le piège :** ${trapWhy}`);
  }
  if (nuance) parts.push(`🎓 **Nuance native :** ${nuance}`);
  const dlg = renderDialogue("💬 **Mini-dialogue :**", turns);
  if (dlg) parts.push(dlg);
  return { front, back: parts.join("\n\n"), example: expr };
}

/**
 * Construit le payload utilisateur pour une carte spécifique
 */
export function buildEnglishRestructureUserPayload(card) {
  const isHesitation = isHesitationCard(card);
  const isMistake = !isHesitation && isNovaMistakeCard(card);
  let mistakeHint = "";

  if (isHesitation) {
    mistakeHint = `\n🚨 ATTENTION PARTICULIÈRE (HÉSITATION ORALE DÉTECTÉE) :
Cette fiche provenait d'une hésitation orale / répétition mécanique de mot (ex: répéter "can" en cherchant ses mots).
CE N'EST ABSOLUMENT PAS UNE ERREUR DE LANGUE ANGLAISE.
INTERDICTION FORMELLE :
1. N'écris JAMAIS "Vous avez dit" dans la règle réflexe.
2. Ne parle JAMAIS de répétition, de bégaiement, de doubler un mot ou d'auxiliaire modal.
3. Transforme cette fiche en une SUPERBE fiche d'expression/idiome natif (ex: front: "Open doors" ou "Have doors open").
4. La Règle Réflexe doit UNIQUEMENT expliquer l'image mentale ou l'utilisation idiomatique de l'expression en anglais natif (ex: « open doors » pour de nouvelles opportunités), SANS AUCUNE MENTION d'une répétition ou d'une erreur.`;
  } else if (card?.userMistake) {
    mistakeHint = `\n⚠️ Fiche d'erreur de l'élève. Faute exacte commise : "${card.userMistake}". (La règle réflexe DOIT débuter par : Vous avez dit : « ${card.userMistake} ».)`;
  } else if (isMistake) {
    let mistakeFound = "";
    if (typeof card?.back === "string") {
      const match = card.back.match(/(?:Tu as dit|Tu avais dit|Vous avez dit|Vous aviez dit|Phrase fautive)[^:\n]*:\s*(?:\*\*)?\s*[«"']?([^»"'\n]+)/i);
      if (match && match[1]) {
        mistakeFound = match[1].replace(/^[«"'\s*]+|[»"'\s*❌✅]+$/g, "").trim();
      }
    }
    if (!mistakeFound && typeof card?.front === "string" && card.front.includes("❌")) {
      const match = card.front.match(/❌\s*[«"']?([^»"'→\n]+)/i);
      if (match && match[1]) {
        mistakeFound = match[1].replace(/^[«"'\s*]+|[»"'\s*]+$/g, "").trim();
      }
    }
    if (mistakeFound) {
      mistakeHint = `\n⚠️ Fiche d'erreur de l'élève. Faute exacte commise : "${mistakeFound}". (La règle réflexe DOIT débuter par : Vous avez dit : « ${mistakeFound} ».)`;
    } else {
      mistakeHint = `\n⚠️ Fiche d'erreur de l'élève. (La règle réflexe DOIT débuter par : Vous avez dit : « <expression erronée de l'élève> ».)`;
    }
  } else {
    mistakeHint = `\n✨ FICHE D'APPRENTISSAGE STANDARD (PAS UNE ERREUR) :
Cette fiche est une fiche d'apprentissage de vocabulaire, d'idiome ou de tournure anglaise. L'élève n'a commis AUCUNE faute.
INTERDICTION FORMELLE :
1. N'écris JAMAIS "Vous avez dit" dans la règle réflexe.
2. N'invente JAMAIS de fausse faute commise par l'élève.
3. La Règle Réflexe doit expliquer directement le mécanisme natif et l'image mentale de l'expression en anglais naturel.`;
  }

  // Si c'est une fausse fiche d'hésitation ou fiche standard, purger l'ancien back pour ne pas contaminer l'IA
  let cleanBack = String(card?.back || "");
  if (isHesitation) {
    cleanBack = cleanBack
      .replace(/Vous ave[zs] dit\s*:[^\n.]+[.\n]?/gi, "")
      .replace(/Cette formulation répète[^\n.]+[.\n]?/gi, "")
      .replace(/Le cerveau francophone[^\n.]+[.\n]?/gi, "")
      .replace(/Le réflexe natif[^\n.]+[.\n]?/gi, "")
      .replace(/Évitez[^.\n]*[.\n]?/gi, "")
      .trim();
  } else if (!isMistake) {
    cleanBack = cleanBack
      .replace(/Vous ave[zs] dit\s*:[^\n.]+[.\n]?/gi, "")
      .replace(/Tu avais? dit\s*:[^\n.]+[.\n]?/gi, "")
      .trim();
  }

  // Garde-fou Niveau 1 (Pré-Prompt) : Assainir l'ancien contenu avant envoi au LLM pour couper court à tout ancrage d'hallucination
  cleanBack = sanitizeEnglishPedagogy(cleanBack, card?.front);

  return `MÉTAMORPHOSE CETTE FICHE :
Front actuel: "${card?.front || ""}"
Back actuel:
"""
${cleanBack}
"""
Exemple actuel: "${card?.example || ""}"${mistakeHint}`;
}

/**
 * Nettoie les répétitions de mots orales et bégaiements (ex: "can can" -> "can", "I can I can" -> "I can")
 */
export function deduplicateRepeatedWords(text) {
  if (!text || typeof text !== "string") return text;
  let prev = "";
  let curr = text;
  let count = 0;
  while (prev !== curr && count < 5) {
    prev = curr;
    curr = curr.replace(/\b(\w+(?:\s+\w+)?)\s+\1\b/gi, "$1");
    count++;
  }
  return curr;
}

/**
 * Parse et valide la réponse JSON de restructuration d'une fiche
 */
export function parseEnglishRestructureResponse(raw, fallbackCard = {}) {
  if (!raw) return null;
  let parsed = null;

  if (typeof raw === "object" && raw !== null && (raw.front || raw.back || isStructuredEnglishPayload(raw))) {
    parsed = raw;
  } else {
    const text = typeof raw === "string" ? raw : String(raw.text || raw.content || "");
    const cleaned = stripJsonWrapper(text);
    try {
      parsed = safeParseJSON(cleaned);
    } catch (_) {
      parsed = null;
    }
  }

  if (parsed && !parsed.back && isStructuredEnglishPayload(parsed)) {
    const hes = isHesitationCard(fallbackCard);
    const rendered = renderStructuredEnglishCard(parsed, fallbackCard, !hes && isNovaMistakeCard(fallbackCard));
    if (!rendered) return null;
    parsed = rendered;
  }

  if (!parsed || !parsed.back) return null;

  const newFront = String(parsed.front || fallbackCard.front || "").trim();
  let newBack = String(parsed.back || "").trim();
  const newExample = String(parsed.example || fallbackCard.example || "").trim();

  // Sécurité anti-retour vide
  if (newBack.length < 20) return null;

  // Harmonisation : Remplacement de "Tu as dit" par "Vous avez dit"
  newBack = newBack.replace(/\bTu as dit\s*:/gi, "Vous avez dit :");
  newBack = newBack.replace(/\bTu avais dit\s*:/gi, "Vous aviez dit :");

  // Nettoyage impitoyable de résidus de fausses règles de répétition / bégaiement
  newBack = newBack
    .replace(/Cette formulation répète[^\n.]+[.\n]?/gi, "")
    .replace(/Le cerveau francophone (?:a tendance à doubler|double souvent)[^\n.]+[.\n]?/gi, "")
    .replace(/Le réflexe natif\s*:\s*ne gardez qu'un seul[^\n.]+[.\n]?/gi, "")
    .replace(/Évitez de doubler[^\n.]+[.\n]?/gi, "")
    .replace(/dites la phrase la plus concise[^\n.]+[.\n]?/gi, "")
    .replace(/[^\n.]*modal «\s*can\s*»[^\n.]*[.\n]?/gi, "")
    .replace(/[^\n.]*ne gardez qu'un seul[^\n.]*[.\n]?/gi, "");

  const isHesitation = isHesitationCard(fallbackCard) || isHesitationCard({ back: newBack, front: newFront });
  const isMistake = !isHesitation && isNovaMistakeCard(fallbackCard);

  if (isHesitation || !isMistake) {
    // Si c'est une fiche d'hésitation OU une fiche d'apprentissage standard (non erreur),
    // purger tout "Vous avez dit" / "Tu as dit" accidentellement renvoyé par l'IA
    newBack = newBack
      .replace(/Vous avez dit\s*:\s*[«"'][^»"'\n]+[»"']\.?\s*/gi, "")
      .replace(/Vous aviez dit\s*:\s*[«"'][^»"'\n]+[»"']\.?\s*/gi, "")
      .replace(/Tu as dit\s*:\s*[«"'][^»"'\n]+[»"']\.?\s*/gi, "")
      .replace(/Tu avais dit\s*:\s*[«"'][^»"'\n]+[»"']\.?\s*/gi, "");
  }

  // Si après nettoyage, La Règle Réflexe est vide ou trop courte (< 20 caractères) :
  const reflexRegex = /(🧩\s*\*\*La Règle Réflexe\s*:\*\*\s*)(.*?)(\n\s*💬|\n\s*⚠️|$)/s;
  const reflexMatch = newBack.match(reflexRegex);
  if (reflexMatch) {
    const reflexContent = reflexMatch[2].trim();
    if (reflexContent.length < 20 || (isHesitation && /can|modal|répèt/i.test(reflexContent))) {
      const cleanFront = newFront.replace(/^(?:to\s+|i\s+can\s+)/i, "").trim();
      const naturalReflex = isHesitation
        ? `« ${cleanFront || newFront} » est l'expression naturelle pour désigner des opportunités professionnelles ou personnelles qui s'ouvrent à vous.`
        : `« ${cleanFront || newFront} » est la tournure authentique et spontanée employée par les natifs anglophones pour exprimer cette notion.`;
      newBack = newBack.replace(reflexRegex, `$1${naturalReflex}\n\n$3`);
    }
  }

  // Si c'est une VRAIE fiche d'erreur (non-hésitation) et que La Règle Réflexe n'a pas encore "Vous avez dit" :
  if (isMistake && /🧩\s*\*\*La Règle Réflexe\s*:\*\*/i.test(newBack) && !newBack.includes("Vous avez dit") && !newBack.includes("Vous aviez dit")) {
    let mistakeFound = fallbackCard.userMistake;
    if (!mistakeFound && typeof fallbackCard.back === "string") {
      const match = fallbackCard.back.match(/(?:Tu as dit|Tu avais dit|Vous avez dit|Vous aviez dit|Phrase fautive)[^:\n]*:\s*(?:\*\*)?\s*[«"']?([^»"'\n]+)/i);
      if (match && match[1]) {
        mistakeFound = match[1].replace(/^[«"'\s*]+|[»"'\s*❌✅]+$/g, "").trim();
      }
    }
    if (!mistakeFound && typeof fallbackCard.front === "string" && fallbackCard.front.includes("❌")) {
      const match = fallbackCard.front.match(/❌\s*[«"']?([^»"'→\n]+)/i);
      if (match && match[1]) {
        mistakeFound = match[1].replace(/^[«"'\s*]+|[»"'\s*]+$/g, "").trim();
      }
    }
    if (mistakeFound) {
      // Nettoyer les répétitions mécaniques consécutives (1 ou 2 mots répétés)
      mistakeFound = deduplicateRepeatedWords(mistakeFound).replace(/^[«"'\s*]+|[»"'\s*❌✅]+$/g, "").trim();
      newBack = newBack.replace(
        /(🧩\s*\*\*La Règle Réflexe\s*:\*\*\s*)/i,
        `$1Vous avez dit : « ${mistakeFound} ». `
      );
    }
  }

  // Coquilles Markdown : « **Le piège :* » → « **Le piège :** », étoiles orphelines
  newBack = newBack.replace(/(\*\*[^*\n]+?:)\*(?!\*)/g, "$1**");

  // Assainissement pédagogique strict : éradication des fausses règles ou exceptions mensongères
  newBack = sanitizeEnglishPedagogy(newBack, newFront);

  // Reformatage systématique des dialogues pour garantir la traduction sur sa propre ligne indentée
  newBack = reformatDialogueWithPerTurnTranslation(newBack);

  return {
    front: newFront,
    back: newBack,
    example: newExample,
  };
}

/**
 * Assainit le contenu pédagogique d'une fiche pour éradiquer les fausses règles ou hallucinations grammaticales.
 */
export function sanitizeEnglishPedagogy(back, front = "") {
  if (!back || typeof back !== "string") return back;
  let text = back;

  // 1. Décoller ⚠️ Attention au piège s'il a été fusionné sur la même ligne qu'une réplique ou traduction
  text = text.replace(/([^\n])\s*(⚠️\s*\*{0,2}(?:Attention au piège|Piège))/g, "$1\n\n$2");

  // 2. Décoller 🚫 Le piège s'il a été fusionné sur la même ligne que le titre
  text = text.replace(/([^\n])\s*(?:[•·\-\*]\s*)?(🚫\s*\*{0,2}Le piège)/g, "$1\n- $2");

  // 3. Décoller ⚡ L'exception s'il a été fusionné
  text = text.replace(/([^\n])\s*(?:[•·\-\*]\s*)?(⚡\s*\*{0,2}L['’]exception)/g, "$1\n- $2");

  // 4. Correction immédiate des faux absolutismes sur "more" et les comparatifs
  // Ex: "Aucun article n'est utilisé avec more...", "On n'utilise jamais d'article avec more...", "Pas d'exception ; la forme reste toujours sans article."
  const falseMoreRegex = /([•·\-\*]\s*)?(⚡\s*\*{0,2}L['’]exception[^\n:]*:\*{0,2}\s*)(?:[^\n]*(?:aucun article[^\n]*more|jamais d['’]article[^\n]*more|ne met jamais the|pas d['’]exception|sans article|toujours sans article)[^\n]*(?:\n(?!\s*(?:[•·\-\*]|#|⚠️|\n))[^\n]*)*)/gi;
  if (falseMoreRegex.test(text)) {
    const trueException = `$1$2On utilise bien « the » devant « more » dans deux cas réels : 1) La corrélation proportionnelle : *« The more you learn, the more you grow »* (Plus tu apprends, plus tu grandis). 2) Le choix restrictif entre deux éléments : *« Health is the more important of the two »* (Entre la santé et l'argent, c'est la santé le plus important des deux).`;
    text = text.replace(falseMoreRegex, trueException);
  }

  // Nettoyage de résidus de phrases d'absolutisme orphelines comme "(Pas d'exception ; la forme reste toujours sans article.)"
  text = text.replace(/\s*\([Pp]as d['’]exception\s*;?\s*[^)]*\)/g, "");

  // 5. Remplacement des puces d'exception qui prétendent qu'il n'y a pas d'exception
  const noExceptionRegex = /([•·\-\*]\s*)?(⚡\s*\*{0,2}L['’]exception\s*\/[^\n:]*:\*{0,2}\s*)(?:Il n['’]y a pas d['’]exception|Aucune exception particulière|Aucune exception n['’]est possible)[^\n.]*\.?/i;
  if (noExceptionRegex.test(text) && /important|interesting|difficult|more/i.test(`${front} ${text}`)) {
    text = text.replace(noExceptionRegex, `$1$2Le comparatif proportionnel emploie bien « the » : *« The more important the project, the more focus it requires »*.`);
  }

  return text;
}

/**
 * Découpe une traduction combinée d'un mini-dialogue en deux traductions distinctes (pour A et pour B).
 */
export function splitDialogueTranslation(tradCombined) {
  if (!tradCombined) return null;
  let cleanTrad = String(tradCombined).replace(/^[↳\->\s*]+/, "").trim();

  // Rejeter formellement si la chaîne contient un titre de section ou une balise de piège
  if (/⚠️|Attention au piège|Le piège|🚫|⚡/i.test(cleanTrad)) return null;

  // Pattern 1 : avec guillemets français ou anglais : « Trad A » [-—] « Trad B » ou "Trad A" - "Trad B"
  const quotedMatch = cleanTrad.match(/^([«“"][^»”"]+[»”"])\s*[-—–]\s*([«“"][^»”"]+[»”"])$/);
  if (quotedMatch) {
    return [quotedMatch[1].trim(), quotedMatch[2].trim()];
  }

  // Pattern 2 : avec guillemets partiels ou imbriqués
  const partialQuotedMatch = cleanTrad.match(/^([«“"][^»”"]+[»”"])\s*[-—–]\s*(.+)$/);
  if (partialQuotedMatch) {
    return [partialQuotedMatch[1].trim(), partialQuotedMatch[2].trim()];
  }

  // Pattern 3 : séparé par tiret cadratin ou tiret entouré d'espaces : Trad A — Trad B ou Trad A - Trad B
  const parts = cleanTrad.split(/\s*(?:—|–|\s-\s)\s*/);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return [parts[0].trim(), parts[1].trim()];
  }

  return null;
}

/**
 * Reformatte un dialogue contenant une traduction globale en fin de dialogue
 * pour placer chaque traduction directement sous sa réplique respective.
 */
export function reformatDialogueWithPerTurnTranslation(text) {
  if (!text || typeof text !== "string") return text;

  // Décoller les sections ⚠️ Attention au piège si elles sont collées au dialogue
  text = text.replace(/([^\n])\s*(⚠️\s*\*{0,2}(?:Attention au piège|Piège))/g, "$1\n\n$2");
  text = text.replace(/([^\n])\s*(?:[•·\-\*]\s*)?(🚫\s*\*{0,2}Le piège)/g, "$1\n- $2");
  text = text.replace(/([^\n])\s*(?:[•·\-\*]\s*)?(⚡\s*\*{0,2}L['’]exception)/g, "$1\n- $2");

  // Nettoyage préalable des artefacts d'astérisques et faux blocs de code sur les répliques A et B (ex: "• A : `**` ** ...")
  text = text.replace(/^([ \t]*(?:[•·\-\–]|\*(?!\*))?\s*(?:\*{2}[AB]\s*:\s*\*{2}|[AB]\s*:)\s*)(?:`\*{1,2}`|\*{2,})\s*(?:\*{2,})?\s*/gm, "$1");

  // Élimine toute ligne orpheline ne contenant que des astérisques ou espaces
  text = text.replace(/^\s*\*{1,}\s*$/gm, "");

  // Si A a déjà sa propre traduction ↳ sur sa ligne ou sur la ligne suivante, ne pas exécuter les Cas 1 et 2
  const aAlreadyHasTranslation = /^[\s*•\-\–]*\*{0,2}A\*{0,2}\s*:[^\n]+(?:\n\s*(?:↳|->)|[ \t]+(?:↳|->))/m.test(text);

  if (!aAlreadyHasTranslation) {
    // Cas 1 : Réplique B avec traduction combinée attachée à la fin :
    // • B : "..." ↳ Trad A - Trad B
    // ou * **B :** `...` ↳ Trad A - Trad B
    const inlineBRegex = /^([\s*•\-\–]*\*{0,2}B\*{0,2}\s*:\s*[^\n↳]+)\s*(?:↳|->)\s*(.+)$/m;
    const matchB = text.match(inlineBRegex);
    if (matchB) {
      const bPart = matchB[1].trim();
      const tradCombined = matchB[2].trim();
      const splits = splitDialogueTranslation(tradCombined);
      if (splits) {
        const lineARegex = /^([\s*•\-\–]*\*{0,2}A\*{0,2}\s*:\s*[^\n]+)$/m;
        const matchA = text.match(lineARegex);
        if (matchA && text.indexOf(matchA[0]) < text.indexOf(matchB[0])) {
          const lineA = matchA[1].trim();
          const cleanTradA = splits[0].replace(/^\*+|\*+$/g, "");
          const cleanTradB = splits[1].replace(/^\*+|\*+$/g, "");

          const newA = `${lineA}  \n  ↳ *${cleanTradA}*`;
          const newB = `${bPart}  \n  ↳ *${cleanTradB}*`;

          text = text.replace(matchA[0], newA);
          text = text.replace(matchB[0], newB);
          return text;
        }
      }
    }

    // Cas 2 : Réplique A, puis B, puis ligne suivante ↳ Trad A - Trad B
    const separateTradRegex = /^([\s*•\-\–]*\*{0,2}A\*{0,2}\s*:\s*[^\n]+)\n([\s*•\-\–]*\*{0,2}B\*{0,2}\s*:\s*[^\n]+)\n\s*(?:↳|->)\s*(.+)$/m;
    const matchSep = text.match(separateTradRegex);
    if (matchSep) {
      const lineA = matchSep[1].trim();
      const lineB = matchSep[2].trim();
      const tradCombined = matchSep[3].trim();
      const splits = splitDialogueTranslation(tradCombined);
      if (splits) {
        const cleanTradA = splits[0].replace(/^\*+|\*+$/g, "");
        const cleanTradB = splits[1].replace(/^\*+|\*+$/g, "");
        const replacement = `${lineA}  \n  ↳ *${cleanTradA}*\n${lineB}  \n  ↳ *${cleanTradB}*`;
        return text.replace(matchSep[0], replacement);
      }
    }
  }

  // Cas 3 : Réplique individuelle A ou B avec sa propre traduction directe sur la même ligne :
  // • A : I wish... ↳ J'aimerais...
  // • **A :** "What's more important..." ↳ Quel est le plus important...
  const inlineSameLineRegex = /^[ \t]*(?:[•·\-\–]|\*(?!\*))?\s*(?:\*{2}([AB])\s*:\s*\*{2}|([AB])\s*:)\s*(?:`\*{1,2}`|\*{2,})?\s*([^\n↳]+?)\s*(?:↳|->)\s*([^\n]+)$/gm;
  if (inlineSameLineRegex.test(text)) {
    text = text.replace(inlineSameLineRegex, (match, sp1, sp2, english, french) => {
      const speaker = sp1 || sp2;
      let cleanEnglish = english.trim()
        .replace(/^(?:`\*{1,2}`|\*{2,})\s*/, "")
        .replace(/^[\s*`'"]+|[\s*`'"]+$/g, "");
      let cleanFrench = french.trim()
        .replace(/^\*+|\*+$/g, "")
        .replace(/^[`'"]+|[`'"]+$/g, "");
      return `* **${speaker} :** \`${cleanEnglish}\`  \n  ↳ *${cleanFrench}*`;
    });
  }

  // Nettoyage final des résidus d'astérisques ou faux blocs de code sur les répliques
  text = text.replace(/^([ \t]*(?:[•·\-\–]|\*(?!\*))?\s*(?:\*{2}[AB]\s*:\s*\*{2}|[AB]\s*:)\s*)(?:`\*{1,2}`|\*{2,})\s*(?:\*{2,})?\s*/gm, "$1");
  text = text.replace(/^\s*\*{1,}\s*$/gm, "");

  // Assurer une séparation nette de 2 sauts de ligne après une ligne de traduction ↳ avant une nouvelle section
  text = text.replace(/(\n\s*↳\s*\*[^\n]+\*)\n(?=[^\s\n•\-\*])/g, "$1\n\n");

  return text;
}
