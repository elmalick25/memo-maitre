export const CATEGORIES_DEFAULT = [
  { name: "🇬🇧 Anglais", examDate: "", targetScore: 90, priority: "haute", color: "#8B5CF6" },
  { name: "☕ Java / Spring Boot", examDate: "", targetScore: 85, priority: "haute", color: "#A855F7" },
  { name: "🖥️ Informatique Générale", examDate: "", targetScore: 80, priority: "normale", color: "#7C3AED" },
  { name: "📊 Data Processing", examDate: "", targetScore: 80, priority: "normale", color: "#F59E0B" },
];

export const CAT_PALETTE = [
  "#8B5CF6", "#A855F7", "#C084FC", "#F472B6", "#34D399",
  "#FBBF24", "#F97316", "#E879F9", "#EF4444", "#10B981"
];

export function mergeDefaultCategories(stored) {
  const list = Array.isArray(stored) ? [...stored] : [];
  const existing = new Set(list.map((c) => (c?.name || "").trim()));
  for (const def of CATEGORIES_DEFAULT) {
    if (!existing.has(def.name.trim())) {
      list.push({ ...def });
    }
  }
  return list;
}

export function reconcileCategoriesWithExpressions(categories, expressions) {
  const list = Array.isArray(categories) ? [...categories] : [];
  const existing = new Set(list.map((c) => (c?.name || "").trim()));
  const seen = new Set();

  for (const exp of (expressions || [])) {
    const name = (exp?.category || "").trim();
    if (!name || seen.has(name) || existing.has(name)) continue;
    seen.add(name);
    list.push({
      name,
      examDate: "",
      targetScore: 80,
      priority: "normale",
      color: CAT_PALETTE[list.length % CAT_PALETTE.length],
    });
  }
  return list;
}
