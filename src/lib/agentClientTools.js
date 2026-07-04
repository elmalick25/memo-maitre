// agentClientTools.js — Registre global des tools exposés à l'agent ElevenLabs
// ══════════════════════════════════════════════════════════════════════════════
// Permet à n'importe quelle vue (EnglishPractice, Lab, MemoMaster...)
// d'exposer des fonctions que l'agent peut appeler pendant la conversation.
//
// ⚠️ Les tools DOIVENT aussi être déclarés côté ElevenLabs (dashboard) pour
//    que le LLM sache qu'ils existent. Sans déclaration côté ElevenLabs, le
//    SDK ne les appellera jamais — mais la déclaration côté client permet
//    aux tools de fonctionner dès qu'ils sont ajoutés à l'agent distant.
//
// Exemples de tools que tu peux déclarer sur ton agent ElevenLabs :
//   • save_expression    : {front, back, example?, category?}
//   • mark_correction    : {original, corrected, note?}
//   • award_xp           : {reason, amount}
//   • end_session_summary: {highlights, corrections, micro_objective}
//   • navigate_to        : {module}   ← "practice" | "review" | "add" | "lab"
//
// ══════════════════════════════════════════════════════════════════════════════

const registry = new Map();

export function registerAgentClientTool(name, fn) {
  if (typeof name !== "string" || typeof fn !== "function") return () => {};
  registry.set(name, fn);
  return () => { if (registry.get(name) === fn) registry.delete(name); };
}

export function unregisterAgentClientTool(name) {
  registry.delete(name);
}

/** Renvoie un objet clientTools consommable par useConversation({ clientTools }) */
export function getClientTools() {
  const out = {};
  for (const [name, fn] of registry.entries()) {
    out[name] = async (params) => {
      try {
        const res = await fn(params || {});
        // Le SDK ElevenLabs attend une string en retour
        if (typeof res === "string") return res;
        return JSON.stringify(res ?? { ok: true });
      } catch (e) {
        console.error(`[agentClientTools] tool "${name}" threw:`, e);
        return JSON.stringify({ ok: false, error: e?.message || String(e) });
      }
    };
  }
  return out;
}

/** Snapshot du contexte élève à envoyer via sendContextualUpdate au connect. */
let contextSnapshotBuilder = null;

export function setContextSnapshotBuilder(fn) {
  contextSnapshotBuilder = typeof fn === "function" ? fn : null;
}

export function buildContextSnapshot() {
  if (!contextSnapshotBuilder) return null;
  try {
    return contextSnapshotBuilder();
  } catch (e) {
    console.warn("[agentClientTools] buildContextSnapshot failed:", e);
    return null;
  }
}
