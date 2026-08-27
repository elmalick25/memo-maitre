// 🎓 src/lib/scholarshipCatalog.js
// ============================================================================
// CATALOGUE & MOTEUR D'INTELLIGENCE DES BOURSES DE MASTER INTERNATIONALES
// ============================================================================
// Sources officielles vérifiées (Gouvernements, UE, Grandes Fondations)
// Métadonnées : Montants mensuels, Prise en charge 100%, Deadlines & Éligibilité
// ============================================================================

import { evaluateSourceTrust } from "./feedEngine.js";

/**
 * Types de prise en charge financière
 */
export const FUNDING_TYPES = {
  FULL_RIDE: { id: "full_ride", label: "👑 100% Tout Compris (Full Ride)", desc: "Scolarité + Allocation mensuelle + Billets d'avion + Assurance" },
  TUITION_PLUS_STIPEND: { id: "tuition_stipend", label: "💎 Scolarité + Allocation", desc: "Exonération des frais + Allocation mensuelle" },
  TUITION_WAIVER: { id: "tuition_waiver", label: "🎓 Frais de scolarité offerts", desc: "Prise en charge intégrale des frais universitaires" },
  PARTIAL: { id: "partial", label: "🪙 Bourse Partielle", desc: "Aide financière annuelle ou forfait d'installation" },
};

/**
 * Domaines d'études prioritaires
 */
export const SCHOLARSHIP_FIELDS = [
  { id: "all", label: "Toutes filières" },
  { id: "tech_ai", label: "💻 Tech, IA & Data Science" },
  { id: "engineering", label: "⚙️ Ingénierie & Sciences dures" },
  { id: "business", label: "📈 Management, Finance & Éco" },
  { id: "health", label: "🧬 Santé, Médecine & Bio" },
  { id: "law_intl", label: "⚖️ Droit, Relations Intl & Gouvernance" },
  { id: "environment", label: "🌱 Énergie, Climat & RSE" },
];

/**
 * Catalogue exhaustif des Grandes Bourses de Master Officielles Mondiales
 */
