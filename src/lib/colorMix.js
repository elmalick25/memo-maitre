/**
 * Mélange une couleur (hex, rgb(), ou var(--token)) avec de la transparence.
 * Permet d'utiliser les tokens de thème (var(--mm-primary)) là où on
 * concaténait auparavant un suffixe alpha hexadécimal (ex: `${color}40`).
 */
export function colorMix(color, percent = 100, mixWith = "transparent") {
  if (!color) return "transparent";
  return `color-mix(in srgb, ${color} ${percent}%, ${mixWith})`;
}

export default colorMix;
