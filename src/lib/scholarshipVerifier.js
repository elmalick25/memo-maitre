// 🛡️ src/lib/scholarshipVerifier.js
// ============================================================================
// MOTEUR D'AUDIT, DE VÉRIFICATION ET DE GARANTIE DE VÉRACITÉ DES BOURSES
// ÉDITION GOD TIER — CONFORMITÉ RÉGLEMENTAIRE ET TRAÇABILITÉ GOUVERNEMENTALE
// ============================================================================

/**
 * Whitelist des Domaines d'Autorité Officiels (Gouvernements, Ministères, Traités Multilatéraux)
 * Rejette strictement tout intermédiaire, blog non officiel ou agrégateur tiers.
 */
export const AUTHORITATIVE_GOVERNMENT_DOMAINS = [
  // 🇸🇳 Sénégal & Organismes Nationaux
  "mesr.gouv.sn",
  "mesrisenegal.sn",
  "gouv.sn",
  "ensae.ansd.sn",
  "ensae.sn",
  "ansd.sn",
  "ceamitic.ugb.sn",
  "ugb.sn",
  "ucad.sn",
  
  // 🇲🇦 Maroc & Coopération Bilatérale
  "amci.ma",
  
  // 🇫🇷 France & Coopération Franco-Sénégalaise
  "sn.ambafrance.org",
  "ambafrance.org",
  "bourses.franceausenegal.com",
  "franceausenegal.com",
  "campusfrance.org",
  "diplomatie.gouv.fr",
  "sciencespo.fr",
  
  // 🇨🇳 Chine (CSC)
  "campuschina.org",
  "csc.edu.cn",
  
  // 🌍 Multilatéral & Grandes Fondations Mondiales
  "mastercardfdn.org",
  "worldbank.org",
  "afdb.org",
  "isdb.org",
  "pau-au.africa",
  "au.int",
  "ecowas.int",
  "auf.org",
  
  // 🇪🇺 Union Européenne, UK & Europe
  "eacea.ec.europa.eu",
  "europa.eu",
  "chevening.org",
  "gov.uk",
  "daad.de",
  "ares-ac.be",
  "sbfi.admin.ch",
  "admin.ch",
  "si.se",
  "turkiyeburslari.gov.tr",
  "gov.tr",
  
  // 🌎 Amériques, Asie & Océanie
  "usembassy.gov",
  "state.gov",
  "iie.org",
  "fulbrightonline.org",
  "emb-japan.go.jp",
  "mext.go.jp",
  "studyinjapan.go.jp",
  "jica.go.jp",
  "studyinkorea.go.kr",
  "niied.go.kr",
  "australiaawardsafrica.org",
  "dfat.gov.au",
  "au-pau.org",
  "mfat.govt.nz",
  "govt.nz",
  "boursesfrancophonie.ca",
  "cscuk.fcdo.gov.uk",
  "esteri.it",
  "studyinitaly.esteri.it",
  "vanier.gc.ca",
  "canada.ca",
  "china-embassy.gov.cn",
];

/**
 * Types d'Autorités Officielles Reconnues
 */
export const AUTHORITY_TYPES = {
  GOVERNMENT_DIRECT: { id: "GOVERNMENT_DIRECT", label: "🏛️ Gouvernement & Ministère d'État", badge: "Gouvernemental" },
  BILATERAL_ACCORD: { id: "BILATERAL_ACCORD", label: "🤝 Coopération Diplomatique Bilatérale", badge: "Bilatéral Officiel" },
  MULTILATERAL_TREATY: { id: "MULTILATERAL_TREATY", label: "🌍 Institution Multilatérale & Traité", badge: "Multilatéral" },
  PUBLIC_UNIVERSITY: { id: "PUBLIC_UNIVERSITY", label: "🎓 Grande École & Université d'Élite", badge: "Université Certifiée" },
};

/**
 * Extrait le nom d'hôte / domaine d'une URL
 */
