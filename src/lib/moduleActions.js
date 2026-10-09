export function getModuleCards(expressions, name, isDue, date) {
  const all = expressions.filter(card => card.category === name);
  const active = all.filter(card => !card.paused);
  return { all, active, due: active.filter(card => isDue(card.nextReview, date)), paused: all.filter(card => card.paused), newCards: active.filter(card => (card.level || 0) === 0) };
}
export function isAvailableModuleName(categories, name) {
  const normalized = String(name || '').trim().toLocaleLowerCase();
  return Boolean(normalized) && !categories.some(c => c.name.trim().toLocaleLowerCase() === normalized);
}
export function mergeModuleData(categories, expressions, source, target) {
  if (!source || source === target || !categories.some(c => c.name === source) || !categories.some(c => c.name === target)) throw new Error('Sélectionne deux modules existants et distincts.');
  return { categories: categories.filter(c => c.name !== source), expressions: expressions.map(c => c.category === source ? { ...c, category: target } : c) };
}