export const MASTER_SCHOLARSHIPS_DATABASE = [
  // 🇫🇷 FRANCE
  {
    id: "bourse_eiffel_france",
    title: "Bourse d'Excellence Eiffel (Master)",
    provider: "Ministère de l'Europe et des Affaires Étrangères (Campus France)",
    country: "France",
    countryCode: "FR",
    flag: "🇫🇷",
    targetDegree: "Master 1 / Master 2 / Titre d'Ingénieur",
    fundingType: "full_ride",
    monthlyStipend: "1 181 € / mois",
    totalValueEst: "~30 000 € / an",
    benefits: [
      "Allocation mensuelle de 1 181 €",
      "Billet d'avion A/R international pris en charge",
      "Couverture sécurité sociale & mutuelle santé",
      "Priorité d'accès aux logements universitaires CROUS",
      "Activités culturelles et voyages d'intégration"
    ],
    deadlineMonth: "Janvier (annuel)",
    nextDeadline: "2027-01-10",
    eligibility: {
      maxAge: "27 ans au moment du dépôt (candidats Master)",
      nationality: "Tous pays étrangers (hors nationalité française)",
      level: "Licence / Bachelor ou Master 1 avec mention",
      languageReq: "Français (B2/C1) ou Anglais (selon la formation)",
      applicationMode: "Présentation obligatoire par un établissement d'enseignement supérieur français"
    },
    fields: ["tech_ai", "engineering", "business", "law_intl", "environment"],
    officialUrl: "https://www.campusfrance.org/fr/le-programme-de-bourses-france-excellence-eiffel",
    applicationPortal: "https://www.campusfrance.org",
    verifiedOrg: "Gouvernement Français / Campus France",
    trustScore: 100,
    tags: ["eiffel", "campus france", "france", "master", "full ride", "excellence"]
  },
  {
    id: "bourse_ens_paris_saclay",
    title: "Bourses Internationales Master Paris-Saclay",
    provider: "Université Paris-Saclay & Grandes Écoles",
    country: "France",
    countryCode: "FR",
    flag: "🇫🇷",
    targetDegree: "Master 1 ou Master 2 Recherche / Professionnel",
    fundingType: "full_ride",
    monthlyStipend: "1 000 € / mois (10 000 € / an)",
    totalValueEst: "~15 000 € / an",
    benefits: [
      "Bourse de 10 000 € par an",
      "Forfait voyage et frais de visa jusqu'à 1 000 €",
      "Exonération des frais d'inscription universitaire"
    ],
    deadlineMonth: "Mai (annuel)",
    nextDeadline: "2027-05-15",
    eligibility: {
      maxAge: "30 ans",
      nationality: "Étudiants internationaux nouvellement arrivés en France",
      level: "Excellent dossier académique (Top 10% de promotion)",
      languageReq: "Anglais ou Français selon le parcours"
    },
    fields: ["tech_ai", "engineering", "health", "environment"],
    officialUrl: "https://www.universite-paris-saclay.fr/admission/bourses-et-aides-financieres/bourses-internationales-de-master",
    applicationPortal: "https://www.universite-paris-saclay.fr",
    verifiedOrg: "Université Paris-Saclay",
    trustScore: 98,
    tags: ["saclay", "paris", "master", "recherche", "ia", "informatique"]
  },

  // 🇪🇺 UNION EUROPÉENNE (ERASMUS MUNDUS)
  {
    id: "bourse_erasmus_mundus_emjmd",
    title: "Bourses d'Excellence Erasmus Mundus (EMJM)",
    provider: "Commission Européenne (Union Européenne)",
    country: "Union Européenne (Multi-Pays)",
    countryCode: "EU",
    flag: "🇪🇺",
    targetDegree: "Joint Master Degree (Double/Triple Diplôme International)",
    fundingType: "full_ride",
    monthlyStipend: "1 400 € / mois (durant 24 mois)",
    totalValueEst: "~45 000 € au total",
    benefits: [
      "Allocation mensuelle fixe de 1 400 € / mois",
      "Frais de scolarité intégralement couverts (100%)",
      "Assurance médicale internationale complète",
      "Études dans au moins 2 à 3 pays européens différents",
      "Diplôme conjoint ou multiple reconnu mondialement"
    ],
    deadlineMonth: "Janvier - Mars (selon le consortium)",
    nextDeadline: "2027-02-15",
    eligibility: {
      maxAge: "Aucune limite d'âge",
      nationality: "Ouvert à toutes les nationalités du monde entier",
      level: "Licence / Bachelor obtenu ou en cours d'obtention",
      languageReq: "Anglais certifié (IELTS ≥ 6.5 / TOEFL iBT ≥ 90)"
    },
    fields: ["tech_ai", "engineering", "business", "health", "law_intl", "environment"],
    officialUrl: "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en",
    applicationPortal: "https://erasmus-plus.ec.europa.eu",
    verifiedOrg: "Commission Européenne",
    trustScore: 100,
    tags: ["erasmus", "erasmus mundus", "europe", "master conjoint", "full ride"]
  },

  // 🇩🇪 ALLEMAGNE (DAAD)
  {
    id: "bourse_daad_allemagne",
    title: "Bourses d'Études DAAD Master (All Disciplines)",
    provider: "Deutscher Akademischer Austauschdienst (Gouvernement Allemand)",
    country: "Allemagne",
    countryCode: "DE",
    flag: "🇩🇪",
    targetDegree: "Master (100% en anglais ou en allemand)",
    fundingType: "full_ride",
    monthlyStipend: "934 € / mois",
    totalValueEst: "~22 000 € / an",
    benefits: [
      "Allocation mensuelle de 934 €",
      "Forfait annuel pour frais d'études (460 €)",
      "Couverture complète assurance maladie, accident et responsabilité",
      "Billet d'avion A/R Allemagne",
      "Cours intensif d'allemand gratuit avant le Master"
    ],
    deadlineMonth: "Novembre (annuel)",
    nextDeadline: "2026-11-15",
    eligibility: {
      maxAge: "Diplôme antérieur obtenu il y a moins de 6 ans",
      nationality: "Tous pays éligibles",
      level: "Licence / Bachelor avec d'excellents résultats",
      languageReq: "IELTS 6.5+ (programmes en anglais) ou TestDaF B2/C1 (en allemand)"
    },
    fields: ["tech_ai", "engineering", "business", "environment", "health"],
    officialUrl: "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
    applicationPortal: "https://portal.daad.de",
    verifiedOrg: "DAAD Allemagne",
    trustScore: 100,
    tags: ["daad", "allemagne", "germany", "master", "full ride", "gratuit"]
  },

  // 🇬🇧 ROYAUME-UNI (CHEVENING)
  {
    id: "bourse_chevening_uk",
    title: "Bourses Chevening du Gouvernement Britannique",
    provider: "Foreign, Commonwealth & Development Office (UK FCDO)",
    country: "Royaume-Uni",
    countryCode: "GB",
    flag: "🇬🇧",
    targetDegree: "Master 1 an (Taught Master Degree)",
    fundingType: "full_ride",
    monthlyStipend: "£1 350 à £1 650 / mois (selon Londres / province)",
    totalValueEst: "~£40 000 / an",
    benefits: [
      "Frais de scolarité universitaires payés à 100%",
      "Allocation de subsistance mensuelle",
      "Vols aller-retour classe éco vers le Royaume-Uni",
      "Frais de visa et supplément santé NHS inclus",
      "Accès exclusif au réseau mondial des alumni Chevening"
    ],
    deadlineMonth: "Novembre (annuel)",
    nextDeadline: "2026-11-05",
    eligibility: {
      maxAge: "Aucune limite d'âge",
      nationality: "Citoyens des pays partenaires Chevening (160+ pays)",
      level: "Diplôme équivalent Bachelor britannique 2:1 honours",
      workExperience: "Minimum 2 ans d'expérience professionnelle (2 800 heures)",
      languageReq: "IELTS ou équivalent validé par l'université choisie"
    },
    fields: ["tech_ai", "business", "law_intl", "environment", "health", "engineering"],
    officialUrl: "https://www.chevening.org/scholarships/",
    applicationPortal: "https://www.chevening.org/apply",
    verifiedOrg: "Gouvernement Britannique (UK FCDO)",
    trustScore: 100,
    tags: ["chevening", "uk", "londres", "royaume-uni", "master", "prestige"]
  },

  // 🇺🇸 ÉTATS-UNIS (FULBRIGHT)
  {
    id: "bourse_fulbright_usa",
    title: "Programme Fulbright Étudiants Étrangers (Foreign Student Program)",
    provider: "Département d'État des États-Unis (U.S. Department of State)",
    country: "États-Unis",
    countryCode: "US",
    flag: "🇺🇸",
    targetDegree: "Master / Graduate Studies (1 à 2 ans)",
    fundingType: "full_ride",
    monthlyStipend: "$1 500 à $2 400 / mois (selon l'État)",
    totalValueEst: "~$60 000 à $90 000 / an",
    benefits: [
      "Prise en charge intégrale des frais de scolarité universitaires (Tuition)",
      "Allocation de séjour mensuelle",
      "Billet d'avion international A/R",
      "Assurance maladie ASPE complète",
      "Financement des tests (TOEFL, GRE) et des frais de visa J-1"
    ],
    deadlineMonth: "Avril - Juillet (selon les ambassades)",
    nextDeadline: "2027-05-30",
    eligibility: {
      maxAge: "Pas de limite stricte (priorité aux jeunes diplômés et professionnels)",
      nationality: "Ressortissants du pays où la candidature est déposée",
      level: "Licence / Bachelor (Bac+3/4) avec excellent dossier",
      languageReq: "TOEFL iBT ≥ 80-100 ou IELTS ≥ 7.0"
    },
    fields: ["tech_ai", "engineering", "business", "law_intl", "environment", "health"],
    officialUrl: "https://foreign.fulbrightonline.org/",
    applicationPortal: "https://apply.iie.org",
    verifiedOrg: "Département d'État Américain",
    trustScore: 100,
    tags: ["fulbright", "usa", "etats-unis", "master", "ivy league", "full ride"]
  },

  // 🇨🇭 SUISSE (BOURSES D'EXCELLENCE DE LA CONFÉDÉRATION)
  {
    id: "bourse_excellence_suisse",
    title: "Bourses d'Excellence de la Confédération Suisse (SERI)",
    provider: "Secrétariat d'État à la formation, à la recherche et à l'innovation (Suisse)",
    country: "Suisse",
    countryCode: "CH",
    flag: "🇨🇭",
    targetDegree: "Master Recherche / Écoles Polytechnique Fédérale (EPFL, ETH Zürich)",
    fundingType: "full_ride",
    monthlyStipend: "1 920 CHF / mois",
    totalValueEst: "~35 000 CHF / an",
    benefits: [
      "Allocation mensuelle de 1 920 francs suisses",
      "Exonération des taxes universitaires",
      "Assurance maladie obligatoire suisse payée",
      "Indemnité forfaitaire de logement (300 CHF à l'arrivée)",
      "Abonnement demi-tarif aux transports publics suisses (CFF)"
    ],
    deadlineMonth: "Octobre - Décembre (selon pays)",
    nextDeadline: "2026-11-30",
    eligibility: {
      maxAge: "Né après le 31 décembre 1989",
      nationality: "180+ pays partenaires",
      level: "Bachelor délivré avant le début de la bourse avec mention Très Bien",
      languageReq: "Anglais, Français ou Allemand selon l'université hôte"
    },
    fields: ["tech_ai", "engineering", "health", "environment"],
    officialUrl: "https://www.sbfi.admin.ch/sbfi/fr/home/formation/bourses-et-prets/bourses-d-etudes-de-la-confederation-suisse.html",
    applicationPortal: "https://www.sbfi.admin.ch",
    verifiedOrg: "Gouvernement Suisse (SEFRI)",
    trustScore: 100,
    tags: ["suisse", "eth", "epfl", "zurich", "lausanne", "full ride", "excellence"]
  },

  // 🇯🇵 JAPON (MEXT)
  {
    id: "bourse_mext_japon",
    title: "Bourse Gouvernementale MEXT Japon (Research / Master)",
    provider: "Ministère de l'Éducation, de la Culture, des Sports, des Sciences et de la Technologie (MEXT)",
    country: "Japon",
    countryCode: "JP",
    flag: "🇯🇵",
    targetDegree: "Master / Graduate Student",
    fundingType: "full_ride",
    monthlyStipend: "144 000 JPY / mois (~950 € / mois)",
    totalValueEst: "~3 500 000 JPY / an",
    benefits: [
      "Frais d'examen d'entrée, d'inscription et de scolarité 100% gratuits",
      "Allocation mensuelle de 144 000 JPY",
      "Billet d'avion A/R direct vers le Japon",
      "6 mois de cours intensifs de langue japonaise inclus"
    ],
    deadlineMonth: "Mai - Juin (via Ambassade du Japon)",
    nextDeadline: "2027-05-20",
    eligibility: {
      maxAge: "Moins de 35 ans au 1er avril de l'année de départ",
      nationality: "Nationalité d'un pays ayant des relations diplomatiques avec le Japon",
      level: "Licence / Bachelor complété (16 ans de scolarité)",
      languageReq: "Motivation à apprendre le japonais ou maîtrise de l'anglais"
    },
    fields: ["tech_ai", "engineering", "health", "business", "environment"],
    officialUrl: "https://www.studyinjapan.go.jp/en/planning/scholarship/mext-scholarships/",
    applicationPortal: "https://www.studyinjapan.go.jp",
    verifiedOrg: "Ministère de l'Éducation du Japon (MEXT)",
    trustScore: 100,
    tags: ["mext", "japon", "japan", "tokyo", "master", "full ride", "robotique"]
  },

  // 🇰🇷 CORÉE DU SUD (GKS / GLOBAL KOREA SCHOLARSHIP)
  {
    id: "bourse_gks_coree",
    title: "Bourse du Gouvernement Coréen GKS (Global Korea Scholarship)",
    provider: "National Institute for International Education (NIIED Corée)",
    country: "Corée du Sud",
    countryCode: "KR",
    flag: "🇰🇷",
    targetDegree: "Master (2 ans de Master + 1 an de coréen optionnel)",
    fundingType: "full_ride",
    monthlyStipend: "1 000 000 KRW / mois + prime d'installation 200 000 KRW",
    totalValueEst: "~30 000 000 KRW / an",
    benefits: [
      "Frais de scolarité universitaires entièrement pris en charge",
      "Allocation de subsistance mensuelle",
      "Billets d'avion A/R internationaux",
      "Formation linguistique en coréen offerte pendant 1 an",
      "Assurance médicale nationale prise en charge"
    ],
    deadlineMonth: "Février - Mars (annuel)",
    nextDeadline: "2027-03-10",
    eligibility: {
      maxAge: "Moins de 40 ans",
      nationality: "Tous pays partenaires NIIED (hors citoyenneté coréenne)",
      level: "GPA supérieur à 80% ou classé dans le top 20% de sa promotion",
      languageReq: "TOPIK ou IELTS/TOEFL pour valoriser la candidature"
    },
    fields: ["tech_ai", "engineering", "business", "health", "environment"],
    officialUrl: "https://www.studyinkorea.go.kr/en/scholarship/gks_introduce.do",
    applicationPortal: "https://www.studyinkorea.go.kr",
    verifiedOrg: "NIIED Gouvernement de Corée",
    trustScore: 100,
    tags: ["gks", "kgsp", "coree", "seoul", "master", "full ride", "technologie"]
  },

  // 🇨🇦 CANADA (BOURSES VANIER & EXCELLENCE UNIVERSITAIRE)
  {
    id: "bourse_vanier_canada",
    title: "Bourses d'Excellence Master / Recherche Canada (CRSNG / IRSC)",
    provider: "Gouvernement du Canada (Organismes Subventionnaires)",
    country: "Canada",
    countryCode: "CA",
    flag: "🇨🇦",
    targetDegree: "Master Recherche / Maîtrise avec Mémoire",
    fundingType: "full_ride",
    monthlyStipend: "1 750 $ CAD / mois (jusqu'à 21 000 $ CAD / an)",
    totalValueEst: "~35 000 $ CAD / an",
    benefits: [
      "Financement substantiel pour la durée du Master de recherche",
      "Exonération partielle ou totale des droits de scolarité majorés",
      "Possibilité de travailler au Canada pendant et après les études (Permis Post-Diplôme)"
    ],
    deadlineMonth: "Octobre - Décembre (selon universités)",
    nextDeadline: "2026-12-01",
    eligibility: {
      maxAge: "Pas de limite d'âge",
      nationality: "Tous pays",
      level: "Moyenne académique de première classe (A- / 3.7+ GPA)",
      languageReq: "Français (Québec) ou Anglais (IELTS ≥ 7.0)"
    },
    fields: ["tech_ai", "engineering", "health", "environment"],
    officialUrl: "https://www.canada.ca/fr/services/prestations/education/bourses-etudiants.html",
    applicationPortal: "https://www.canada.ca",
    verifiedOrg: "Gouvernement du Canada",
    trustScore: 100,
    tags: ["canada", "quebec", "montreal", "toronto", "master", "recherche"]
  },

  // 🇧🇪 BELGIQUE (ARES)
  {
    id: "bourse_ares_belgique",
    title: "Bourses de Master et Stages Internationaux ARES",
    provider: "Académie de Recherche et d'Enseignement Supérieur (Fédération Wallonie-Bruxelles)",
    country: "Belgique",
    countryCode: "BE",
    flag: "🇧🇪",
    targetDegree: "Master de Spécialisation (1 an)",
    fundingType: "full_ride",
    monthlyStipend: "1 150 € / mois",
    totalValueEst: "~20 000 € / an",
    benefits: [
      "Frais de scolarité internationaux 100% pris en charge",
      "Allocation mensuelle de subsistance",
      "Billet d'avion A/R et frais de visa remboursés",
      "Assurance santé et rapatriement",
      "Frais d'arrivée et d'installation (forfait)"
    ],
    deadlineMonth: "Janvier (annuel)",
    nextDeadline: "2027-01-25",
    eligibility: {
      maxAge: "Moins de 40 ans (45 ans pour formations spécifiques)",
      nationality: "Ressortissants de 31 pays partenaires du Sud éligibles",
      level: "Diplôme de deuxième cycle (Master/Bac+5) ou Bac+3 avec 2 ans d'expérience",
      languageReq: "Français ou Anglais selon le master de spécialisation"
    },
    fields: ["tech_ai", "engineering", "health", "environment", "business"],
    officialUrl: "https://www.ares-ac.be/fr/cooperation-au-developpement/bourses/masteres-et-stages-en-belgique",
    applicationPortal: "https://www.ares-ac.be",
    verifiedOrg: "ARES Wallonie-Bruxelles",
    trustScore: 98,
    tags: ["ares", "belgique", "bruxelles", "master", "full ride", "developpement"]
  },

  // 🇹🇷 TURQUIE (TÜRKIYE BURSLARI)
  {
    id: "bourse_turkiye_burslari",
    title: "Bourses Türkiye Bursları du Gouvernement Turc (Master)",
    provider: "Présidence des Turcs de l'Étranger (YTB)",
    country: "Turquie",
    countryCode: "TR",
    flag: "🇹🇷",
    targetDegree: "Master (Enseigne en Anglais ou en Turc)",
    fundingType: "full_ride",
    monthlyStipend: "3 500 TRY / mois + Logement universitaire gratuit",
    totalValueEst: "~15 000 $ / an",
    benefits: [
      "Placement universitaire direct sans frais de scolarité",
      "Hébergement gratuit en résidence universitaire",
      "Allocation mensuelle",
      "Billet d'avion international aller-retour",
      "1 an de cours intensif de turc gratuit",
      "Assurance maladie publique complète"
    ],
    deadlineMonth: "Février (annuel)",
    nextDeadline: "2027-02-20",
    eligibility: {
      maxAge: "Moins de 30 ans pour le Master",
      nationality: "Tous les citoyens non-turcs",
      level: "Minimum 75% de moyenne générale en Licence",
      languageReq: "Anglais ou Turc selon la filière choisie"
    },
    fields: ["tech_ai", "engineering", "business", "law_intl", "health"],
    officialUrl: "https://www.turkiyeburslari.gov.tr/",
    applicationPortal: "https://tbbs.turkiyeburslari.gov.tr",
    verifiedOrg: "Gouvernement de Turquie (YTB)",
    trustScore: 100,
    tags: ["turquie", "turkiye burslari", "istanbul", "ankara", "master", "full ride"]
  }
];