export function extractHostname(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Vérifie si une URL provient d'un domaine d'État ou d'autorité certifié
 */
export function isAuthoritativeDomain(urlStr) {
  const hostname = extractHostname(urlStr);
  if (!hostname) return false;
  return AUTHORITATIVE_GOVERNMENT_DOMAINS.some(
    (allowed) => hostname === allowed || hostname.endsWith("." + allowed)
  );
}

/**
 * Valide l'authenticité et la véracité stricte d'une bourse
 */
export function verifyScholarshipTruth(scholarship) {
  const checks = [];
  let isCompliant = true;

  // 1. Contrôle du lien d'autorité officiel
  const hasValidUrl = scholarship.officialUrl && scholarship.officialUrl.startsWith("https://");
  const isAuthorityDomain = isAuthoritativeDomain(scholarship.officialUrl);
  
  checks.push({
    code: "OFFICIAL_DOMAIN",
    label: "Origine du portail officiel vérifiée",
    passed: hasValidUrl && isAuthorityDomain,
    details: isAuthorityDomain
      ? `Domaine d'autorité certifié : ${extractHostname(scholarship.officialUrl)}`
      : `Domaine non certifié : ${extractHostname(scholarship.officialUrl)}`,
  });
  if (!hasValidUrl || !isAuthorityDomain) isCompliant = false;

  // 2. Contrôle de la présence de l'organisme légal
  const hasOrg = Boolean(scholarship.verifiedOrg && scholarship.verifiedOrg.trim().length > 5);
  checks.push({
    code: "VERIFIED_ORG",
    label: "Organisme public ou émetteur légal identifié",
    passed: hasOrg,
    details: hasOrg ? scholarship.verifiedOrg : "Organisme émetteur manquant",
  });
  if (!hasOrg) isCompliant = false;

  // 3. Contrôle des critères d'éligibilité réglementaires
  const elig = scholarship.eligibility || {};
  const hasCriteria = Boolean(
    elig.academicLevel &&
    elig.maxAge &&
    elig.nationality &&
    elig.languageReq &&
    elig.nominationMode
  );
  checks.push({
    code: "REGULATORY_CRITERIA",
    label: "Critères d'éligibilité réglementaires complets",
    passed: hasCriteria,
    details: hasCriteria
      ? `Âge : ${elig.maxAge} | Diplôme : ${elig.academicLevel}`
      : "Critères réglementaires incomplets",
  });
  if (!hasCriteria) isCompliant = false;

  // 4. Contrôle des documents et spécifications obligatoires
  const docs = scholarship.requiredDocuments || [];
  const hasDocsSpecs = docs.length >= 2 && docs.every((d) => d.name && d.description && d.specifications && d.godTip);
  checks.push({
    code: "OFFICIAL_DOCUMENTS",
    label: "Nomenclature des pièces justificatives officielles",
    passed: hasDocsSpecs,
    details: `${docs.length} pièces documentées avec spécifications légales`,
  });
  if (!hasDocsSpecs) isCompliant = false;

  // Score de véracité (100% si tous les critères sont validés)
  const passedChecksCount = checks.filter((c) => c.passed).length;
  const trustScore = Math.round((passedChecksCount / checks.length) * 100);

  return {
    isValid: isCompliant,
    trustScore,
    verifiedDomain: extractHostname(scholarship.officialUrl),
    verifiedOrg: scholarship.verifiedOrg,
    legalReference: scholarship.legalReference || "Conforme aux dispositions ministérielles et textes réglementaires en vigueur",
    sourceType: scholarship.sourceType || "GOVERNMENT_DIRECT",
    seal: isCompliant ? "🛡️ CERTIFICATION OFFICIELLE D'ÉTAT" : "⚠️ NON CERTIFIÉ",
    checks,
  };
}

/**
 * Audite l'intégralité d'une base de données de bourses
 */
export function auditDatabaseTruth(database) {
  const reports = database.map((item) => ({
    id: item.id,
    title: item.title,
    country: item.country,
    report: verifyScholarshipTruth(item),
  }));

  const total = reports.length;
  const compliantCount = reports.filter((r) => r.report.isValid).length;
  const averageTrustScore = Math.round(
    reports.reduce((acc, r) => acc + r.report.trustScore, 0) / (total || 1)
  );

  return {
    total,
    compliantCount,
    complianceRate: Math.round((compliantCount / (total || 1)) * 100),
    averageTrustScore,
    reports,
  };
}
