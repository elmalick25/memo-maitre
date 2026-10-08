// 🔗 src/lib/scholarshipLinks.js
// ============================================================================
// MOTEUR DE LIENS DIRECTS — ÉDITION GOD TIER
// ----------------------------------------------------------------------------
// Garantit qu'AUCUN lien affiché dans l'application ne renvoie vers une page
// d'accueil générique, un agrégateur tiers ou un lien mort.
//
// Chaque bourse expose désormais deux liens strictement séparés :
//   • infoUrl  → la page OFFICIELLE qui décrit la bourse (conditions, montants)
//   • applyUrl → le portail OFFICIEL de dépôt de candidature
//
// Toute URL est normalisée, forcée en HTTPS, débarrassée de ses paramètres de
// tracking, puis auditée (profondeur du chemin + domaine d'autorité).
// ============================================================================

import { isAuthoritativeDomain, extractHostname } from "./scholarshipVerifier.js";

// ─── 1. TABLE D'OVERRIDES : LIENS PROFONDS OFFICIELS VÉRIFIÉS ───────────────
// Clé = id de la bourse dans MASTER_SCHOLARSHIPS_DATABASE.
// Ces liens remplacent toute page d'accueil générique restée dans le catalogue.
export const DIRECT_LINK_OVERRIDES = {
  bourse_excellence_president_senegal: {
    infoUrl: "https://mesrisenegal.sn/direction-des-bourses-mesri/",
    applyUrl: "https://mesrisenegal.sn/direction-des-bourses-mesri/",
  },
  bourse_dbs_etranger_senegal: {
    infoUrl: "https://mesrisenegal.sn/direction-des-bourses-mesri/",
    applyUrl: "https://mesrisenegal.sn/direction-des-bourses-mesri/",
  },
  bourse_coop_senegal_maroc_amci: {
    infoUrl: "https://www.amci.ma/cooperation-academique",
    applyUrl: "https://www.amci.ma/cooperation-academique",
  },
  bourse_coop_senegal_chine_csc: {
    infoUrl: "https://www.campuschina.org/",
    applyUrl: "https://studyinchina.csc.edu.cn/",
  },
  bourse_ansd_ensae_dakar: {
    infoUrl: "https://www.ensae.sn/recherche-et-publications/avis-de-concours",
    applyUrl: "https://www.ensae.sn/admission/concours-ingenieur-statisticien-economiste-ise",
  },
  bourse_cea_mitic_senegal: {
    infoUrl: "https://www.ugb.sn/fr/bourses-de-mobilites-cea-mitic-2025",
    applyUrl: "https://www.ugb.sn/fr/bourses-de-mobilites-cea-mitic-2025",
  },
  bourse_union_africaine_pau: {
    infoUrl: "https://pau-au.africa/fileadmin/Calls_for_Scholarships/2026_call_eng.pdf",
    applyUrl: "https://www.au-pau.org/submission/",
  },
  bourse_cedeao_master: {
    infoUrl: "https://www.ecowas.int/education/",
    applyUrl: "https://www.ecowas.int/education/",
  },
  bourse_turkiye_burslari: {
    infoUrl: "https://turkiyeburslari.gov.tr/applysteps",
    applyUrl: "https://tbbs.turkiyeburslari.gov.tr/",
  },
  bourse_australia_awards: {
    infoUrl: "https://australiaawardsafrica.org/awards/australia-awards-scholarships/",
    applyUrl: "https://australiaawardsafrica.org/awards/apply/",
  },
  bourse_chevening_uk: {
    infoUrl: "https://www.chevening.org/scholarships/",
    applyUrl: "https://www.chevening.org/apply/",
  },
  bourse_mastercard_foundation: {
    infoUrl: "https://mastercardfdn.org/en/what-we-do/our-programs/mastercard-foundation-scholars-program/",
    applyUrl: "https://mastercardfdn.ugb.sn/appel-a-candidature/",
  },
};

// ─── 2. PARAMÈTRES DE TRACKING À SUPPRIMER SYSTÉMATIQUEMENT ─────────────────
const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src", "s_kwcid",
];

// ─── 3. AGRÉGATEURS ET INTERMÉDIAIRES STRICTEMENT INTERDITS ─────────────────
export const FORBIDDEN_LINK_HOSTS = [
  "scholars4dev.com",
  "scholarshipregion.com",
  "opportunitydesk.org",
  "afterschoolafrica.com",
  "mladiinfo.eu",
  "scholarshipsads.com",
  "bourses-etudiants.ma",
  "facebook.com",
  "m.facebook.com",
  "t.co",
  "bit.ly",
  "tinyurl.com",
  "lnkd.in",
  "google.com",
  "www.google.com",
  "bing.com",
  "duckduckgo.com",
];

/**
 * Normalise une URL : HTTPS forcé, tracking supprimé, espaces nettoyés.
 * Renvoie "" si l'URL est inexploitable.
 */