// ─── HELPER FUNCTIONS POUR L'INTELLIGENCE DES BOURSES ────────────────────────

/**
 * Calcule l'urgence et le compte à rebours avant la date limite
 */
export function computeScholarshipDeadlineInfo(deadlineDateStr) {
  if (!deadlineDateStr) {
    return { daysLeft: null, status: "open", label: "Date non précisée", color: "#64748B", isUrgent: false };
  }

  const now = new Date();
  const deadline = new Date(deadlineDateStr);
  const diffTime = deadline.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      daysLeft,
      status: "closed",
      label: "Session close (Prochaine session en préparation)",
      color: "#94A3B8",
      badgeEmoji: "⏳",
      isUrgent: false,
    };
  }

  if (daysLeft <= 15) {
    return {
      daysLeft,
      status: "urgent",
      label: `🔥 J-${daysLeft} avant clôture !`,
      color: "#EF4444",
      badgeEmoji: "🚨",
      isUrgent: true,
    };
  }

  if (daysLeft <= 45) {
    return {
      daysLeft,
      status: "soon",
      label: `⚡ Clôture dans ${daysLeft} jours`,
      color: "#F59E0B",
      badgeEmoji: "⚠️",
      isUrgent: false,
    };
  }

  return {
    daysLeft,
    status: "open",
    label: `🟢 Ouvert (J-${daysLeft})`,
    color: "#10B981",
    badgeEmoji: "✅",
    isUrgent: false,
  };
}

