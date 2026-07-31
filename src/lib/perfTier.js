// src/lib/perfTier.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 21 — Budget de performance par palier d'appareil.
//
// `backdrop-filter: blur()` et les `conic-gradient` animés en boucle sont les
// effets CSS les plus coûteux ; indolores sur desktop, ils font tomber les
// Android d'entrée de gamme à 15 fps (vue Badges : des dizaines de halos ;
// RewardChest : overlay flouté plein écran).
//
// Détection volontairement légère (aucune mesure de frame) :
//   • prefers-reduced-motion → mode allégé ;
//   • hardwareConcurrency ≤ 4 ou deviceMemory ≤ 4 Go → mode allégé ;
//   • connexion "save-data" → mode allégé.
// En mode allégé, on garde la COULEUR PLEINE + l'ICÔNE : la hiérarchie de
// rareté reste parfaitement lisible, seul le coût GPU disparaît.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";

export const PERF_PREF_KEY = "mm_perf_mode"; // "auto" | "lite" | "full"
export const LITE_CLASS = "perf-lite";

export function detectLowPerfDevice() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  } catch { /* noop */ }
  const nav = window.navigator || {};
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 4) return true;
  if (nav.connection?.saveData) return true;
  return false;
}

export function readPerfPref() {
  try { return window.localStorage.getItem(PERF_PREF_KEY) || "auto"; } catch { return "auto"; }
}

export function setPerfPref(mode) {
  try { window.localStorage.setItem(PERF_PREF_KEY, mode); } catch { /* noop */ }
}

/** Le mode allégé est-il actif (préférence explicite > détection) ? */
export function isLiteMode() {
  const pref = readPerfPref();
  if (pref === "lite") return true;
  if (pref === "full") return false;
  return detectLowPerfDevice();
}

/**
 * Hook : renvoie `true` en mode allégé et pose la classe `perf-lite` sur
 * <body> (les feuilles de style neutralisent alors blur/glow animés).
 */
export function usePerfTier() {
  const [lite, setLite] = useState(() => (typeof window === "undefined" ? false : isLiteMode()));

  useEffect(() => {
    const apply = () => setLite(isLiteMode());
    apply();
    let mql = null;
    try {
      mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      mql.addEventListener?.("change", apply);
    } catch { /* noop */ }
    window.addEventListener("storage", apply);
    return () => {
      mql?.removeEventListener?.("change", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle(LITE_CLASS, lite);
  }, [lite]);

  return lite;
}

/** Styles de rareté allégés : couleur pleine conservée, halo supprimé. */
export function liteRarityStyle(style = {}, lite = false) {
  if (!lite) return style;
  return { ...style, glow: "none", animation: "none" };
}

/** CSS global du mode allégé — à injecter une seule fois (shell de l'app). */
export const PERF_LITE_CSS = `
  body.${LITE_CLASS} *,
  body.${LITE_CLASS} *::before,
  body.${LITE_CLASS} *::after {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  body.${LITE_CLASS} .badge-glow,
  body.${LITE_CLASS} .rarity-glow,
  body.${LITE_CLASS} .constellation-header,
  body.${LITE_CLASS} .chest-overlay,
  body.${LITE_CLASS} .holo-aura {
    animation: none !important;
    box-shadow: none !important;
    filter: none !important;
  }
  body.${LITE_CLASS} .mhv2-hero-aurora,
  body.${LITE_CLASS} .mhv2-hero-shine,
  body.${LITE_CLASS} .app-orb-1,
  body.${LITE_CLASS} .app-orb-2 { display: none !important; }
`;

export default usePerfTier;
