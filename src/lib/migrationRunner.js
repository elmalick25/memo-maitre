// src/lib/migrationRunner.js — Moteur commun de rénovation des fiches par lot.
// Objectifs : aucune fiche perdue, aucun doublon, aucune fiche écrasée par erreur,
// messages clairs en cas d'échec partiel ou total, et immunité au double-clic.

/** Une fiche est exploitable si elle porte au moins un contenu texte. */
export function hasUsableContent(card) {
  if (!card) return false;
  const front = typeof card.front === "string" ? card.front.trim() : "";
  const back = typeof card.back === "string" ? card.back.trim() : "";
  const example = typeof card.example === "string" ? card.example.trim() : "";
  return Boolean(front || back || example);
}

/** Identifiant utilisable pour le remplacement en base (jamais null/undefined/""). */
export function stableId(card) {
  if (!card) return null;
  const id = card.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}

/**
 * Exécute une rénovation par lot.
 *
 * @returns {Promise<{migrated:number, failed:number, skipped:number, total:number}>}
 */
export async function runCardMigration({
  cards = [],
  selectCard,          // (card) => bool : fiche concernée par cette rénovation
  transformCard,       // async (card) => card renovée (ou la fiche d'origine si échec)
  isMigrated,          // (card) => bool : la fiche renovée est-elle conforme ?
  setExpressions,
  onProgress,
  showToast,
  concurrency = 3,
  labels = {},
  retries = 1,
  liveUpdate = true,
}) {
  const {
    nothingToDo = "Toutes les fiches sont déjà au nouveau format !",
    success = (n) => `✨ ${n} fiche(s) rénovée(s) avec succès !`,
    partial = (ok, ko) =>
      `✨ ${ok} fiche(s) rénovée(s) · ⚠️ ${ko} n'ont pas pu l'être. Réessaie pour les fiches restantes.`,
    allFailed = (n) =>
      `❌ La rénovation a échoué pour ${n} fiche(s). Vérifie ta connexion internet puis réessaie.`,
    skippedOnly = (n) => `⚠️ ${n} fiche(s) sont vides : rien à rénover dedans.`,
  } = labels;

  const source = Array.isArray(cards) ? cards : [];
  const candidates = source.filter((c) => c && selectCard(c));

  if (!candidates.length) {
    showToast?.(nothingToDo, "info");
    return { migrated: 0, failed: 0, skipped: 0, total: 0 };
  }
  if (!setExpressions || !transformCard) {
    showToast?.("Rénovation indisponible pour le moment.", "error");
    return { migrated: 0, failed: candidates.length, skipped: 0, total: candidates.length };
  }

  // Fiches réellement traitables (on ne fait pas d'appel IA sur une fiche vide)
  const targetCards = [];
  let skipped = 0;
  for (const card of candidates) {
    if (hasUsableContent(card)) targetCards.push(card);
    else skipped++;
  }

  const total = targetCards.length;
  if (!total) {
    showToast?.(skippedOnly(skipped), "info");
    return { migrated: 0, failed: 0, skipped, total: 0 };
  }

  let completed = 0;
  let failed = 0;
  // Deux index : par id stable ET par référence d'objet, pour ne jamais
  // écraser plusieurs fiches à cause d'un id manquant ou dupliqué.
  const byId = new Map();
  const byRef = new Map();

  const processOne = async (card) => {
    let upgraded = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await transformCard(card);
        if (result && isMigrated(result)) {
          upgraded = result;
          break;
        }
      } catch (err) {
        console.warn("[migrationRunner] Tentative échouée:", err);
      }
    }

    if (upgraded) {
      // Filet de sécurité : on ne perd jamais les champs d'origine.
      const merged = { ...card, ...upgraded, id: card.id };
      const key = stableId(card);
      if (key && !byId.has(key)) byId.set(key, merged);
      byRef.set(card, merged);

      if (liveUpdate && setExpressions) {
        setExpressions((prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((c) => {
            if (!c) return c;
            if (c === card || (key && stableId(c) === key)) return merged;
            return c;
          });
        });
      }
    } else {
      failed++;
    }

    completed++;
    try { onProgress?.(completed, total); } catch { /* l'UI ne doit jamais casser le lot */ }
  };

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, total));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < total) {
        const idx = cursor++;
        await processOne(targetCards[idx]);
      }
    })
  );

  const migrated = byRef.size;

  if (migrated > 0) {
    setExpressions((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map((c) => {
        if (!c) return c;
        const direct = byRef.get(c);
        if (direct) return direct;
        const key = stableId(c);
        if (key && byId.has(key)) return byId.get(key);
        return c;
      });
    });
  }

  if (migrated > 0 && failed === 0) showToast?.(success(migrated), "success");
  else if (migrated > 0 && failed > 0) showToast?.(partial(migrated, failed), "info");
  else showToast?.(allFailed(failed || total), "error");

  return { migrated, failed, skipped, total };
}