/**
 * Filtre et recherche dans le catalogue de bourses
 */
export function filterScholarships(scholarships = MASTER_SCHOLARSHIPS_DATABASE, {
  country = "all",
  fundingType = "all",
  field = "all",
  status = "all",
  searchQuery = "",
} = {}) {
  const q = (searchQuery || "").toLowerCase().trim();

  return scholarships.filter((item) => {
    // Filtre Pays
    if (country !== "all" && item.countryCode !== country && item.country !== country) {
      return false;
    }

    // Filtre Financement
    if (fundingType !== "all" && item.fundingType !== fundingType) {
      return false;
    }

    // Filtre Domaine
    if (field !== "all" && !item.fields.includes(field)) {
      return false;
    }

    // Filtre Statut / Deadline
    const deadlineInfo = computeScholarshipDeadlineInfo(item.nextDeadline);
    if (status === "urgent" && !deadlineInfo.isUrgent && deadlineInfo.daysLeft > 30) return false;
    if (status === "open" && deadlineInfo.status === "closed") return false;

    // Recherche plein texte
    if (q) {
      const haystack = `${item.title} ${item.provider} ${item.country} ${item.targetDegree} ${item.monthlyStipend} ${item.tags.join(" ")} ${item.benefits.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

/**
 * Calcule les statistiques globales du catalogue
 */
export function getScholarshipStats(scholarships = MASTER_SCHOLARSHIPS_DATABASE) {
  let fullRideCount = 0;
  let closingSoonCount = 0;
  const countries = new Set();

  for (const s of scholarships) {
    if (s.fundingType === "full_ride") fullRideCount++;
    const info = computeScholarshipDeadlineInfo(s.nextDeadline);
    if (info.daysLeft !== null && info.daysLeft > 0 && info.daysLeft <= 45) closingSoonCount++;
    countries.add(s.country);
  }

  return {
    total: scholarships.length,
    fullRideCount,
    closingSoonCount,
    countriesCount: countries.size,
  };
}
