export const CARD_TYPES = [
  { id: "qa", label: "Q/A", icon: "❓", desc: "Question / Réponse classique" },
  { id: "definition", label: "Définition", icon: "📖", desc: "Terme + définition exacte" },
  { id: "concept", label: "Concept", icon: "💡", desc: "Idée à comprendre en profondeur" },
  { id: "code", label: "Code", icon: "💻", desc: "Extrait, fonction, examen de code" },
  { id: "table", label: "Tableau", icon: "📊", desc: "Données comparatives, grille" },
  { id: "list", label: "Liste", icon: "📋", desc: "Étapes, items, checklist" },
  { id: "formula", label: "Formule", icon: "🧮", desc: "Maths / physique (LaTeX dans $...$)" },
  { id: "cloze", label: "Texte à trous", icon: "🧩", desc: "Phrase avec {{c1::mot}} masqué" },
  { id: "image", label: "Image", icon: "🖼️", desc: "Carte visuelle (image en façade)" },
  { id: "mixed", label: "Mixte", icon: "✨", desc: "Texte + code + tableau" },
];

export const SLASH_COMMANDS = [
  { id: "reformuler", icon: "✨", label: "Reformuler", desc: "Proposer des alternatives" },
  { id: "expliquer", icon: "🤖", label: "Expliquer", desc: "Explication pédagogique" },
  { id: "analogie", icon: "🌱", label: "Analogie", desc: "Métaphore pour un enfant" },
  { id: "mermaid", icon: "📐", label: "Diagramme", desc: "Ouvrir l'éditeur Mermaid" },
  { id: "image", icon: "🖼️", label: "Image", desc: "Rechercher une image" },
];