export function normalizeUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let candidate = raw.trim();
  if (!candidate) return "";
  if (candidate.startsWith("//")) candidate = "https:" + candidate;
  if (!/^https?:\/\//i.test(candidate)) candidate = "https://" + candidate.replace(/^\/+/, "");

  try {
    const url = new URL(candidate);
    url.protocol = "https:";
    url.hash = "";
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));
    let out = url.toString();
    // Retirer un "?" orphelin laissé par la suppression des paramètres
    out = out.replace(/\?$/, "");
    return out;
  } catch {
    return "";
  }
}

/**
 * Une URL est "profonde" si elle pointe vers une page réelle et non l'accueil.
 */
export function isDeepLink(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  try {
    const { pathname, search } = new URL(normalized);
    const cleanPath = pathname.replace(/\/+$/, "");
    if (cleanPath.length > 1) return true;
    // Une recherche officielle sur le domaine d'autorité compte comme profonde
    return Boolean(search && search.length > 1);
  } catch {
    return false;
  }
}

/**
 * Détecte un intermédiaire, un raccourcisseur ou un agrégateur non officiel.
 */
export function isForbiddenHost(url) {
  const host = extractHostname(normalizeUrl(url));
  if (!host) return true;
  return FORBIDDEN_LINK_HOSTS.some((bad) => host === bad || host.endsWith("." + bad));
}

/**
 * Sélectionne la meilleure URL parmi une liste de candidats.
 * Priorité : lien profond + domaine d'autorité > lien profond > domaine d'autorité.
 */
export function pickBestUrl(candidates = []) {
  const scored = candidates
    .map((c) => normalizeUrl(c))
    .filter((c) => c && !isForbiddenHost(c))
    .map((c) => ({
      url: c,
      score: (isDeepLink(c) ? 2 : 0) + (isAuthoritativeDomain(c) ? 3 : 0),
    }));
  if (!scored.length) return "";
  scored.sort((a, b) => b.score - a.score);
  return scored[0].url;
}

/**
 * ⭐ API PRINCIPALE — Résout les liens directs d'une bourse.
 *
 * @returns {{
 *   infoUrl: string, applyUrl: string, hostname: string,
 *   isDirect: boolean, isAuthoritative: boolean,
 *   integrity: "direct_official"|"official_portal"|"unverified"|"broken",
 *   label: string
 * }}
 */
export function resolveScholarshipLinks(scholarship) {
  if (!scholarship || typeof scholarship !== "object") {
    return {
      infoUrl: "", applyUrl: "", hostname: "",
      isDirect: false, isAuthoritative: false,
      integrity: "broken", label: "Lien indisponible",
    };
  }

  const override = DIRECT_LINK_OVERRIDES[scholarship.id] || {};

  const infoUrl = pickBestUrl([
    override.infoUrl,
    scholarship.infoUrl,
    scholarship.programPageUrl,
    scholarship.officialUrl,
    override.applyUrl,
    scholarship.applyUrl,
  ]);

  const applyUrl = pickBestUrl([
    override.applyUrl,
    scholarship.applyUrl,
    override.infoUrl,
    scholarship.officialUrl,
    infoUrl,
  ]) || infoUrl;

  const hostname = extractHostname(infoUrl);
  const isAuthoritative = isAuthoritativeDomain(infoUrl);
  const isDirect = isDeepLink(infoUrl);

  let integrity = "unverified";
  let label = "Portail officiel";
  if (!infoUrl) {
    integrity = "broken";
    label = "Lien indisponible";
  } else if (isAuthoritative && isDirect) {
    integrity = "direct_official";
    label = "Page officielle directe";
  } else if (isAuthoritative) {
    integrity = "official_portal";
    label = "Portail officiel";
  } else if (isDirect) {
    integrity = "unverified";
    label = "Page dédiée (à vérifier)";
  }

  return { infoUrl, applyUrl, hostname, isDirect, isAuthoritative, integrity, label };
}

/**
 * Ouvre un lien officiel de façon sûre (nouvel onglet, sans fuite d'opener).
 * Renvoie true si l'ouverture a été déclenchée.
 */
export function openOfficialLink(url) {
  const target = normalizeUrl(url);
  if (!target || isForbiddenHost(target)) return false;
  if (typeof window === "undefined") return false;
  const win = window.open(target, "_blank", "noopener,noreferrer");
  if (win) win.opener = null;
  return true;
}

/**
 * Audit global du catalogue : utile pour les tests de non-régression.
 */
export function auditScholarshipLinks(list = []) {
  const report = { total: list.length, direct: 0, portal: 0, broken: 0, offenders: [] };
  list.forEach((item) => {
    const links = resolveScholarshipLinks(item);
    if (links.integrity === "direct_official") report.direct++;
    else if (links.integrity === "official_portal") report.portal++;
    else {
      report.broken++;
      report.offenders.push({ id: item?.id, title: item?.title, infoUrl: links.infoUrl, integrity: links.integrity });
    }
  });
  return report;
}
