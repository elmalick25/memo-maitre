// Classement figé des actualités : calculé à la fin d'une actualisation, puis réutilisé
// tel quel à chaque réouverture, pour que l'ordre ne change jamais entre deux actualisations.
export const RANK_SNAPSHOT_KEY = "tech_intel_rank_snapshot_v1";

export function loadRankSnapshot(storage) {
  try {
    const raw = storage?.get?.(RANK_SNAPSHOT_KEY);
    const snap = raw ? JSON.parse(raw) : null;
    if (!snap || typeof snap.now !== "number") return null;
    return { now: snap.now, taste: snap.taste || null, aiScores: snap.aiScores || {} };
  } catch { return null; }
}

export function saveRankSnapshot(storage, snap) {
  try { storage?.set?.(RANK_SNAPSHOT_KEY, JSON.stringify(snap)); } catch {}
}
