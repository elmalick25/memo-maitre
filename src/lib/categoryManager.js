export const CATEGORIES_DEFAULT = [
  { name: "🇬🇧 Anglais", targetScore: 90, priority: "haute", color: "#2563eb" },
  { name: "☕ Java / Spring Boot", targetScore: 85, priority: "haute", color: "#A855F7" },
  { name: "🖥️ Informatique Générale", targetScore: 80, priority: "normale", color: "#2563eb" },
  { name: "📊 Data Processing", targetScore: 80, priority: "normale", color: "#F59E0B" },
];

export const CAT_PALETTE = [
  "#2563eb", "#A855F7", "#C084FC", "#F472B6", "#34D399",
  "#FBBF24", "#3b82f6", "#E879F9", "#EF4444", "#10B981"
];

export function mergeDefaultCategories(stored, deletedNames = []) {
  const list = Array.isArray(stored) ? [...stored] : [];
  const existing = new Set(list.map((c) => (c?.name || "").trim()));
  const deletedSet = new Set((deletedNames || []).map((n) => (n || "").trim()));
  for (const def of CATEGORIES_DEFAULT) {
    const defName = def.name.trim();
    if (!existing.has(defName) && !deletedSet.has(defName)) {
      list.push({ ...def });
    }
  }
  return list;
}

export function reconcileCategoriesWithExpressions(categories, expressions, deletedNames = []) {
  const list = Array.isArray(categories) ? [...categories] : [];
  const existing = new Set(list.map((c) => (c?.name || "").trim()));
  const deletedSet = new Set((deletedNames || []).map((n) => (n || "").trim()));
  const seen = new Set();

  for (const exp of (expressions || [])) {
    const name = (exp?.category || "").trim();
    if (!name || seen.has(name) || existing.has(name) || deletedSet.has(name)) continue;
    seen.add(name);
    list.push({
      name,
      targetScore: 80,
      priority: "normale",
      color: CAT_PALETTE[list.length % CAT_PALETTE.length],
    });
  }
  return list.filter((c) => !deletedSet.has((c?.name || "").trim()));
}
