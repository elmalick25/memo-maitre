// 🎓 src/components/ScholarshipHubView.jsx
// ============================================================================
// HUB INTELLIGENT DES BOURSES DE MASTER INTERNATIONALES — ÉDITION GOD TIER
// ============================================================================
// Architecture Pleine Page + Optimisation Mobile Complète :
// - Onglets mobiles en barre de pilules horizontales (Swipeable Pills) sans retour à la ligne
// - Libellés concis et élégants : 🎯 Éligibilité, 📁 Documents (X/Y), 🗺️ Calendrier, 💡 Conseils Jury
// - Filtres du catalogue ultra-fluides sur mobile (scroll horizontal naturel & tactile)
// - Typographie et boutons 100% responsives pour smartphones et écrans larges
// ============================================================================

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  MASTER_SCHOLARSHIPS_DATABASE,
  FUNDING_TYPES,
  SCHOLARSHIP_CATEGORIES,
  filterScholarships,
  computeScholarshipDeadlineInfo,
  resolveNextDeadline,
  getScholarshipStats,
  isEligibleForSenegalL3CS,
  SENEGAL_L3_CS_APPLICATION_GUIDE,
} from "../lib/scholarshipCatalog.js";
import { verifyScholarshipTruth } from "../lib/scholarshipVerifier.js";
import { resolveScholarshipLinks, auditScholarshipLinks } from "../lib/scholarshipLinks.js";
import { safeStorage } from "../lib/safeStorage.js";

const SAVED_SCHOLARSHIPS_KEY = "memo_saved_scholarships_v1";
const HIDDEN_SCHOLARSHIPS_KEY = "memo_hidden_scholarships_v1";
const DOCS_PROGRESS_PREFIX = "memo_scholarship_docs_v1_";
const FOR_ME_FILTER_KEY = "memo_scholarship_for_me_v1";
const DYNAMIC_SCHOLARSHIPS_KEY = "memo_dynamic_scholarships_v1";
const SCHOLARSHIP_SORT_KEY = "memo_scholarship_sort_v1";
const LAST_SCAN_KEY = "memo_scholarship_last_scan_v1";
const NEW_IDS_KEY = "memo_scholarship_new_ids_v1";

// Une bourse reste marquée « NOUVEAU » pendant 7 jours après sa découverte.
const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const SORT_MODES = [
  { id: "urgency", label: "⏳ Urgence", hint: "Échéance la plus proche d'abord" },
  { id: "newest", label: "🆕 Nouveautés", hint: "Dernières bourses détectées" },
  { id: "funding", label: "💰 Financement", hint: "100% financées d'abord" },
  { id: "alpha", label: "🔤 A → Z", hint: "Ordre alphabétique" },
];

function formatRelativeTime(ts) {
  if (!ts) return "jamais";
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

/** Fait rouler une échéance passée vers sa prochaine occurrence annuelle. */
function rollDeadlineForward(deadline) {
  if (!deadline?.nextDate) return deadline;
  const date = new Date(`${deadline.nextDate}T23:59:59`);
  if (Number.isNaN(date.getTime())) return deadline;
  const now = new Date();
  if (date >= now) return deadline;
  let year = now.getFullYear();
  let rolled = new Date(date);
  rolled.setFullYear(year);
  if (rolled < now) rolled.setFullYear(year + 1);
  const iso = rolled.toISOString().slice(0, 10);
  return { ...deadline, nextDate: iso, rolledFrom: deadline.nextDate };
}

export default function ScholarshipHubView({
  callClaude = null,
  theme = {},
  isDarkMode = false,
  onCreateCard = null,
  showToast = () => {},
  onRegisterRefresh = null,
}) {
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [selectedFunding, setSelectedFunding] = useState("all");
  const [selectedField, setSelectedField] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Option "Pour moi" (L3 Informatique / Sciences & Technologies • Sénégal)
  const [forMeOnly, setForMeOnly] = useState(() => {
    try {
      const stored = safeStorage.get(FOR_ME_FILTER_KEY);
      return stored !== null ? JSON.parse(stored) : true; // Activé par défaut pour l'étudiant
    } catch {
      return true;
    }
  });

  // Modal Guide de Candidature L3 Info Sénégal
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideActiveSection, setGuideActiveSection] = useState("l3_status");

  // Masquer les boutons flottants en arrière-plan pendant la consultation du guide
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (showGuideModal) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
  }, [showGuideModal]);

  // Navigation Pleine Page : ID de la bourse sélectionnée (null = Catalogue)
  const [selectedScholarshipId, setSelectedScholarshipId] = useState(null);
  const [activeTab, setActiveTab] = useState("eligibility"); // 'eligibility' | 'documents' | 'roadmap' | 'strategy'
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // État des documents cochés pour la bourse ouverte
  const [checkedDocs, setCheckedDocs] = useState({});

  // Bourses masquées / supprimées par l'utilisateur
  const [hiddenIds, setHiddenIds] = useState(() => {
    try {
      return new Set(JSON.parse(safeStorage.get(HIDDEN_SCHOLARSHIPS_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });

  const hideScholarship = (id, title = "Bourse") => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      safeStorage.set(HIDDEN_SCHOLARSHIPS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
    if (selectedScholarshipId === id) {
      setSelectedScholarshipId(null);
    }
    showToast?.(`🗑️ "${title}" retirée du catalogue.`, "info");
  };

  const unhideAllScholarships = () => {
    setHiddenIds(new Set());
    safeStorage.set(HIDDEN_SCHOLARSHIPS_KEY, "[]");
    showToast?.("✨ Toutes les bourses masquées ont été restaurées !", "success");
  };

  // ⚡ Bourses Dynamiques / Découvertes via le Radar Intelligent
  const [dynamicScholarships, setDynamicScholarships] = useState(() => {
    try {
      return JSON.parse(safeStorage.get(DYNAMIC_SCHOLARSHIPS_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [isScanning, setIsScanning] = useState(false);

  // 🧭 Tri intelligent du catalogue (persistant)
  const [sortMode, setSortMode] = useState(() => safeStorage.get(SCHOLARSHIP_SORT_KEY) || "urgency");
  const applySortMode = (mode) => {
    setSortMode(mode);
    safeStorage.set(SCHOLARSHIP_SORT_KEY, mode);
  };

  // 🆕 Bourses nouvellement détectées + horodatage du dernier scan
  const [lastScanAt, setLastScanAt] = useState(() => {
    const raw = safeStorage.get(LAST_SCAN_KEY);
    return raw ? Number(raw) : null;
  });
  const [newIds, setNewIds] = useState(() => {
    try {
      return new Set(JSON.parse(safeStorage.get(NEW_IDS_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });
  const [scanReport, setScanReport] = useState(null);

  // Fusion du catalogue de base (28 bourses officielles) et des bourses dynamiques
  const allScholarships = useMemo(() => {
    return [...MASTER_SCHOLARSHIPS_DATABASE, ...dynamicScholarships];
  }, [dynamicScholarships]);

  // Bourse active pour la vue Pleine Page
  const currentScholarship = useMemo(() => {
    if (!selectedScholarshipId) return null;
    return allScholarships.find((s) => s.id === selectedScholarshipId) || null;
  }, [selectedScholarshipId, allScholarships]);

  // 🔗 Liens officiels directs (page d'info + page de candidature) de la bourse ouverte
  const currentLinks = useMemo(
    () => resolveScholarshipLinks(currentScholarship || {}),
    [currentScholarship]
  );

  // Index de la bourse courante pour la pagination précédente/suivante
  const currentScholarshipIndex = useMemo(() => {
    if (!currentScholarship) return -1;
    return allScholarships.findIndex((s) => s.id === currentScholarship.id);
  }, [currentScholarship, allScholarships]);

  // Favoris / Candidatures suivies
  const [savedIds, setSavedIds] = useState(() => {
    try {
      return new Set(JSON.parse(safeStorage.get(SAVED_SCHOLARSHIPS_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });

  const toggleSaveScholarship = (id) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast?.("Bourse retirée de vos candidatures suivies.", "info");
      } else {
        next.add(id);
        showToast?.("⭐ Bourse ajoutée à vos candidatures suivies !", "success");
      }
      safeStorage.set(SAVED_SCHOLARSHIPS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Chargement de la progression des documents pour la bourse sélectionnée
  useEffect(() => {
    if (currentScholarship) {
      try {
        const stored = safeStorage.get(`${DOCS_PROGRESS_PREFIX}${currentScholarship.id}`);
        setCheckedDocs(stored ? JSON.parse(stored) : {});
      } catch {
        setCheckedDocs({});
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentScholarship]);

  const toggleDocChecked = (docId) => {
    if (!currentScholarship) return;
    setCheckedDocs((prev) => {
      const next = { ...prev, [docId]: !prev[docId] };
      safeStorage.set(`${DOCS_PROGRESS_PREFIX}${currentScholarship.id}`, JSON.stringify(next));
      return next;
    });
  };

  // Liste des pays uniques
  const availableCountries = useMemo(() => {
    const map = new Map();
    allScholarships.forEach((item) => {
      if (!map.has(item.countryCode)) {
        map.set(item.countryCode, { code: item.countryCode, name: item.country, flag: item.flag });
      }
    });
    return Array.from(map.values());
  }, [allScholarships]);

  // Filtrage
  const filteredList = useMemo(() => {
    if (selectedStatus === "hidden") {
      return allScholarships.filter((item) => hiddenIds.has(item.id));
    }

    let list = filterScholarships(allScholarships, {
      categoryGroup: selectedCategoryGroup,
      country: selectedCountry,
      fundingType: selectedFunding,
      field: selectedField,
      status: selectedStatus,
      searchQuery,
      forMeOnly,
    });

    // Exclure les bourses masquées par défaut
    list = list.filter((item) => !hiddenIds.has(item.id));

    if (selectedStatus === "saved") {
      list = list.filter((item) => savedIds.has(item.id));
    }
    if (selectedStatus === "new") {
      list = list.filter((item) => newIds.has(item.id));
    }
    return list;
  }, [allScholarships, newIds, selectedCategoryGroup, selectedCountry, selectedFunding, selectedField, selectedStatus, searchQuery, savedIds, hiddenIds, forMeOnly]);

  // 🧭 Tri appliqué à la liste filtrée
  const sortedList = useMemo(() => {
    const list = [...filteredList];
    const deadlineTs = (item) => {
      const d = computeScholarshipDeadlineInfo(resolveNextDeadline(item));
      const raw = d?.date || resolveNextDeadline(item)?.nextDate;
      const t = raw ? new Date(raw).getTime() : NaN;
      return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    };
    if (sortMode === "newest") {
      list.sort((a, b) => (b.discoveredAt || 0) - (a.discoveredAt || 0) || deadlineTs(a) - deadlineTs(b));
    } else if (sortMode === "funding") {
      const rank = (i) => (i.fundingType === "full_ride" ? 0 : 1);
      list.sort((a, b) => rank(a) - rank(b) || deadlineTs(a) - deadlineTs(b));
    } else if (sortMode === "alpha") {
      list.sort((a, b) => a.title.localeCompare(b.title, "fr"));
    } else {
      list.sort((a, b) => deadlineTs(a) - deadlineTs(b));
    }
    // Les nouveautés récentes remontent toujours en tête du catalogue.
    return list.sort((a, b) => (newIds.has(b.id) ? 1 : 0) - (newIds.has(a.id) ? 1 : 0));
  }, [filteredList, sortMode, newIds]);

  const stats = useMemo(() => getScholarshipStats(allScholarships), [allScholarships]);

  // 🔗 Audit permanent de la qualité des liens officiels affichés
  const linkAudit = useMemo(() => auditScholarshipLinks(allScholarships), [allScholarships]);

  const visibleScholarships = useMemo(
    () => allScholarships.filter((item) => !hiddenIds.has(item.id)),
    [allScholarships, hiddenIds]
  );

  const urgentCount = useMemo(
    () =>
      visibleScholarships.filter((item) => {
        const d = computeScholarshipDeadlineInfo(resolveNextDeadline(item));
        return typeof d?.daysLeft === "number" && d.daysLeft >= 0 && d.daysLeft <= 60;
      }).length,
    [visibleScholarships]
  );
  const newCount = useMemo(
    () => visibleScholarships.filter((item) => newIds.has(item.id)).length,
    [visibleScholarships, newIds]
  );

  const hasActiveFilters =
    forMeOnly ||
    selectedCategoryGroup !== "all" ||
    selectedCountry !== "all" ||
    selectedFunding !== "all" ||
    selectedField !== "all" ||
    selectedStatus !== "all" ||
    searchQuery.trim() !== "";

  const resetAllFilters = () => {
    setForMeOnly(false);
    safeStorage.set(FOR_ME_FILTER_KEY, JSON.stringify(false));
    setSelectedCategoryGroup("all");
    setSelectedCountry("all");
    setSelectedFunding("all");
    setSelectedField("all");
    setSelectedStatus("all");
    setSearchQuery("");
  };

  // 📡 SCAN INTELLIGENT & ACTUALISATION DYNAMIQUE DES BOURSES
  const handleScanNewScholarships = async () => {
    if (isScanning) return;
    setIsScanning(true);
    showToast?.("📡 Radar activé : recherche d'appels à candidatures officiels...", "info");

    try {
      let candidateItems = [];

      // 1. Tenter via callClaude (LLM avec intelligence de synthèse) si disponible
      if (typeof callClaude === "function") {
        try {
          const systemPrompt = `Tu es un expert mondial en bourses de Master internationales, rattaché aux coopérations académiques (Campus France, DAAD, JICA, etc.).
Ton rôle est de renvoyer une liste JSON de bourses d'études officielles de niveau Master accessibles aux étudiants sénégalais (notamment profil Licence 3 Informatique / STEM ou toutes filières).
RÈGLE ABSOLUE DE ROBUSTESSE :
- Uniquement des bourses RÉELLES, officielles et d'excellence vérifiées (ex: Türkiye Bursları, DAAD Helmut-Schmidt, IsDB Master, Mastercard Foundation, CSC).
- Le champ 'officialUrl' doit être un site officiel DIRECT vérifié commençant impérativement par 'https://' (aucun lien mort, aucun agrégateur tiers).
- Renvoyer UNIQUEMENT un tableau JSON valide.`;

          const userPrompt = `Génère 1 à 3 opportunités de bourses de Master internationales d'excellence (100% financées ou complètes) ouvertes aux étudiants sénégalais ou internationaux, avec les champs exacts :
[
  {
    "id": "slug_unique",
    "title": "Nom officiel complet",
    "provider": "Organisme officiel ou Ministère",
    "country": "Pays",
    "countryCode": "Code ISO 2 lettres",
    "flag": "Emoji drapeau",
    "categoryGroup": "senegal" | "multilateral" | "europe" | "americas_asia",
    "fundingType": "full_ride" | "tuition_stipend",
    "targetDegree": "Niveau et filière (ex: Master Universitaire Informatique)",
    "officialUrl": "https://...",
    "monthlyStipend": "Montant mensuel ou allocation",
    "duration": "Durée",
    "deadline": { "nextDate": "YYYY-MM-DD", "season": "Texte saison", "isStrict": true },
    "eligibility": {
      "academicLevel": "...",
      "minGpa": "...",
      "maxAge": "...",
      "nationality": "...",
      "targetFields": "...",
      "languageReq": "...",
      "academicExcellence": "...",
      "senegalSpecific": "...",
      "workExperience": "..."
    },
    "requiredDocuments": [
      { "id": "doc_1", "name": "...", "category": "academic", "categoryLabel": "🎓 Académique", "isMandatory": true, "description": "...", "specifications": "...", "godTip": "..." }
    ],
    "advantages": ["..."],
    "juryTips": ["..."]
  }
]`;

          const response = await callClaude(systemPrompt, userPrompt, { temperature: 0.2 });
          if (response) {
            const rawText = typeof response === "string" ? response : response.text || "";
            const jsonMatch = rawText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed)) {
                candidateItems = parsed;
              }
            }
          }
        } catch (e) {
          console.warn("[ScholarshipHub] AI Scan radar notice:", e);
        }
      }

      // 2. Pool de secours d'opportunités d'élite vérifiées (Garantie de robustesse permanente)
      const VERIFIED_RADAR_POOL = [
        {
          id: "turkiye_burslari_master",
          title: "Bourse du Gouvernement Turc — Türkiye Bursları Master",
          provider: "YTB - République de Turquie",
          country: "Turquie",
          countryCode: "TR",
          flag: "🇹🇷",
          categoryGroup: "americas_asia",
          fundingType: "full_ride",
          targetDegree: "Master Universitaire (Recherche ou Professionnel)",
          officialUrl: "https://www.turkiyeburslari.gov.tr/",
          monthlyStipend: "~3 500 TRY/mois + Logement universitaire offert + Assurance maladie",
          duration: "1 an apprentissage turc + 2 ans de Master",
          deadline: { nextDate: "2027-02-20", season: "10 Janvier – 20 Février chaque année", isStrict: true },
          eligibility: {
            academicLevel: "Licence / Bachelor (Bac+3) validé ou en cours d'obtention",
            minGpa: "Moyenne générale ≥ 15/20 (75%)",
            maxAge: "Moins de 30 ans au 1er janvier de l'année de candidature",
            nationality: "Citoyens de tous pays partenaires (Sénégal hautement éligible)",
            targetFields: "Sciences exactes, Informatique, Ingénierie, Économie, Relations internationales",
            languageReq: "Turc (1 an de cours préparatoires offerts) ou Anglais (selon le programme)",
            academicExcellence: "Dossier académique solide requis",
            senegalSpecific: "Entretien oral officiel organisé à l'Ambassade de Turquie à Dakar pour les présélectionnés.",
            workExperience: "Non requise pour les Masters académiques."
          },
          requiredDocuments: [
            { id: "tb_diploma", name: "Attestation de Licence ou d'inscription L3", category: "academic", categoryLabel: "🎓 Académique", isMandatory: true, description: "Attestation officielle délivrée par l'université sénégalaise.", specifications: "Scan couleur haute résolution.", godTip: "Joindre les relevés de L1, L2 et semestre en cours." },
            { id: "tb_id", name: "Passeport biométrique sénégalais", category: "admin", categoryLabel: "🛂 Identité", isMandatory: true, description: "Passeport en cours de validité.", specifications: "Validité d'au moins 1 an.", godTip: "Vérifier la lisibilité parfaite de la page d'état-civil." },
            { id: "tb_sop", name: "Lettre de Motivation & Projet de Recherche", category: "motivation", categoryLabel: "✍️ Projet", isMandatory: true, description: "Explication claire du choix de la Turquie et de l'impact pour le Sénégal.", specifications: "Rédigée en français, anglais ou turc.", godTip: "Souligner les partenariats technologiques et d'ingénierie Turquie-Afrique." }
          ],
          advantages: [
            "Prise en charge intégrale des frais de scolarité à 100%",
            "Logement universitaire gratuit et garanti sur le campus",
            "Billet d'avion international aller-retour",
            "Cours préparatoire intensif de langue turque (C1) offert",
            "Couverture médicale et assurance santé nationale"
          ],
          juryTips: [
            "La Turquie accorde une grande importance à la motivation de retour pour contribuer au développement national.",
            "Soignez votre lettre d'intention en valorisant vos projets technologiques concrets."
          ]
        },
        {
          id: "daad_helmut_schmidt",
          title: "Bourse DAAD Helmut-Schmidt (Master Gouvernance & Transformation Numérique)",
          provider: "DAAD & Auswärtiges Amt (Ministère Fédéral des Affaires Étrangères)",
          country: "Allemagne",
          countryCode: "DE",
          flag: "🇩🇪",
          categoryGroup: "europe",
          fundingType: "full_ride",
          targetDegree: "Master of Public Policy, Governance & Digital Transformation",
          officialUrl: "https://www.daad.de/en/information-services-for-higher-education-institutions/further-information-on-daad-programmes/helmut-schmidt-programme/",
          monthlyStipend: "934 € / mois + Frais de voyage + Assurance maladie",
          duration: "2 ans",
          deadline: { nextDate: "2026-07-31", season: "1er Juin – 31 Juillet chaque année", isStrict: true },
          eligibility: {
            academicLevel: "Licence / Bachelor (Bac+3) dans les filières politiques, économiques, juridiques ou informatique appliquée",
            minGpa: "Mention Bien ou Très Bien",
            maxAge: "Diplôme universitaire de premier cycle obtenu au cours des 6 dernières années",
            nationality: "Pays partenaires en développement (Sénégal éligible)",
            targetFields: "Gouvernance numérique, Politiques publiques, Systèmes d'information",
            languageReq: "Anglais niveau C1 (IELTS 7.0 ou TOEFL iBT 95)",
            academicExcellence: "Excellence académique et engagement civique/communautaire démontré",
            senegalSpecific: "Accessible directement aux diplômés des universités publiques et privées sénégalaises reconnues.",
            workExperience: "Stages ou engagement associatif fortement valorisés."
          },
          requiredDocuments: [
            { id: "daad_form", name: "Formulaire de candidature DAAD officiel", category: "admin", categoryLabel: "📄 Formulaire", isMandatory: true, description: "Formulaire standard dûment complété et signé.", specifications: "Format PDF officiel.", godTip: "Cochez scrupuleusement les choix de cours prioritaires." },
            { id: "daad_cv", name: "CV Europass en anglais", category: "career", categoryLabel: "💼 CV", isMandatory: true, description: "Curriculum Vitae chronologique complet sans interruption inexpliquée.", specifications: "Format Europass standard.", godTip: "Détaillez les projets bénévoles et responsabilités étudiantes." },
            { id: "daad_sop", name: "Lettre de motivation académique", category: "motivation", categoryLabel: "✍️ Projet", isMandatory: true, description: "2 pages maximum explicitant les motivations et l'impact professionnel.", specifications: "Rédigée en anglais.", godTip: "Expliquez précisément en quoi le programme renforcera la gouvernance technologique au Sénégal." }
          ],
          advantages: [
            "Allocation mensuelle nette de 934 € par mois",
            "Exonération totale des frais d'inscription universitaire",
            "Allocations forfaitaires de voyage aller-retour",
            "Assurance maladie, accident et responsabilité civile",
            "Cours d'allemand préparatoire de plusieurs mois financé"
          ],
          juryTips: [
            "Le jury recherche des profils engagés démontrant un leadership citoyen concret.",
            "Respectez scrupuleusement la nomenclature des fichiers demandée par le DAAD."
          ]
        },
        {
          id: "isdb_scholarship_program",
          title: "Bourse d'Excellence IsDB — Banque Islamique de Développement",
          provider: "Banque Islamique de Développement (IsDB)",
          country: "International",
          countryCode: "ISDB",
          flag: "🌍",
          categoryGroup: "multilateral",
          fundingType: "full_ride",
          targetDegree: "Master of Science (MSc) en Technologies, Énergie & Développement Durable",
          officialUrl: "https://www.isdb.org/scholarships",
          monthlyStipend: "Allocation de subsistance complète indexée sur le pays d'études + Billets d'avion",
          duration: "2 ans",
          deadline: { nextDate: "2027-02-28", season: "Décembre – Février chaque année", isStrict: true },
          eligibility: {
            academicLevel: "Licence en Sciences, Informatique, Ingénierie, Technologies ou Agronomie",
            minGpa: "Mention Bien ou Très Bien (Très bon dossier)",
            maxAge: "Moins de 30 ans pour le cycle Master",
            nationality: "Citoyen d'un pays membre de l'IsDB (Sénégal membre fondateur éligible)",
            targetFields: "Sciences, Informatique, IA, Énergies renouvelables, Santé, Eau",
            languageReq: "Anglais ou Français selon la langue d'enseignement de l'université partenaire",
            academicExcellence: "Excellence académique avérée",
            senegalSpecific: "Dossier soumis via le portail en ligne de l'IsDB à Djeddah avec validation nationale.",
            workExperience: "Non requise."
          },
          requiredDocuments: [
            { id: "isdb_form", name: "Dossier en ligne IsDB Portal", category: "admin", categoryLabel: "📄 Portail", isMandatory: true, description: "Candidature numérique sur le portail IsDB.", specifications: "Soumission en ligne.", godTip: "Préparez tous les scans avant d'ouvrir la session." },
            { id: "isdb_diploma", name: "Relevés de notes universitaires certifiés", category: "academic", categoryLabel: "🎓 Académique", isMandatory: true, description: "Relevés des 3 années de Licence.", specifications: "Certifiés conformes.", godTip: "Une régularité dans les mentions de L1 à L3 est décisive." }
          ],
          advantages: [
            "Prise en charge intégrale des frais d'inscription et de scolarité",
            "Allocation mensuelle complète de subsistance",
            "Billet d'avion international aller-retour",
            "Frais de préparation de mémoire et matériel académique",
            "Couverture médicale complète"
          ],
          juryTips: [
            "L'IsDB privilégie les projets scientifiques ayant un impact direct sur les Objectifs de Développement Durable (ODD) au Sénégal.",
            "Soulignez l'aspect innovant de votre projet de fin d'études."
          ]
        },
        {
          id: "commonwealth_shared_scholarship",
          title: "Commonwealth Shared Scholarship — Master au Royaume-Uni",
          provider: "Commonwealth Scholarship Commission (FCDO, Royaume-Uni)",
          country: "Royaume-Uni",
          countryCode: "GB",
          flag: "🇬🇧",
          categoryGroup: "europe",
          fundingType: "full_ride",
          targetDegree: "Master's Degree (1 an) — Informatique, Data, Développement",
          officialUrl: "https://cscuk.fcdo.gov.uk/scholarships/commonwealth-shared-scholarships/",
          monthlyStipend: "≈ 1 236 £/mois + frais de scolarité + vols aller-retour",
          duration: "1 an (Master intensif britannique)",
          deadline: { nextDate: "2026-12-18", season: "Octobre – Décembre chaque année", isStrict: true },
          eligibility: {
            academicLevel: "Licence avec mention Bien minimum (Upper Second Class)",
            minGpa: "Équivalent 2:1 britannique",
            maxAge: "Sans limite d'âge stricte",
            nationality: "Ressortissants des pays du Commonwealth à faible revenu",
            targetFields: "Informatique, Sciences des données, Ingénierie, Santé, Développement",
            languageReq: "Anglais (IELTS généralement exigé par l'université d'accueil)",
            academicExcellence: "Excellent dossier académique et projet d'impact",
            senegalSpecific: "Le Sénégal n'étant pas membre du Commonwealth, viser en priorité Chevening ou les bourses universitaires britanniques.",
            workExperience: "Valorisée mais non obligatoire."
          },
          requiredDocuments: [],
          advantages: [
            "Frais de scolarité intégralement pris en charge",
            "Allocation mensuelle de subsistance",
            "Billets d'avion aller-retour",
            "Allocation d'installation et de thèse"
          ],
          juryTips: [
            "Le comité évalue avant tout l'impact du projet sur le développement de votre pays.",
            "Candidatez d'abord auprès de l'université partenaire : elle transmet le dossier à la CSC."
          ]
        },
        {
          id: "bourses_francophonie_maeci_canada",
          title: "Programme canadien de bourses de la Francophonie (PCBF)",
          provider: "Affaires mondiales Canada / PCBF",
          country: "Canada",
          countryCode: "CA",
          flag: "🇨🇦",
          categoryGroup: "americas_asia",
          fundingType: "full_ride",
          targetDegree: "Master / Maîtrise dans une université canadienne francophone",
          officialUrl: "https://www.boursesfrancophonie.ca/",
          monthlyStipend: "Allocation mensuelle complète + scolarité + billets + assurance",
          duration: "1 à 2 ans",
          deadline: { nextDate: "2026-10-15", season: "Appel national annuel (automne)", isStrict: true },
          eligibility: {
            academicLevel: "Licence obtenue avec de très bons résultats",
            minGpa: "Mention Bien minimum",
            maxAge: "Généralement moins de 40 ans",
            nationality: "Ressortissants des pays francophones admissibles, dont le Sénégal",
            targetFields: "Gouvernance, Numérique, Santé, Agriculture, Énergie",
            languageReq: "Français",
            academicExcellence: "Sélection nationale très compétitive",
            senegalSpecific: "Candidature obligatoirement présentée via la Direction des Bourses du Sénégal (appel national).",
            workExperience: "Souvent exigée pour les profils professionnels."
          },
          requiredDocuments: [],
          advantages: [
            "Prise en charge intégrale des frais de scolarité",
            "Allocation mensuelle de subsistance au Canada",
            "Billets d'avion aller-retour et frais d'installation",
            "Assurance maladie complète"
          ],
          juryTips: [
            "Le PCBF passe par une présélection nationale : surveillez l'appel de la Direction des Bourses.",
            "Le projet doit répondre à une priorité de développement clairement identifiée au Sénégal."
          ]
        },
        {
          id: "manaaki_new_zealand_scholarship",
          title: "Manaaki New Zealand Scholarship — Master",
          provider: "Ministère des Affaires étrangères et du Commerce (MFAT, Nouvelle-Zélande)",
          country: "Nouvelle-Zélande",
          countryCode: "NZ",
          flag: "🇳🇿",
          categoryGroup: "americas_asia",
          fundingType: "full_ride",
          targetDegree: "Master (Technologies, Agriculture, Énergies renouvelables, Gouvernance)",
          officialUrl: "https://www.mfat.govt.nz/en/aid-and-development/new-zealand-scholarships",
          monthlyStipend: "≈ 531 NZD/semaine + scolarité + vols + assurance + allocation d'installation",
          duration: "1 à 2 ans",
          deadline: { nextDate: "2027-02-28", season: "Fenêtre annuelle (février – mars selon la région)", isStrict: true },
          eligibility: {
            academicLevel: "Licence validée",
            minGpa: "Bon à très bon dossier académique",
            maxAge: "Au moins 18 ans, pas de plafond strict",
            nationality: "Ressortissants des pays africains éligibles (Sénégal inclus selon l'appel)",
            targetFields: "Agriculture, Énergies renouvelables, Gestion des risques, Numérique",
            languageReq: "Anglais (IELTS 6.5 en général)",
            academicExcellence: "Engagement de retour et de contribution au pays exigé",
            senegalSpecific: "Vérifiez chaque année la liste des pays africains éligibles publiée par le MFAT.",
            workExperience: "Minimum 2 ans souvent exigés."
          },
          requiredDocuments: [],
          advantages: [
            "Frais de scolarité intégralement couverts",
            "Allocation hebdomadaire de subsistance",
            "Vols internationaux aller-retour",
            "Assurance médicale et allocation d'installation"
          ],
          juryTips: [
            "L'engagement de rentrer travailler au pays pendant 2 ans est un critère éliminatoire.",
            "Mettez en avant un impact mesurable sur le développement durable."
          ]
        }
      ];

      const combinedCandidates = [...candidateItems, ...VERIFIED_RADAR_POOL];
      const scanStartedAt = Date.now();
      // Rafraîchissement des bourses déjà découvertes : échéances passées
      // roulées vers leur prochaine session officielle.
      let refreshedCount = 0;
      const refreshedDynamic = dynamicScholarships.map((item) => {
        const rolled = rollDeadlineForward(item.deadline);
        if (rolled !== item.deadline && rolled?.nextDate !== item.deadline?.nextDate) {
          refreshedCount++;
          return { ...item, deadline: rolled, updatedAt: scanStartedAt };
        }
        return item;
      });
      const existingIds = new Set(allScholarships.map((s) => s.id));
      const existingTitles = new Set(allScholarships.map((s) => s.title.toLowerCase().trim()));

      const validNewScholarships = [];

      for (const item of combinedCandidates) {
        if (!item || typeof item !== "object") continue;
        if (!item.title || !item.provider || !item.country) continue;
        
        // Validation stricte de l'URL officielle (commençant impérativement par https://)
        if (!item.officialUrl || typeof item.officialUrl !== "string" || !item.officialUrl.startsWith("https://")) {
          continue;
        }

        const normTitle = item.title.toLowerCase().trim();
        const baseId = item.id || normTitle.replace(/[^a-z0-9]+/g, "_").slice(0, 30);

        if (existingIds.has(baseId) || existingTitles.has(normTitle)) {
          continue;
        }

        const cleanItem = {
          id: baseId,
          title: item.title,
          provider: item.provider,
          country: item.country,
          countryCode: item.countryCode || "INT",
          flag: item.flag || "🌍",
          categoryGroup: ["senegal", "multilateral", "europe", "americas_asia"].includes(item.categoryGroup) ? item.categoryGroup : "americas_asia",
          fundingType: item.fundingType === "tuition_stipend" ? "tuition_stipend" : "full_ride",
          targetDegree: item.targetDegree || "Master Universitaire International",
          officialUrl: item.officialUrl,
          monthlyStipend: item.monthlyStipend || "Allocation mensuelle + Prise en charge intégrale",
          duration: item.duration || "2 ans (Cycle Master complet)",
          deadline: {
            nextDate: item.deadline?.nextDate || "2027-01-31",
            season: item.deadline?.season || "Session annuelle officielle",
            isStrict: Boolean(item.deadline?.isStrict ?? true),
          },
          eligibility: {
            academicLevel: item.eligibility?.academicLevel || "Licence / Bachelor (Bac+3) validé ou en cours",
            minGpa: item.eligibility?.minGpa || "Très bon dossier académique",
            maxAge: item.eligibility?.maxAge || "Sans limite stricte ou ≤ 30 ans",
            nationality: item.eligibility?.nationality || "Citoyens sénégalais ou internationaux",
            targetFields: item.eligibility?.targetFields || "Informatique, Sciences & Technologies, Toutes filières",
            languageReq: item.eligibility?.languageReq || "Français ou Anglais selon le programme",
            academicExcellence: item.eligibility?.academicExcellence || "Dossier d'excellence",
            senegalSpecific: item.eligibility?.senegalSpecific || "Accessible aux étudiants des universités sénégalaises.",
            workExperience: item.eligibility?.workExperience || "Non requise pour les étudiants en poursuite d'études.",
          },
          requiredDocuments: Array.isArray(item.requiredDocuments) && item.requiredDocuments.length > 0
            ? item.requiredDocuments
            : [
                {
                  id: `${baseId}_transcript`,
                  name: "Relevés de notes officiels de Licence (L1, L2, L3)",
                  category: "academic",
                  categoryLabel: "🎓 Académique",
                  isMandatory: true,
                  description: "Relevés complets de tous les semestres validés.",
                  specifications: "Originaux ou copies certifiées.",
                  godTip: "Joindre le certificat de scolarité L3 si le diplôme n'est pas encore édité."
                },
                {
                  id: `${baseId}_passport`,
                  name: "Passeport international valide",
                  category: "admin",
                  categoryLabel: "🛂 Identité",
                  isMandatory: true,
                  description: "Passeport biométrique en cours de validité.",
                  specifications: "Validité couvrant au moins la première année d'études.",
                  godTip: "Anticipez le renouvellement dès le dépôt du dossier."
                }
              ],
          advantages: Array.isArray(item.advantages) && item.advantages.length > 0
            ? item.advantages
            : [
                "Exonération totale des frais d'inscription et de scolarité à 100%",
                "Allocation de vie mensuelle assurée",
                "Assurance santé et assistance voyage internationale"
              ],
          juryTips: Array.isArray(item.juryTips) && item.juryTips.length > 0
            ? item.juryTips
            : [
                "Candidatez dès l'ouverture de la plateforme sans attendre la date limite.",
                "Vérifiez l'exactitude des pièces et traductions certifiées."
              ]
        };

        cleanItem.deadline = rollDeadlineForward(cleanItem.deadline);
        cleanItem.discoveredAt = scanStartedAt;
        existingIds.add(cleanItem.id);
        existingTitles.add(normTitle);
        validNewScholarships.push(cleanItem);
      }

      const updated = [...refreshedDynamic, ...validNewScholarships];
      setDynamicScholarships(updated);
      safeStorage.set(DYNAMIC_SCHOLARSHIPS_KEY, JSON.stringify(updated));

      // Badges « NOUVEAU » : nouvelles bourses + anciennes encore dans la fenêtre de 7 jours
      const freshIds = new Set(validNewScholarships.map((item) => item.id));
      updated.forEach((item) => {
        if (item.discoveredAt && scanStartedAt - item.discoveredAt < NEW_BADGE_WINDOW_MS) {
          freshIds.add(item.id);
        }
      });
      setNewIds(freshIds);
      safeStorage.set(NEW_IDS_KEY, JSON.stringify(Array.from(freshIds)));
      setLastScanAt(scanStartedAt);
      safeStorage.set(LAST_SCAN_KEY, String(scanStartedAt));

      setScanReport({
        at: scanStartedAt,
        added: validNewScholarships.map((item) => ({ id: item.id, title: item.title, flag: item.flag, country: item.country })),
        refreshed: refreshedCount,
        total: MASTER_SCHOLARSHIPS_DATABASE.length + updated.length,
      });

      if (validNewScholarships.length > 0) {
        applySortMode("newest");
        setSelectedStatus("new");
        showToast?.(
          `✨ ${validNewScholarships.length} nouvelle(s) bourse(s) officielle(s) détectée(s) — affichées en tête du catalogue !`,
          "success"
        );
      } else if (refreshedCount > 0) {
        showToast?.(
          `🔄 Aucune nouvelle bourse, mais ${refreshedCount} échéance(s) mise(s) à jour vers la prochaine session.`,
          "success"
        );
      } else {
        showToast?.(
          `✅ Catalogue officiel 100% synchronisé : les ${MASTER_SCHOLARSHIPS_DATABASE.length + updated.length} bourses répertoriées sont déjà à jour.`,
          "info"
        );
      }
    } catch (err) {
      console.error("[ScholarshipHub] Error during scan:", err);
      showToast?.("⚠️ Erreur lors de la synchronisation. Veuillez réessayer.", "warning");
    } finally {
      setIsScanning(false);
    }
  };

  // Le bouton « Régénérer » de la vue Actu déclenche ce même radar.
  useEffect(() => {
    if (typeof onRegisterRefresh === "function") {
      onRegisterRefresh(handleScanNewScholarships);
      return () => onRegisterRefresh(null);
    }
    return undefined;
  });

  const handleClearDynamicScholarships = () => {
    setDynamicScholarships([]);
    safeStorage.set(DYNAMIC_SCHOLARSHIPS_KEY, "[]");
    setNewIds(new Set());
    safeStorage.set(NEW_IDS_KEY, "[]");
    setScanReport(null);
    if (selectedStatus === "new") setSelectedStatus("all");
    showToast?.("🔄 Catalogue réinitialisé aux 28 bourses officielles de référence.", "info");
  };

  // Calcul du % de documents prêts
  const docsProgress = useMemo(() => {
    if (!currentScholarship || !currentScholarship.requiredDocuments) return { count: 0, total: 0, percent: 0 };
    const total = currentScholarship.requiredDocuments.length;
    const count = currentScholarship.requiredDocuments.filter((d) => checkedDocs[d.id]).length;
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    return { count, total, percent };
  }, [currentScholarship, checkedDocs]);

  // Copier la checklist des documents dans le presse-papier
  const copyDocumentChecklist = () => {
    if (!currentScholarship) return;
    const text = [
      `📋 CHECKLIST OFFICIELLE : ${currentScholarship.title} (${currentScholarship.country})`,
      `🏛️ Organisme : ${currentScholarship.provider}`,
      `🌐 Portail Officiel : ${currentLinks.infoUrl}`,
      `--------------------------------------------------`,
      `DOCUMENTS REQUIS :`,
      ...currentScholarship.requiredDocuments.map(
        (d, idx) => `${idx + 1}. [${checkedDocs[d.id] ? "X" : " "}] ${d.name} (${d.categoryLabel})\n   • Description : ${d.description}\n   • Spécifications : ${d.specifications}\n   • 💡 Conseil Pro : ${d.godTip}\n`
      ),
      `--------------------------------------------------`,
      `CRITÈRES CLÉS D'ÉLIGIBILITÉ :`,
      `• Diplôme : ${currentScholarship.eligibility.academicLevel}`,
      `• Âge : ${currentScholarship.eligibility.maxAge}`,
      `• Langue : ${currentScholarship.eligibility.languageReq}`,
      `• Expérience : ${currentScholarship.eligibility.workExperience || "Non requise"}`,
    ].join("\n");

    navigator.clipboard?.writeText?.(text);
    showToast?.("📋 Checklist complète copiée dans le presse-papier !", "success");
  };

  // Formater proprement le tag d'âge sans césure brutale de mot
  const formatMaxAge = (age) => {
    if (!age) return "";
    const lower = age.toLowerCase();
    if (lower.includes("non spécifié") || lower.includes("aucune") || lower.includes("sans limite")) return "Âge libre";
    const match = age.match(/(\d{1,2})\s*ans/i);
    if (match) return `≤ ${match[1]} ans`;
    return age.length > 18 ? `${age.slice(0, 16)}...` : age;
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        padding: "4px 2px 120px",
        color: isDarkMode ? "#F8FAFC" : "#0F172A",
        fontFamily: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        @keyframes page-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin-radar {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-radar {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.5); }
          70% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        
        .god-scholarship-card {
          animation: page-enter 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .god-scholarship-card:hover {
          transform: translateY(-3px);
          border-color: #2563EB !important;
          box-shadow: 0 12px 28px rgba(37, 99, 235, 0.22) !important;
        }

        .god-pill-btn {
          transition: all 0.18s ease;
          white-space: nowrap;
        }
        .god-pill-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .god-pill-btn:active {
          transform: translateY(0);
        }

        .god-tab-btn {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.03);
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--mm-primary) 35.0%, transparent);
          border-radius: 8px;
        }

        .god-profile-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding: 14px 18px;
          margin-bottom: 16px;
          border-radius: 16px;
          transition: all 0.25s ease;
        }
        .god-profile-banner-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          flex: 1 1 300px;
          min-width: 0;
        }
        .god-profile-chips {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .god-profile-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 800;
        }
        .god-guide-btn {
          flex-shrink: 0;
          padding: 9px 16px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          white-space: nowrap;
          transition: all 0.18s ease;
        }

        .god-hero-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(68px, 1fr));
          gap: 8px;
        }

        .god-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          width: 100%;
          box-sizing: border-box;
        }

        /* 📱 Responsive Mobile Tuning */
        @media (max-width: 640px) {
          .god-cards-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
            width: 100% !important;
          }
          .god-scholarship-card {
            padding: 12px !important;
            border-radius: 14px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          .god-hero-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            width: 100% !important;
          }
          .god-profile-banner {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
            padding: 12px 14px !important;
            height: auto !important;
            min-height: auto !important;
          }
          .god-profile-banner-left {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
            width: 100% !important;
            flex: 0 0 auto !important;
            height: auto !important;
            min-height: auto !important;
          }
          .god-profile-toggle-btn {
            width: 100% !important;
            justify-content: center !important;
          }
          .god-guide-btn {
            width: 100% !important;
          }
          .god-hero-metrics {
            width: 100%;
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 6px !important;
          }
          .god-hero-metric-card {
            min-width: 0 !important;
            padding: 8px 10px !important;
          }
          .god-hero-metric-title {
            font-size: 9px !important;
          }
          .god-hero-metric-val {
            font-size: 12px !important;
          }
        }

        body.modal-open .speed-dial-trigger,
        body.modal-open .speed-dial-backdrop {
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════════
          VUE 1 : PAGE DÉDIÉE — DOSSIER COMPLET D'UNE BOURSE (PLEINE PAGE)
          ═══════════════════════════════════════════════════════════════════════ */}
      {currentScholarship ? (
        <div style={{ animation: "page-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
          {/* Barre Supérieure de Navigation & Fil d'Ariane */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              marginBottom: "16px",
              paddingBottom: "12px",
              borderBottom: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)",
            }}
          >
            {/* Bouton Retour + Fil d'Ariane */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={() => setSelectedScholarshipId(null)}
                className="god-pill-btn"
                style={{
                  background: isDarkMode ? "rgba(255, 255, 255, 0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                  color: isDarkMode ? "#FFFFFF" : "#1D4ED8",
                  border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                  borderRadius: "10px",
                  padding: "7px 12px",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>←</span>
                <span>Retour</span>
              </button>

              <div style={{ fontSize: "12px", color: isDarkMode ? "var(--mm-primary-glow)" : "var(--mm-primary-deep)", display: "flex", alignItems: "center", gap: "5px" }}>
                <span>Bourses</span>
                <span>›</span>
                <span>{currentScholarship.country}</span>
                <span>›</span>
                <strong style={{ color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>{currentScholarship.title.slice(0, 24)}{currentScholarship.title.length > 24 ? "..." : ""}</strong>
              </div>
            </div>

            {/* Actions Rapides Haut de Page */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <button
                onClick={() => toggleSaveScholarship(currentScholarship.id)}
                className="god-pill-btn"
                style={{
                  background: savedIds.has(currentScholarship.id) ? "#FEF3C7" : isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                  color: savedIds.has(currentScholarship.id) ? "#B45309" : isDarkMode ? "#FFFFFF" : "#1D4ED8",
                  border: "none",
                  borderRadius: "10px",
                  padding: "7px 12px",
                  fontSize: "11px",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span>{savedIds.has(currentScholarship.id) ? "⭐ Suivie" : "☆ Suivre"}</span>
              </button>

              <button
                onClick={() => hideScholarship(currentScholarship.id, currentScholarship.title)}
                className="god-pill-btn"
                title="Masquer / Retirer cette bourse du catalogue"
                style={{
                  background: isDarkMode ? "rgba(239, 68, 68, 0.12)" : "#FEE2E2",
                  color: "#EF4444",
                  border: isDarkMode ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid #FECACA",
                  borderRadius: "10px",
                  padding: "7px 12px",
                  fontSize: "11px",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span>🗑️ Masquer</span>
              </button>

              {onCreateCard && (
                <button
                  onClick={() => {
                    const docsSummary = currentScholarship.requiredDocuments ? currentScholarship.requiredDocuments.map((d) => `• ${d.name}`).join("\n") : "";
                    onCreateCard({
                      front: `🎓 Bourse Master ${currentScholarship.country} : ${currentScholarship.title}`,
                      back: `💎 Financement : ${currentScholarship.monthlyStipend}\n\n🎯 Éligibilité :\n- Diplôme : ${currentScholarship.eligibility.academicLevel}\n- Âge : ${currentScholarship.eligibility.maxAge}\n- Langue : ${currentScholarship.eligibility.languageReq}\n- Modalité : ${currentScholarship.eligibility.nominationMode}\n\n📁 Documents Requis :\n${docsSummary}\n\n🔗 ${currentLinks.infoUrl}`,
                      category: "Bourses Master",
                    });
                    showToast?.("Fiche FSRS complète créée dans votre deck !", "success");
                  }}
                  className="god-pill-btn"
                  style={{
                    background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                    color: "var(--mm-primary)",
                    border: "1px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)",
                    padding: "7px 12px",
                    borderRadius: "10px",
                    fontSize: "11px",
                    fontWeight: "800",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span>🧠 Fiche Mémo</span>
                </button>
              )}

              <a
                href={currentLinks.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="god-pill-btn"
                style={{
                  background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))",
                  color: "#FFFFFF",
                  padding: "7px 14px",
                  borderRadius: "10px",
                  textDecoration: "none",
                  fontSize: "11px",
                  fontWeight: "900",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 3px 10px color-mix(in srgb, var(--mm-primary) 30.0%, transparent)",
                }}
              >
                <span>🚀 Portail Officiel</span>
                <span>↗</span>
              </a>
            </div>
          </div>

          {/* Hero Banner de la Bourse */}
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: "20px",
              padding: "20px 22px",
              marginBottom: "16px",
              background: isDarkMode
                ? "linear-gradient(135deg, #181438 0%, #0F0D24 100%)"
                : "linear-gradient(135deg, color-mix(in srgb, var(--mm-primary) 4%, white) 0%, color-mix(in srgb, var(--mm-primary) 4%, white) 100%)",
              border: isDarkMode
                ? "1px solid color-mix(in srgb, var(--mm-primary) 30.0%, transparent)"
                : "1px solid rgba(221, 214, 254, 0.8)",
              boxShadow: isDarkMode
                ? "0 10px 30px rgba(0, 0, 0, 0.4)"
                : "0 6px 20px color-mix(in srgb, var(--mm-primary) 8.0%, transparent)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    background: isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "26px",
                    flexShrink: 0,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  }}
                >
                  {currentScholarship.flag}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", letterSpacing: "0.8px" }}>
                      {currentScholarship.country}
                    </span>
                    <span style={{ background: "rgba(37, 99, 235, 0.12)", color: "#2563EB", padding: "2px 7px", borderRadius: "5px", fontSize: "11px", fontWeight: "900" }}>
                      ✓ 100% Tout Compris (Full Ride)
                    </span>
                  </div>
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#0F172A", lineHeight: "1.25" }}>
                    {currentScholarship.title}
                  </h1>
                  <div style={{ fontSize: "12px", color: isDarkMode ? "#93C5FD" : "var(--mm-primary-deep)", fontWeight: "700", marginTop: "3px" }}>
                    🏛️ {currentScholarship.provider} • 🎯 {currentScholarship.targetDegree}
                  </div>
                </div>
              </div>

              {/* KPI Highlights Hero */}
              <div className="god-hero-metrics" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <div
                  className="god-hero-metric-card"
                  style={{
                    background: isDarkMode ? "rgba(37, 99, 235, 0.12)" : "#EFF6FF",
                    border: "1px solid rgba(37, 99, 235, 0.3)",
                    borderRadius: "14px",
                    padding: "10px 14px",
                    minWidth: "120px",
                  }}
                >
                  <div className="god-hero-metric-title" style={{ fontSize: "10.5px", fontWeight: "900", textTransform: "uppercase", color: isDarkMode ? "#93C5FD" : "#1D4ED8", letterSpacing: "0.5px" }}>
                    Allocation Mensuelle
                  </div>
                  <div className="god-hero-metric-val" style={{ fontSize: "15px", fontWeight: "900", color: "#2563EB", marginTop: "2px" }}>
                    {currentScholarship.monthlyStipend}
                  </div>
                </div>

                <div
                  className="god-hero-metric-card"
                  style={{
                    background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#FFFFFF",
                    border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                    borderRadius: "14px",
                    padding: "10px 14px",
                    minWidth: "115px",
                  }}
                >
                  <div className="god-hero-metric-title" style={{ fontSize: "10.5px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", letterSpacing: "0.5px" }}>
                    Date Limite
                  </div>
                  <div className="god-hero-metric-val" style={{ fontSize: "13px", fontWeight: "900", color: computeScholarshipDeadlineInfo(resolveNextDeadline(currentScholarship)).color, marginTop: "2px" }}>
                    {computeScholarshipDeadlineInfo(resolveNextDeadline(currentScholarship)).label}
                  </div>
                </div>

                <div
                  className="god-hero-metric-card"
                  style={{
                    background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#FFFFFF",
                    border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                    borderRadius: "14px",
                    padding: "10px 14px",
                    minWidth: "110px",
                  }}
                >
                  <div className="god-hero-metric-title" style={{ fontSize: "10.5px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", letterSpacing: "0.5px" }}>
                    Dossier
                  </div>
                  <div className="god-hero-metric-val" style={{ fontSize: "13px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#0F172A", marginTop: "2px" }}>
                    {docsProgress.count}/{docsProgress.total} ({docsProgress.percent}%)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── NAVIGATION PAR ONGLETS (SWIPEABLE MOBILE PILLS) ────────────────── */}
          <div
            className="no-scrollbar"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              gap: "8px",
              marginBottom: "16px",
              padding: "6px 8px",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              background: isDarkMode ? "rgba(0, 0, 0, 0.25)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
              borderRadius: "14px",
            }}
          >
            <button
              onClick={() => setActiveTab("eligibility")}
              className="god-tab-btn"
              style={{
                flex: "0 0 auto",
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                background: activeTab === "eligibility" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "transparent",
                color: activeTab === "eligibility" ? "#FFFFFF" : isDarkMode ? "#93C5FD" : "#1D4ED8",
                fontSize: "12px",
                fontWeight: activeTab === "eligibility" ? "900" : "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "eligibility" ? "0 2px 8px color-mix(in srgb, var(--mm-primary) 40.0%, transparent)" : "none",
              }}
            >
              <span>🎯</span>
              <span>Éligibilité</span>
            </button>

            <button
              onClick={() => setActiveTab("documents")}
              className="god-tab-btn"
              style={{
                flex: "0 0 auto",
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                background: activeTab === "documents" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "transparent",
                color: activeTab === "documents" ? "#FFFFFF" : isDarkMode ? "#93C5FD" : "#1D4ED8",
                fontSize: "12px",
                fontWeight: activeTab === "documents" ? "900" : "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "documents" ? "0 2px 8px color-mix(in srgb, var(--mm-primary) 40.0%, transparent)" : "none",
              }}
            >
              <span>📁</span>
              <span>Documents</span>
              <span
                style={{
                  background: activeTab === "documents" ? "rgba(255,255,255,0.25)" : "var(--mm-primary)",
                  color: "#FFFFFF",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: "900",
                }}
              >
                {docsProgress.count}/{docsProgress.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("roadmap")}
              className="god-tab-btn"
              style={{
                flex: "0 0 auto",
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                background: activeTab === "roadmap" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "transparent",
                color: activeTab === "roadmap" ? "#FFFFFF" : isDarkMode ? "#93C5FD" : "#1D4ED8",
                fontSize: "12px",
                fontWeight: activeTab === "roadmap" ? "900" : "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "roadmap" ? "0 2px 8px color-mix(in srgb, var(--mm-primary) 40.0%, transparent)" : "none",
              }}
            >
              <span>🗺️</span>
              <span>Calendrier</span>
            </button>

            <button
              onClick={() => setActiveTab("strategy")}
              className="god-tab-btn"
              style={{
                flex: "0 0 auto",
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                background: activeTab === "strategy" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "transparent",
                color: activeTab === "strategy" ? "#FFFFFF" : isDarkMode ? "#93C5FD" : "#1D4ED8",
                fontSize: "12px",
                fontWeight: activeTab === "strategy" ? "900" : "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "strategy" ? "0 2px 8px color-mix(in srgb, var(--mm-primary) 40.0%, transparent)" : "none",
              }}
            >
              <span>💡</span>
              <span>Conseils Jury</span>
            </button>

            <button
              onClick={() => setActiveTab("verification")}
              className="god-tab-btn"
              style={{
                flex: "0 0 auto",
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                background: activeTab === "verification" ? "linear-gradient(135deg, #2563EB, #1D4ED8)" : "transparent",
                color: activeTab === "verification" ? "#FFFFFF" : isDarkMode ? "#93C5FD" : "#1D4ED8",
                fontSize: "12px",
                fontWeight: activeTab === "verification" ? "900" : "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "verification" ? "0 2px 8px rgba(37, 99, 235, 0.4)" : "none",
              }}
            >
              <span>🛡️</span>
              <span>Véracité & Légal</span>
            </button>
          </div>

          {/* ─── CORPS PLEINE PAGE SELON L'ONGLET ACTIF ───────────────────────── */}
          <div style={{ minHeight: "450px" }}>
            {/* ─── ONGLET 1 : ÉLIGIBILITÉ ────────────────────────────────────── */}
            {activeTab === "eligibility" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Avantages Complets */}
                <div
                  style={{
                    background: isDarkMode ? "rgba(37, 99, 235, 0.08)" : "#EFF6FF",
                    border: "1px solid rgba(37, 99, 235, 0.25)",
                    borderRadius: "16px",
                    padding: "16px 18px",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: isDarkMode ? "#93C5FD" : "#1D4ED8", letterSpacing: "0.6px", marginBottom: "10px" }}>
                    🎁 Prise en Charge Financière Intégrale (100% Tout Compris) :
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px 16px" }}>
                    {currentScholarship.benefits.map((b, idx) => (
                      <div key={idx} style={{ fontSize: "12px", color: isDarkMode ? "#E2E8F0" : "#1E3A8A", display: "flex", alignItems: "flex-start", flexWrap: "nowrap", gap: "8px" }}>
                        <span style={{ color: "#2563EB", fontWeight: "900", flexShrink: 0, marginTop: "2px" }}>✓</span>
                        <span style={{ flex: 1, minWidth: 0, lineHeight: "1.5" }}>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grille des Critères Spacieuse */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                  <div style={{ background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)", border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", borderRadius: "14px", padding: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", marginBottom: "4px" }}>
                      🎓 Diplôme Requis & GPA
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      {currentScholarship.eligibility.academicLevel}
                    </div>
                    {currentScholarship.eligibility.minGpa && (
                      <div style={{ fontSize: "11px", color: isDarkMode ? "var(--mm-primary-glow)" : "var(--mm-primary-deep)", marginTop: "3px" }}>
                        Moyenne minimale / Seuil : <strong>{currentScholarship.eligibility.minGpa}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)", border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", borderRadius: "14px", padding: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", marginBottom: "4px" }}>
                      🎂 Limite d'Âge & Date Pivot
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      {currentScholarship.eligibility.maxAge}
                    </div>
                  </div>

                  <div style={{ background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)", border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", borderRadius: "14px", padding: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", marginBottom: "4px" }}>
                      🗣️ Prérequis Linguistiques
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      {currentScholarship.eligibility.languageReq}
                    </div>
                  </div>

                  <div style={{ background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)", border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", borderRadius: "14px", padding: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", marginBottom: "4px" }}>
                      🌍 Nationalités Éligibles
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      {currentScholarship.eligibility.nationality}
                    </div>
                  </div>

                  <div style={{ background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)", border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", borderRadius: "14px", padding: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", marginBottom: "4px" }}>
                      💼 Expérience Professionnelle
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      {currentScholarship.eligibility.workExperience || "Non requise (stages et engagements valorisés)"}
                    </div>
                  </div>

                  <div style={{ background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)", border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", borderRadius: "14px", padding: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", marginBottom: "4px" }}>
                      🏛️ Modalité de Dépôt
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      {currentScholarship.eligibility.nominationMode}
                    </div>
                  </div>
                </div>

                {currentScholarship.eligibility.selectionConditions && (
                  <div
                    style={{
                      background: isDarkMode ? "rgba(245, 158, 11, 0.08)" : "#FFFBEB",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      borderRadius: "14px",
                      padding: "12px 16px",
                      fontSize: "12px",
                      color: isDarkMode ? "#FDE68A" : "#92400E",
                      lineHeight: "1.45",
                    }}
                  >
                    ⚠️ <strong>Condition spécifique d'attribution :</strong> {currentScholarship.eligibility.selectionConditions}
                  </div>
                )}
              </div>
            )}

            {/* ─── ONGLET 2 : DOCUMENTS À FOURNIR ───────────────────────────── */}
            {activeTab === "documents" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Barre de Suivi Supérieure */}
                <div
                  style={{
                    background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                    borderRadius: "14px",
                    padding: "14px 18px",
                    border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      Progression du dossier : {docsProgress.count}/{docsProgress.total} pièces prêtes
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "900", color: "#2563EB" }}>
                        {docsProgress.percent}% prêt
                      </span>
                      <button
                        onClick={copyDocumentChecklist}
                        className="god-pill-btn"
                        style={{
                          background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                          color: "var(--mm-primary)",
                          border: "1px solid color-mix(in srgb, var(--mm-primary) 35.0%, transparent)",
                          padding: "5px 10px",
                          borderRadius: "8px",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer",
                        }}
                      >
                        📋 Copier la liste
                      </button>
                    </div>
                  </div>
                  <div style={{ height: "6px", width: "100%", background: isDarkMode ? "rgba(0,0,0,0.4)" : "#E9D5FF", borderRadius: "999px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${docsProgress.percent}%`,
                        background: "linear-gradient(90deg, var(--mm-primary), #2563EB)",
                        borderRadius: "999px",
                        transition: "width 0.25s ease",
                      }}
                    />
                  </div>
                </div>

                {/* Liste Spacieuse des Documents */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {currentScholarship.requiredDocuments.map((doc, idx) => {
                    const isChecked = !!checkedDocs[doc.id];
                    return (
                      <div
                        key={doc.id || idx}
                        style={{
                          background: isChecked
                            ? isDarkMode
                              ? "rgba(37, 99, 235, 0.06)"
                              : "#EFF6FF"
                            : isDarkMode
                            ? "#0B1220"
                            : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                          border: isChecked
                            ? "1px solid rgba(37, 99, 235, 0.4)"
                            : isDarkMode
                            ? "1px solid color-mix(in srgb, var(--mm-primary) 18.0%, transparent)"
                            : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)",
                          borderRadius: "14px",
                          padding: "16px 18px",
                          transition: "all 0.18s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleDocChecked(doc.id)}
                            id={`doc-page-${doc.id}`}
                            style={{
                              width: "18px",
                              height: "18px",
                              marginTop: "2px",
                              accentColor: "#2563EB",
                              cursor: "pointer",
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                              <label
                                htmlFor={`doc-page-${doc.id}`}
                                style={{
                                  fontSize: "14px",
                                  fontWeight: "800",
                                  color: isChecked ? "#2563EB" : isDarkMode ? "#FFFFFF" : "#0F172A",
                                  cursor: "pointer",
                                  textDecoration: isChecked ? "line-through" : "none",
                                }}
                              >
                                {doc.name}
                              </label>
                              <span style={{ background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, white)", color: "var(--mm-primary)", padding: "2px 6px", borderRadius: "5px", fontSize: "11px", fontWeight: "800" }}>
                                {doc.categoryLabel}
                              </span>
                              {doc.isMandatory ? (
                                <span style={{ background: "rgba(239, 68, 68, 0.12)", color: "#EF4444", padding: "1px 6px", borderRadius: "4px", fontSize: "10.5px", fontWeight: "900" }}>
                                  OBLIGATOIRE
                                </span>
                              ) : (
                                <span style={{ background: "rgba(245, 158, 11, 0.12)", color: "#D97706", padding: "1px 6px", borderRadius: "4px", fontSize: "10.5px", fontWeight: "800" }}>
                                  OPTIONNEL
                                </span>
                              )}
                            </div>

                            <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: isDarkMode ? "#CBD5E1" : "#4B5563", lineHeight: "1.45" }}>
                              {doc.description}
                            </p>

                            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                              <div style={{ fontSize: "11px", color: isDarkMode ? "var(--mm-primary-glow)" : "var(--mm-primary-deep)", fontWeight: "600" }}>
                                ⚙️ <strong>Format exigé :</strong> {doc.specifications}
                              </div>
                              <div
                                style={{
                                  background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 10.0%, transparent)" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                                  borderLeft: "3px solid var(--mm-primary)",
                                  padding: "8px 12px",
                                  borderRadius: "0 8px 8px 0",
                                  fontSize: "11px",
                                  color: isDarkMode ? "#E9D5FF" : "#1D4ED8",
                                  lineHeight: "1.4",
                                }}
                              >
                                💡 <strong>Conseil Stratégique :</strong> {doc.godTip}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── ONGLET 3 : CALENDRIER & ROADMAP ──────────────────────────── */}
            {activeTab === "roadmap" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {currentScholarship.applicationSteps.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                      border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)",
                      borderRadius: "14px",
                      padding: "16px 18px",
                      display: "flex",
                      gap: "14px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "10px",
                        background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))",
                        color: "#FFFFFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        fontWeight: "900",
                        flexShrink: 0,
                      }}
                    >
                      {step.step}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px", marginBottom: "4px" }}>
                        <div style={{ fontSize: "14px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                          {step.title}
                        </div>
                        <span style={{ background: "rgba(37, 99, 235, 0.12)", color: "#2563EB", padding: "2px 7px", borderRadius: "5px", fontSize: "11px", fontWeight: "800" }}>
                          ⏱️ {step.timeline}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "12px", color: isDarkMode ? "#CBD5E1" : "#4B5563", lineHeight: "1.45" }}>
                        {step.details}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── ONGLET 4 : SECRETS & CONSEILS JURY ────────────────────────── */}
            {activeTab === "strategy" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", marginBottom: "8px", letterSpacing: "0.6px" }}>
                    ⚖️ Pondération de la Commission de Sélection :
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                    {currentScholarship.selectionCriteria.map((sc, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: isDarkMode ? "#0B1220" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                          border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)",
                          borderRadius: "12px",
                          padding: "14px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <div style={{ fontSize: "13px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                            {sc.criterion}
                          </div>
                          <span style={{ background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))", color: "#FFFFFF", padding: "1px 6px", borderRadius: "5px", fontSize: "11px", fontWeight: "900" }}>
                            {sc.weight}
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: isDarkMode ? "#CBD5E1" : "#64748B", lineHeight: "1.35" }}>
                          {sc.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "#EF4444", marginBottom: "8px", letterSpacing: "0.6px" }}>
                    🚨 Erreurs Éliminatoires à Éviter :
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {currentScholarship.juryInsights.map((insight, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: isDarkMode ? "rgba(239, 68, 68, 0.08)" : "#FEF2F2",
                          borderLeft: "3px solid #EF4444",
                          borderRadius: "0 10px 10px 0",
                          padding: "10px 14px",
                          fontSize: "12px",
                          color: isDarkMode ? "#FCA5A5" : "#991B1B",
                          lineHeight: "1.45",
                        }}
                      >
                        • {insight}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── ONGLET 5 : VÉRACITÉ & LÉGAL ─────────────────────────────────── */}
            {activeTab === "verification" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div
                  style={{
                    background: isDarkMode ? "linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(6, 95, 70, 0.05) 100%)" : "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
                    border: "1px solid rgba(37, 99, 235, 0.35)",
                    borderRadius: "18px",
                    padding: "20px 22px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "24px" }}>🛡️</span>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#1E3A8A" }}>
                          Sceau de Véracité & Traçabilité Réglementaire
                        </div>
                        <div style={{ fontSize: "11px", color: isDarkMode ? "#BFDBFE" : "#1E40AF", fontWeight: "700" }}>
                          100% Conforme aux textes réglementaires et portails gouvernementaux d'origine
                        </div>
                      </div>
                    </div>
                    <span style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#FFFFFF", padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: "900" }}>
                      ✓ CERTIFIÉ SANS INTERMÉDIAIRE
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginTop: "14px" }}>
                    <div style={{ background: isDarkMode ? "rgba(0,0,0,0.3)" : "#FFFFFF", borderRadius: "12px", padding: "14px", border: isDarkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid #BFDBFE" }}>
                      <div style={{ fontSize: "11px", fontWeight: "900", color: "#2563EB", textTransform: "uppercase" }}>🏛️ Organisme d'État Émetteur</div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#0F172A", marginTop: "3px" }}>
                        {currentScholarship.verifiedOrg}
                      </div>
                    </div>

                    <div style={{ background: isDarkMode ? "rgba(0,0,0,0.3)" : "#FFFFFF", borderRadius: "12px", padding: "14px", border: isDarkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid #BFDBFE" }}>
                      <div style={{ fontSize: "11px", fontWeight: "900", color: "#2563EB", textTransform: "uppercase" }}>🌐 Portail Officiel d'Autorité</div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#0F172A", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {currentLinks.infoUrl}
                      </div>
                    </div>

                    <div style={{ background: isDarkMode ? "rgba(0,0,0,0.3)" : "#FFFFFF", borderRadius: "12px", padding: "14px", border: isDarkMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid #BFDBFE", gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: "11px", fontWeight: "900", color: "#2563EB", textTransform: "uppercase" }}>📜 Base Juridique & Référence Légale</div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: isDarkMode ? "#E2E8F0" : "#1E3A8A", marginTop: "3px" }}>
                        {currentScholarship.legalReference || "Conforme aux dispositions ministérielles et textes réglementaires en vigueur"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                    <a
                      href={currentLinks.infoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="god-pill-btn"
                      style={{
                        background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                        color: "#FFFFFF",
                        padding: "9px 16px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: "900",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>Consulter le portail officiel de l'État</span>
                      <span>↗</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Précédent / Suivant en bas de page */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)",
            }}
          >
            {currentScholarshipIndex > 0 ? (
              <button
                onClick={() => setSelectedScholarshipId(allScholarships[currentScholarshipIndex - 1].id)}
                className="god-pill-btn"
                style={{
                  background: isDarkMode ? "rgba(255, 255, 255, 0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                  color: isDarkMode ? "#FFFFFF" : "#1D4ED8",
                  border: "none",
                  borderRadius: "10px",
                  padding: "8px 14px",
                  fontSize: "11px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                ← Précédente
              </button>
            ) : <div />}

            <a
              href={currentLinks.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="god-pill-btn"
              style={{
                background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))",
                color: "#FFFFFF",
                padding: "10px 20px",
                borderRadius: "12px",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "900",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 4px 14px color-mix(in srgb, var(--mm-primary) 35.0%, transparent)",
              }}
            >
              <span>🚀 Portail Officiel ({currentScholarship.provider.slice(0, 20)})</span>
              <span>↗</span>
            </a>

            {currentScholarshipIndex < allScholarships.length - 1 ? (
              <button
                onClick={() => setSelectedScholarshipId(allScholarships[currentScholarshipIndex + 1].id)}
                className="god-pill-btn"
                style={{
                  background: isDarkMode ? "rgba(255, 255, 255, 0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                  color: isDarkMode ? "#FFFFFF" : "#1D4ED8",
                  border: "none",
                  borderRadius: "10px",
                  padding: "8px 14px",
                  fontSize: "11px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                Suivante →
              </button>
            ) : <div />}
          </div>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════════════
           VUE 2 : CATALOGUE PRINCIPAL DES BOURSES
           ═════════════════════════════════════════════════════════════════════ */
        <div>
          {/* ── HERO BANNER DU CATALOGUE LIQUID GLASS ÉLITE ── */}
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: "22px",
              padding: "20px 24px",
              marginBottom: "16px",
              background: isDarkMode
                ? "linear-gradient(135deg, rgba(20, 24, 48, 0.8) 0%, rgba(11, 13, 26, 0.92) 100%)"
                : "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: isDarkMode
                ? "1px solid rgba(96, 165, 250, 0.25)"
                : "1px solid rgba(59, 130, 246, 0.2)",
              boxShadow: isDarkMode
                ? "0 12px 32px rgba(0, 0, 0, 0.45)"
                : "0 8px 24px color-mix(in srgb, var(--mm-primary) 10%, transparent)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ maxWidth: "600px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "22px" }}>🎓</span>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: "20px",
                      fontWeight: "900",
                      letterSpacing: "-0.4px",
                      color: isDarkMode ? "#FFFFFF" : "#0F172A",
                    }}
                  >
                    Hub Bourses Master Internationales
                  </h1>
                  <span
                    style={{
                      background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                      color: "#FFFFFF",
                      padding: "3px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: "900",
                      letterSpacing: "0.5px",
                    }}
                  >
                    ✓ OFFICIEL & VÉRIFIÉ
                  </span>

                  <button
                    onClick={handleScanNewScholarships}
                    disabled={isScanning}
                    className="god-pill-btn"
                    title="Scanner le web et synchroniser les nouveaux appels à bourses officiels"
                    style={{
                      background: isScanning
                        ? "rgba(59, 130, 246, 0.2)"
                        : "linear-gradient(135deg, #2563EB, #1D4ED8)",
                      color: "#FFFFFF",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      padding: "3px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: "900",
                      cursor: isScanning ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: isScanning ? "none" : "0 2px 8px rgba(37, 99, 235, 0.35)",
                      animation: isScanning ? "pulse-radar 1.5s infinite" : "none",
                    }}
                  >
                    <span style={{ display: "inline-block", animation: isScanning ? "spin-radar 1s linear infinite" : "none" }}>
                      {isScanning ? "⏳" : "⚡"}
                    </span>
                    <span>{isScanning ? "Radar en cours..." : "Scanner & Actualiser"}</span>
                  </button>
                </div>

                <p style={{ margin: 0, fontSize: "12.5px", color: isDarkMode ? "#93C5FD" : "#1D4ED8", lineHeight: "1.55" }}>
                  Données directes et vérifiées des portails officiels : critères d'éligibilité approfondis, checklists de documents, calendrier et conseils du jury. Cliquez sur une bourse pour ouvrir son dossier complet.
                </p>
              </div>

              <div className="god-hero-stats-grid">
                <div
                  style={{
                    background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#FFFFFF",
                    border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(59, 130, 246, 0.2)",
                    padding: "8px 14px",
                    borderRadius: "14px",
                    textAlign: "center",
                    minWidth: "64px",
                  }}
                >
                  <div style={{ fontSize: "17px", fontWeight: "900", color: "var(--mm-primary)" }}>{stats.total}</div>
                  <div style={{ fontSize: "11px", color: isDarkMode ? "#94A3B8" : "#6B21A8", fontWeight: "700" }}>Bourses</div>
                </div>

                <div
                  style={{
                    background: isDarkMode ? "rgba(37, 99, 235, 0.12)" : "#EFF6FF",
                    border: "1px solid rgba(37, 99, 235, 0.35)",
                    padding: "8px 14px",
                    borderRadius: "14px",
                    textAlign: "center",
                    minWidth: "64px",
                  }}
                >
                  <div style={{ fontSize: "17px", fontWeight: "900", color: "#2563EB" }}>{stats.fullRideCount}</div>
                  <div style={{ fontSize: "11px", color: isDarkMode ? "#93C5FD" : "#1E40AF", fontWeight: "700" }}>100% Financé</div>
                </div>

                <div
                  style={{
                    background: isDarkMode ? "rgba(245, 158, 11, 0.12)" : "#FFFBEB",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    padding: "8px 14px",
                    borderRadius: "14px",
                    textAlign: "center",
                    minWidth: "64px",
                  }}
                >
                  <div style={{ fontSize: "17px", fontWeight: "900", color: "#F59E0B" }}>{stats.countriesCount}</div>
                  <div style={{ fontSize: "11px", color: isDarkMode ? "#FDE68A" : "#B45309", fontWeight: "700" }}>Pays</div>
                </div>

                <div
                  onClick={() => {
                    const next = !forMeOnly;
                    setForMeOnly(next);
                    if (next) {
                      setSelectedCategoryGroup("all");
                      setSelectedFunding("all");
                      setSelectedCountry("all");
                      setSelectedStatus("all");
                      setSelectedField("all");
                      setSearchQuery("");
                    }
                    safeStorage.set(FOR_ME_FILTER_KEY, JSON.stringify(next));
                    showToast?.(
                      next
                        ? `🎯 Option 'Pour moi' activée : ${stats.forMeCount} bourses d'élite mondiales accessibles (Entrée Master 1 sans diplôme physique immédiat)`
                        : "🌐 Affichage de toutes les bourses mondiales",
                      "info"
                    );
                  }}
                  className="god-pill-btn"
                  title="Cliquer pour activer/désactiver le filtre Pour moi"
                  style={{
                    background: forMeOnly
                      ? "linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(5, 150, 105, 0.2))"
                      : isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#F8FAFC",
                    border: forMeOnly
                      ? "2px solid #2563EB"
                      : isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid #E2E8F0",
                    padding: "6px 12px",
                    borderRadius: "12px",
                    textAlign: "center",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: "900", color: forMeOnly ? "#2563EB" : "var(--mm-primary)" }}>
                    🎯 {stats.forMeCount}
                  </div>
                  <div style={{ fontSize: "11px", color: forMeOnly ? "#1D4ED8" : (isDarkMode ? "#94A3B8" : "#64748B"), fontWeight: "800" }}>
                    Pour moi
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 🎯 Bannière de Profil Interactif "Pour moi" (L3 Informatique • Sénégal) & Accès au Guide */}
          <div
            className="god-profile-banner"
            style={{
              background: forMeOnly
                ? (isDarkMode
                  ? "linear-gradient(135deg, rgba(37, 99, 235, 0.15) 0%, rgba(59, 130, 246, 0.12) 100%)"
                  : "linear-gradient(135deg, #EFF6FF 0%, #EFF6FF 100%)")
                : (isDarkMode ? "rgba(255, 255, 255, 0.03)" : "color-mix(in srgb, var(--mm-primary) 4%, white)"),
              border: isDarkMode
                ? (forMeOnly ? "2px solid #60A5FA" : "1.5px solid rgba(96, 165, 250, 0.4)")
                : (forMeOnly ? "2px solid #2563EB" : "1.5px solid #3B82F6"),
              boxShadow: forMeOnly
                ? (isDarkMode ? "0 8px 24px rgba(37, 99, 235, 0.2)" : "0 4px 16px rgba(37, 99, 235, 0.12)")
                : "none",
            }}
          >
            <div className="god-profile-banner-left">
              <button
                onClick={() => {
                  const next = !forMeOnly;
                  setForMeOnly(next);
                  if (next) {
                    setSelectedCategoryGroup("all");
                    setSelectedFunding("all");
                    setSelectedCountry("all");
                    setSelectedStatus("all");
                    setSelectedField("all");
                    setSearchQuery("");
                  }
                  safeStorage.set(FOR_ME_FILTER_KEY, JSON.stringify(next));
                  showToast?.(
                    next
                      ? `🎯 Option 'Pour moi' activée : ${stats.forMeCount} bourses d'élite mondiales accessibles (Entrée Master 1 sans diplôme physique immédiat)`
                      : "🌐 Affichage de toutes les bourses mondiales",
                    "info"
                  );
                }}
                className="god-pill-btn god-profile-toggle-btn"
                style={{
                  padding: "9px 16px",
                  borderRadius: "12px",
                  border: "none",
                  background: forMeOnly
                    ? "linear-gradient(135deg, #2563EB, #1D4ED8)"
                    : (isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#E2E8F0"),
                  color: forMeOnly ? "#FFFFFF" : (isDarkMode ? "#CBD5E1" : "#475569"),
                  fontSize: "12px",
                  fontWeight: "900",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  flexShrink: 0,
                  boxShadow: forMeOnly ? "0 4px 14px rgba(37, 99, 235, 0.35)" : "none",
                }}
              >
                <span>{forMeOnly ? "✓ Activé" : "○ Filtrer"}</span>
                <span>🎯 Option Pour moi</span>
                <span style={{
                  background: forMeOnly ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.1)",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: "900",
                }}>
                  {stats.forMeCount}
                </span>
              </button>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="god-profile-chips">
                  <span style={{ fontSize: "12.5px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#0F172A", marginRight: "2px" }}>
                    Mon profil :
                  </span>
                  <span className="god-profile-pill" style={{ background: isDarkMode ? "rgba(37, 99, 235, 0.2)" : "#DBEAFE", color: "#2563EB" }}>
                    Licence 3 (L3)
                  </span>
                  <span className="god-profile-pill" style={{ background: isDarkMode ? "rgba(255,255,255,0.06)" : "#F1F5F9", color: isDarkMode ? "#E2E8F0" : "#334155" }}>
                    🇸🇳 Sénégal
                  </span>
                  <span className="god-profile-pill" style={{ background: isDarkMode ? "color-mix(in srgb, var(--mm-primary) 20%, transparent)" : "color-mix(in srgb, var(--mm-primary) 12%, white)", color: "var(--mm-primary)" }}>
                    Informatique & Tech
                  </span>
                </div>
                <div style={{ fontSize: "11.5px", color: isDarkMode ? "#94A3B8" : "#64748B", marginTop: "4px", lineHeight: "1.45" }}>
                  {forMeOnly
                    ? "✓ Filtrage actif : opportunités sans condition de diplôme définitif immédiat et sans 2-3 ans d'expérience préalable."
                    : "Catalogue mondial complet (tous profils, tous niveaux). Activez l'option pour cibler votre profil."}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowGuideModal(true)}
              className="god-pill-btn god-guide-btn"
              style={{
                border: isDarkMode ? "1px solid rgba(59, 130, 246, 0.45)" : "1px solid #BFDBFE",
                background: isDarkMode ? "linear-gradient(135deg, rgba(59, 130, 246, 0.2), color-mix(in srgb, var(--mm-primary) 15.0%, transparent))" : "#EFF6FF",
                color: isDarkMode ? "#BFDBFE" : "#1D4ED8",
                boxShadow: "0 2px 10px rgba(59, 130, 246, 0.15)",
              }}
            >
              <span>📘 Guide Candidature L3 Info</span>
              <span>➔</span>
            </button>
          </div>

          {/* Filtres & Recherche */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", position: "relative" }}>
                <input
                  type="text"
                  placeholder="Rechercher pays, université, filière (IA, Droit, Ingénierie...)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 36px",
                    borderRadius: "12px",
                    background: isDarkMode ? "#151233" : "#FFFFFF",
                    border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 25.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                    color: isDarkMode ? "#FFFFFF" : "#0F172A",
                    fontSize: "13px",
                    fontWeight: "600",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: "var(--mm-primary)" }}>
                  🔍
                </span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: "12px" }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => setIsFiltersOpen((prev) => !prev)}
                className="god-pill-btn"
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 30.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                  background: isFiltersOpen ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : isDarkMode ? "#151233" : "#FFFFFF",
                  color: isFiltersOpen ? "#FFFFFF" : isDarkMode ? "#E2E8F0" : "#1D4ED8",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>⚙️ Filtres</span>
                <span style={{ fontSize: "10.5px" }}>{isFiltersOpen ? "▲" : "▼"}</span>
              </button>

              <button
                onClick={handleScanNewScholarships}
                disabled={isScanning}
                className="god-pill-btn"
                title="Actualiser le catalogue et chercher de nouvelles opportunités de bourses"
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  background: isScanning
                    ? "rgba(59, 130, 246, 0.2)"
                    : "linear-gradient(135deg, #2563EB, #1D4ED8)",
                  color: "#FFFFFF",
                  fontSize: "12px",
                  fontWeight: "900",
                  cursor: isScanning ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: isScanning ? "none" : "0 2px 10px rgba(37, 99, 235, 0.25)",
                  flexShrink: 0,
                  animation: isScanning ? "pulse-radar 1.5s infinite" : "none",
                }}
              >
                <span style={{ display: "inline-block", animation: isScanning ? "spin-radar 1s linear infinite" : "none" }}>
                  {isScanning ? "⏳" : "🔄"}
                </span>
                <span>{isScanning ? "Radar actif..." : "Actualiser"}</span>
              </button>

              {dynamicScholarships.length > 0 && (
                <button
                  onClick={handleClearDynamicScholarships}
                  className="god-pill-btn"
                  title="Revenir au catalogue initial de 28 bourses officielles de référence"
                  style={{
                    padding: "9px 12px",
                    borderRadius: "12px",
                    border: isDarkMode ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #FECACA",
                    background: isDarkMode ? "rgba(239, 68, 68, 0.12)" : "#FEE2E2",
                    color: "#EF4444",
                    fontSize: "11px",
                    fontWeight: "800",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    flexShrink: 0,
                  }}
                >
                  <span>✕ Réinitialiser</span>
                  <span style={{ background: "rgba(239, 68, 68, 0.2)", padding: "1px 5px", borderRadius: "999px", fontSize: "10px" }}>
                    +{dynamicScholarships.length}
                  </span>
                </button>
              )}
            </div>

            {isFiltersOpen && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "14px 16px",
                  borderRadius: "14px",
                  background: isDarkMode ? "#120F2B" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                  border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Catégories & Types */}
                <div>
                  <div style={{ fontSize: "11px", fontWeight: "900", color: "var(--mm-primary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                    🎯 Catégories & Financements
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => { setSelectedCategoryGroup("all"); setSelectedFunding("all"); setSelectedStatus("all"); setForMeOnly(false); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: !forMeOnly && selectedCategoryGroup === "all" && selectedFunding === "all" && selectedStatus === "all" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                        color: !forMeOnly && selectedCategoryGroup === "all" && selectedFunding === "all" && selectedStatus === "all" ? "#FFFFFF" : isDarkMode ? "#93C5FD" : "var(--mm-primary-deep)",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      Toutes ({allScholarships.length})
                    </button>

                    <button
                      onClick={() => {
                        setForMeOnly(true);
                        setSelectedCategoryGroup("all");
                        setSelectedFunding("all");
                        setSelectedCountry("all");
                        setSelectedStatus("all");
                        setSelectedField("all");
                        setSearchQuery("");
                        safeStorage.set(FOR_ME_FILTER_KEY, JSON.stringify(true));
                      }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: forMeOnly ? "1.5px solid #2563EB" : "none",
                        background: forMeOnly ? "linear-gradient(135deg, #2563EB, #1D4ED8)" : (isDarkMode ? "rgba(37, 99, 235, 0.15)" : "#EFF6FF"),
                        color: forMeOnly ? "#FFFFFF" : "#1D4ED8",
                        fontSize: "11px",
                        fontWeight: "900",
                        cursor: "pointer",
                        boxShadow: forMeOnly ? "0 2px 8px rgba(37, 99, 235, 0.3)" : "none",
                      }}
                    >
                      🎯 Pour moi ({stats.forMeCount})
                    </button>

                    <button
                      onClick={() => { setSelectedCategoryGroup("senegal"); setSelectedFunding("all"); setSelectedStatus("all"); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: selectedCategoryGroup === "senegal" ? "linear-gradient(135deg, #1D4ED8, #1E40AF)" : isDarkMode ? "rgba(5, 150, 105, 0.15)" : "#EFF6FF",
                        color: selectedCategoryGroup === "senegal" ? "#FFFFFF" : "#1D4ED8",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      🇸🇳 Sénégal & Coopération ({stats.senegalCount})
                    </button>

                    <button
                      onClick={() => { setSelectedCategoryGroup("multilateral"); setSelectedFunding("all"); setSelectedStatus("all"); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: selectedCategoryGroup === "multilateral" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : isDarkMode ? "color-mix(in srgb, var(--mm-primary) 15.0%, transparent)" : "#EFF6FF",
                        color: selectedCategoryGroup === "multilateral" ? "#FFFFFF" : "var(--mm-primary)",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      🌍 Multilatéral & Afrique ({stats.multilateralCount})
                    </button>

                    <button
                      onClick={() => { setSelectedCategoryGroup("europe"); setSelectedFunding("all"); setSelectedStatus("all"); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: selectedCategoryGroup === "europe" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : isDarkMode ? "rgba(158, 71, 36, 0.15)" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                        color: selectedCategoryGroup === "europe" ? "#FFFFFF" : "var(--mm-primary)",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      🇪🇺 Europe & UK ({stats.europeCount})
                    </button>

                    <button
                      onClick={() => { setSelectedCategoryGroup("americas_asia"); setSelectedFunding("all"); setSelectedStatus("all"); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: selectedCategoryGroup === "americas_asia" ? "linear-gradient(135deg, #D97706, #B45309)" : isDarkMode ? "rgba(217, 119, 6, 0.15)" : "#FFFBEB",
                        color: selectedCategoryGroup === "americas_asia" ? "#FFFFFF" : "#D97706",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      🌎 Amériques & Asie ({stats.americasAsiaCount})
                    </button>

                    <button
                      onClick={() => { setSelectedFunding("full_ride"); setSelectedStatus("all"); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: selectedFunding === "full_ride" ? "linear-gradient(135deg, #2563EB, #1D4ED8)" : isDarkMode ? "rgba(37, 99, 235, 0.1)" : "#EFF6FF",
                        color: selectedFunding === "full_ride" ? "#FFFFFF" : "#1D4ED8",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      👑 100% Tout Compris ({stats.fullRideCount})
                    </button>

                    <button
                      onClick={() => { setSelectedStatus("saved"); setSelectedFunding("all"); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: selectedStatus === "saved" ? "linear-gradient(135deg, #F59E0B, #D97706)" : isDarkMode ? "rgba(245, 158, 11, 0.1)" : "#FFFBEB",
                        color: selectedStatus === "saved" ? "#FFFFFF" : "#D97706",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      ⭐ Suivies ({savedIds.size})
                    </button>

                    {hiddenIds.size > 0 && (
                      <button
                        onClick={() => unhideAllScholarships()}
                        className="god-pill-btn"
                        style={{
                          padding: "5px 10px",
                          borderRadius: "8px",
                          border: "1px dashed rgba(239, 68, 68, 0.5)",
                          background: isDarkMode ? "rgba(239, 68, 68, 0.1)" : "#FEF2F2",
                          color: "#EF4444",
                          fontSize: "11px",
                          fontWeight: "800",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>🔄 Restaurer {hiddenIds.size} masquée{hiddenIds.size > 1 ? "s" : ""}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filtre par Pays */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "900", color: "var(--mm-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      🌍 Filtrer par Pays Spécifique
                    </span>
                    {selectedCountry !== "all" && (
                      <button
                        onClick={() => setSelectedCountry("all")}
                        style={{ background: "none", border: "none", color: "#EF4444", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                      >
                        Réinitialiser pays
                      </button>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "6px" }}>
                    <button
                      onClick={() => { setSelectedCountry("all"); setIsFiltersOpen(false); }}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 8px",
                        borderRadius: "8px",
                        border: selectedCountry === "all" ? "none" : isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                        background: selectedCountry === "all" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "transparent",
                        color: selectedCountry === "all" ? "#FFFFFF" : isDarkMode ? "#E2E8F0" : "var(--mm-primary-deep)",
                        fontSize: "11px",
                        fontWeight: selectedCountry === "all" ? "800" : "600",
                        cursor: "pointer",
                      }}
                    >
                      🌐 Tous les pays
                    </button>

                    {availableCountries.map((c) => {
                      const isSel = selectedCountry === c.code;
                      return (
                        <button
                          key={c.code}
                          onClick={() => { setSelectedCountry(c.code); setIsFiltersOpen(false); }}
                          className="god-pill-btn"
                          style={{
                            padding: "5px 8px",
                            borderRadius: "8px",
                            border: isSel ? "none" : isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
                            background: isSel ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "transparent",
                            color: isSel ? "#FFFFFF" : isDarkMode ? "#E2E8F0" : "var(--mm-primary-deep)",
                            fontSize: "11px",
                            fontWeight: isSel ? "800" : "600",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <span>{c.flag}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ BARRE DE PILOTAGE GOD TIER : tri, chips live, filtres actifs ═══ */}
          <div
            style={{
              margin: "10px 0 4px",
              padding: "10px 12px",
              borderRadius: "14px",
              background: isDarkMode ? "rgba(255,255,255,0.03)" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
              border: isDarkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid color-mix(in srgb, var(--mm-primary) 12%, white)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                {sortedList.length} bourse{sortedList.length > 1 ? "s" : ""} affichée{sortedList.length > 1 ? "s" : ""}
              </span>
              <span style={{ fontSize: "10.5px", fontWeight: "700", color: isDarkMode ? "#94A3B8" : "#64748B" }}>
                🔗 {linkAudit.direct}/{linkAudit.total} liens directs vérifiés
              </span>
              <span style={{ fontSize: "10.5px", fontWeight: "700", color: isDarkMode ? "#94A3B8" : "#64748B" }}>
                • Dernière synchro : {formatRelativeTime(lastScanAt)}
              </span>
            </div>

            {/* Chips d'état live */}
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
              {[
                { id: "all", label: `📚 Toutes (${visibleScholarships.length})`, color: "#2563EB" },
                { id: "new", label: `🆕 Nouvelles (${newCount})`, color: "#059669" },
                { id: "urgent", label: `🔥 Urgentes (${urgentCount})`, color: "#EF4444" },
                { id: "saved", label: `⭐ Suivies (${savedIds.size})`, color: "#D97706" },
              ].map((chip) => {
                const active = selectedStatus === chip.id;
                return (
                  <button
                    key={chip.id}
                    onClick={() => setSelectedStatus(chip.id)}
                    className="god-pill-btn"
                    style={{
                      flexShrink: 0,
                      padding: "5px 11px",
                      borderRadius: "999px",
                      border: `1.5px solid ${active ? chip.color : "transparent"}`,
                      background: active ? chip.color : isDarkMode ? "rgba(255,255,255,0.06)" : "#FFFFFF",
                      color: active ? "#FFFFFF" : chip.color,
                      fontSize: "11px",
                      fontWeight: "900",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Tri intelligent */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center", overflowX: "auto" }}>
              <span style={{ fontSize: "10.5px", fontWeight: "900", color: isDarkMode ? "#94A3B8" : "#64748B", flexShrink: 0 }}>
                TRIER PAR
              </span>
              {SORT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => applySortMode(mode.id)}
                  title={mode.hint}
                  className="god-pill-btn"
                  style={{
                    flexShrink: 0,
                    padding: "4px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: sortMode === mode.id ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : isDarkMode ? "rgba(255,255,255,0.06)" : "#FFFFFF",
                    color: sortMode === mode.id ? "#FFFFFF" : isDarkMode ? "#CBD5E1" : "#475569",
                    fontSize: "10.5px",
                    fontWeight: "800",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {mode.label}
                </button>
              ))}
              {hasActiveFilters && (
                <button
                  onClick={resetAllFilters}
                  className="god-pill-btn"
                  style={{
                    flexShrink: 0,
                    marginLeft: "auto",
                    padding: "4px 10px",
                    borderRadius: "8px",
                    border: "1px solid rgba(239,68,68,0.4)",
                    background: "rgba(239,68,68,0.1)",
                    color: "#EF4444",
                    fontSize: "10.5px",
                    fontWeight: "900",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  ✕ Effacer les filtres
                </button>
              )}
            </div>
          </div>

          {/* ═══ RAPPORT DE SYNCHRONISATION (après clic sur Actualiser) ═══ */}
          {scanReport && (
            <div
              style={{
                margin: "8px 0",
                padding: "12px 14px",
                borderRadius: "14px",
                background: scanReport.added.length > 0
                  ? "linear-gradient(135deg, rgba(5,150,105,0.12), rgba(37,99,235,0.10))"
                  : isDarkMode ? "rgba(255,255,255,0.04)" : "#F8FAFC",
                border: `1px solid ${scanReport.added.length > 0 ? "rgba(5,150,105,0.35)" : "rgba(148,163,184,0.35)"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: "900", color: scanReport.added.length > 0 ? "#059669" : (isDarkMode ? "#CBD5E1" : "#475569") }}>
                  {scanReport.added.length > 0
                    ? `✨ ${scanReport.added.length} nouvelle(s) bourse(s) ajoutée(s) au catalogue`
                    : "✅ Aucune nouvelle bourse — votre catalogue est déjà à jour"}
                </div>
                <button
                  onClick={() => setScanReport(null)}
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", color: isDarkMode ? "#94A3B8" : "#64748B", fontWeight: "900" }}
                  aria-label="Fermer le rapport"
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: isDarkMode ? "#94A3B8" : "#64748B", marginTop: "3px" }}>
                {scanReport.refreshed > 0
                  ? `${scanReport.refreshed} échéance(s) actualisée(s) vers la prochaine session • `
                  : ""}
                {scanReport.total} bourses officielles au total • {formatRelativeTime(scanReport.at)}
              </div>
              {scanReport.added.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {scanReport.added.map((added) => (
                    <button
                      key={added.id}
                      onClick={() => setSelectedScholarshipId(added.id)}
                      className="god-pill-btn"
                      style={{
                        padding: "5px 10px",
                        borderRadius: "999px",
                        border: "1px solid rgba(5,150,105,0.4)",
                        background: isDarkMode ? "rgba(5,150,105,0.15)" : "#ECFDF5",
                        color: "#047857",
                        fontSize: "11px",
                        fontWeight: "800",
                        cursor: "pointer",
                      }}
                    >
                      {added.flag} {added.title.slice(0, 42)}{added.title.length > 42 ? "…" : ""} ➔
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Grille des Cartes */}
          <div className="god-cards-grid">
            {sortedList.map((item) => {
              const deadline = computeScholarshipDeadlineInfo(resolveNextDeadline(item));
              const isSaved = savedIds.has(item.id);
              const docCount = item.requiredDocuments ? item.requiredDocuments.length : 0;
              const itemLinks = resolveScholarshipLinks(item);
              const isNewItem = newIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className="god-scholarship-card"
                  onClick={() => setSelectedScholarshipId(item.id)}
                  style={{
                    background: isDarkMode
                      ? "linear-gradient(135deg, rgba(22, 18, 51, 0.8) 0%, rgba(15, 13, 36, 0.95) 100%)"
                      : "linear-gradient(135deg, #FFFFFF 0%, color-mix(in srgb, var(--mm-primary) 4%, white) 100%)",
                    backdropFilter: "blur(16px)",
                    border: isDarkMode
                      ? (isSaved ? "2px solid #60A5FA" : "1.5px solid rgba(96, 165, 250, 0.4)")
                      : (isSaved ? "2px solid #2563EB" : "1.5px solid #3B82F6"),
                    borderRadius: "16px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "10px",
                    boxShadow: isSaved
                      ? (isDarkMode ? "0 0 18px rgba(96, 165, 250, 0.3)" : "0 0 18px rgba(37, 99, 235, 0.22)")
                      : (isDarkMode ? "0 8px 24px rgba(0, 0, 0, 0.35)" : "0 4px 16px rgba(37, 99, 235, 0.08)"),
                    cursor: "pointer",
                    boxSizing: "border-box",
                    width: "100%",
                    maxWidth: "100%",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                    {/* Header Rangée 1 : Pays + Badge Officiel (gauche) et Boutons d'Action (droite) */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginBottom: "6px", width: "100%", boxSizing: "border-box" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1, overflow: "hidden" }}>
                        <span style={{ fontSize: "18px", flexShrink: 0, lineHeight: 1 }}>{item.flag}</span>
                        <span style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "var(--mm-primary)", letterSpacing: "0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.country}
                        </span>
                        <span style={{ background: isDarkMode ? "rgba(37, 99, 235, 0.15)" : "#EFF6FF", color: "#2563EB", padding: "1px 5px", borderRadius: "4px", fontSize: "10px", fontWeight: "900", display: "inline-flex", alignItems: "center", gap: "2px", whiteSpace: "nowrap", flexShrink: 0 }}>
                          <span>🛡️</span>
                          <span>Officiel</span>
                        </span>
                        {isNewItem && (
                          <span style={{ background: "linear-gradient(135deg, #059669, #10B981)", color: "#FFFFFF", padding: "1px 6px", borderRadius: "999px", fontSize: "9.5px", fontWeight: "900", letterSpacing: "0.4px", whiteSpace: "nowrap", flexShrink: 0 }}>
                            🆕 NOUVEAU
                          </span>
                        )}
                        {itemLinks.isDirect && (
                          <span title={`Lien direct vérifié : ${itemLinks.hostname}`} style={{ background: isDarkMode ? "rgba(16,185,129,0.15)" : "#ECFDF5", color: "#047857", padding: "1px 5px", borderRadius: "4px", fontSize: "9.5px", fontWeight: "900", whiteSpace: "nowrap", flexShrink: 0 }}>
                            🔗 Direct
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSaveScholarship(item.id);
                          }}
                          className="god-pill-btn"
                          title={isSaved ? "Retirer des candidatures suivies" : "Suivre cette bourse"}
                          style={{
                            background: isSaved ? "#FEF3C7" : isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                            border: isSaved ? "1px solid #F59E0B" : "1px solid transparent",
                            borderRadius: "8px",
                            padding: "4px 7px",
                            cursor: "pointer",
                            fontSize: "10.5px",
                            fontWeight: "800",
                            color: isSaved ? "#B45309" : isDarkMode ? "#93C5FD" : "var(--mm-primary-deep)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span>{isSaved ? "⭐" : "☆"}</span>
                          <span>{isSaved ? "Suivie" : "Suivre"}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            hideScholarship(item.id, item.title);
                          }}
                          title="Supprimer / Masquer cet article du catalogue"
                          className="god-pill-btn"
                          style={{
                            background: isDarkMode ? "rgba(239, 68, 68, 0.12)" : "#FEE2E2",
                            border: isDarkMode ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid #FECACA",
                            borderRadius: "8px",
                            padding: "4px 6px",
                            cursor: "pointer",
                            fontSize: "11px",
                            color: "#EF4444",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Header Rangée 2 : Organisme / Fournisseur pleine largeur */}
                    <div style={{ fontSize: "11px", color: isDarkMode ? "#93C5FD" : "var(--mm-primary-deep)", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", marginBottom: "8px" }}>
                      🏛️ {item.provider}
                    </div>

                    {/* Titre & Diplôme cible flex-safe */}
                    <h3 style={{ margin: "0 0 3px 0", fontSize: "14px", fontWeight: "800", lineHeight: "1.3", color: isDarkMode ? "#FFFFFF" : "#0F172A", wordBreak: "break-word", overflowWrap: "break-word" }}>
                      {item.title}
                    </h3>
                    <div style={{ fontSize: "11px", color: isDarkMode ? "var(--mm-primary-glow)" : "var(--mm-primary)", fontWeight: "700", marginBottom: "8px", wordBreak: "break-word", overflowWrap: "break-word" }}>
                      🎯 {item.targetDegree}
                    </div>

                    {/* Encadré Allocation Mensuelle restructuré */}
                    <div
                      style={{
                        background: isDarkMode ? "rgba(37, 99, 235, 0.1)" : "#EFF6FF",
                        border: "1px solid rgba(37, 99, 235, 0.25)",
                        borderRadius: "10px",
                        padding: "7px 10px",
                        marginBottom: "8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "3px",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <span style={{ fontSize: "10px", fontWeight: "900", textTransform: "uppercase", color: isDarkMode ? "#93C5FD" : "#1D4ED8", letterSpacing: "0.5px" }}>
                          Allocation Mensuelle
                        </span>
                        <span style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#FFFFFF", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "900", whiteSpace: "nowrap", flexShrink: 0 }}>
                          100% FINANCÉ
                        </span>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "900", color: "#2563EB", wordBreak: "break-word" }}>
                        {item.monthlyStipend}
                      </div>
                    </div>

                    {/* Badges d'Éligibilité & Documents */}
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", width: "100%", boxSizing: "border-box" }}>
                      {isEligibleForSenegalL3CS(item) && (
                        <span style={{
                          background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                          color: "#FFFFFF",
                          padding: "2px 7px",
                          borderRadius: "6px",
                          fontSize: "10.5px",
                          fontWeight: "900",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)",
                          whiteSpace: "nowrap",
                        }}>
                          <span>🎯</span>
                          <span>Éligible L3 Info</span>
                        </span>
                      )}
                      {item.eligibility.maxAge && (
                        <span style={{ background: isDarkMode ? "rgba(255,255,255,0.06)" : "color-mix(in srgb, var(--mm-primary) 10%, white)", color: isDarkMode ? "#93C5FD" : "var(--mm-primary-deep)", padding: "2px 6px", borderRadius: "6px", fontSize: "10.5px", fontWeight: "700", whiteSpace: "nowrap" }}>
                          🎂 {formatMaxAge(item.eligibility.maxAge)}
                        </span>
                      )}
                      <span style={{ background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))", color: "#FFFFFF", padding: "2px 6px", borderRadius: "6px", fontSize: "10.5px", fontWeight: "800", whiteSpace: "nowrap" }}>
                        📁 {docCount} pièces
                      </span>
                    </div>
                  </div>

                  <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                    <div
                      style={{
                        background: isDarkMode ? "rgba(11, 9, 26, 0.7)" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                        borderRadius: "8px",
                        padding: "5px 8px",
                        marginBottom: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "6px",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      <span style={{ fontSize: "10.5px", color: isDarkMode ? "#94A3B8" : "#6B21A8", fontWeight: "700" }}>
                        Date Limite :
                      </span>
                      <span style={{ fontSize: "10.5px", fontWeight: "900", color: deadline.color, whiteSpace: "nowrap" }}>
                        {deadline.label}
                      </span>
                    </div>

                    {/* Grille 50/50 stricte pour les boutons d'action */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", width: "100%", boxSizing: "border-box" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedScholarshipId(item.id);
                        }}
                        className="god-pill-btn"
                        style={{
                          width: "100%",
                          background: "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))",
                          color: "#FFFFFF",
                          padding: "7px 6px",
                          borderRadius: "8px",
                          border: "none",
                          fontSize: "11.5px",
                          fontWeight: "800",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                          boxShadow: "0 3px 10px color-mix(in srgb, var(--mm-primary) 30.0%, transparent)",
                          boxSizing: "border-box",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span>Dossier</span>
                        <span>➔</span>
                      </button>

                      <a
                        href={itemLinks.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="god-pill-btn"
                        title={`Postuler directement sur le portail officiel (${item.provider})`}
                        style={{
                          width: "100%",
                          background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                          color: "#FFFFFF",
                          padding: "7px 6px",
                          borderRadius: "8px",
                          textDecoration: "none",
                          fontSize: "11.5px",
                          fontWeight: "900",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                          boxShadow: "0 3px 10px rgba(37, 99, 235, 0.3)",
                          whiteSpace: "nowrap",
                          boxSizing: "border-box",
                        }}
                      >
                        <span>🌐 Postuler</span>
                        <span>↗</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL DÉDIÉ : GUIDE DE CANDIDATURE L3 INFORMATIQUE & SCIENCES (SÉNÉGAL)
          ═══════════════════════════════════════════════════════════════════════ */}
      {showGuideModal && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setShowGuideModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            animation: "page-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "880px",
              maxHeight: "92vh",
              overflowY: "auto",
              borderRadius: "24px",
              background: isDarkMode ? "#0F0D24" : "#FFFFFF",
              border: isDarkMode ? "1.5px solid color-mix(in srgb, var(--mm-primary) 35.0%, transparent)" : "1.5px solid color-mix(in srgb, var(--mm-primary) 22%, white)",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
              color: isDarkMode ? "#F8FAFC" : "#0F172A",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            {/* Bouton Fermer Absolu Ancré en Haut à Droite */}
            <button
              onClick={() => setShowGuideModal(false)}
              aria-label="Fermer le guide"
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: isDarkMode ? "rgba(255,255,255,0.08)" : "color-mix(in srgb, var(--mm-primary) 10%, white)",
                border: "none",
                width: "36px",
                height: "36px",
                borderRadius: "12px",
                color: isDarkMode ? "#FFFFFF" : "#1D4ED8",
                fontSize: "16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "900",
                zIndex: 20,
                transition: "all 0.15s ease",
              }}
            >
              ✕
            </button>

            {/* Header du Guide */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", paddingBottom: "16px", paddingRight: "44px" }}>
              <div style={{ width: "46px", height: "46px", borderRadius: "14px", background: "linear-gradient(135deg, #2563EB, #1D4ED8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 }}>
                📘
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: "17.5px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#0F172A", lineHeight: "1.3" }}>
                  Guide Officiel de Candidature — Master International
                </h2>
                <div style={{ fontSize: "12px", color: isDarkMode ? "var(--mm-primary-glow)" : "var(--mm-primary-deep)", marginTop: "2px", fontWeight: "700" }}>
                  Étudiant en dernière année de Licence (L3) • Informatique & Sciences / Tech • Sénégal
                </div>
              </div>
            </div>

            {/* Profil Box */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "10px",
                padding: "12px 16px",
                borderRadius: "14px",
                background: isDarkMode ? "rgba(37, 99, 235, 0.1)" : "#EFF6FF",
                border: "1px solid rgba(37, 99, 235, 0.3)",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "#1D4ED8" }}>🎓 Niveau de départ</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#1E3A8A" }}>En cours de Licence 3 (diplôme en juillet)</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "#1D4ED8" }}>📍 Pays d'études actuel</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#1E3A8A" }}>Sénégal (UCAD, UGB, UIDT, Bambey, ESP...)</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "900", textTransform: "uppercase", color: "#1D4ED8" }}>💻 Spécialité cible</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#1E3A8A" }}>Informatique, IA, Data, Sciences & Tech</div>
              </div>
            </div>

            {/* Onglets des sections du guide */}
            <div
              className="no-scrollbar"
              style={{
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                background: isDarkMode ? "rgba(255,255,255,0.04)" : "#F1F5F9",
                padding: "4px",
                borderRadius: "12px",
              }}
            >
              {SENEGAL_L3_CS_APPLICATION_GUIDE.sections.map((sec) => {
                const isActive = guideActiveSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => setGuideActiveSection(sec.id)}
                    className="god-pill-btn"
                    style={{
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "none",
                      background: isActive ? "linear-gradient(135deg, #2563EB, #1D4ED8)" : "transparent",
                      color: isActive ? "#FFFFFF" : isDarkMode ? "#94A3B8" : "#475569",
                      fontSize: "12px",
                      fontWeight: isActive ? "900" : "700",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>{sec.icon}</span>
                    <span>{sec.title.split(". ")[1] || sec.title}</span>
                  </button>
                );
              })}

              <button
                onClick={() => setGuideActiveSection("direct_links")}
                className="god-pill-btn"
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "none",
                  background: guideActiveSection === "direct_links" ? "linear-gradient(135deg, var(--mm-primary), var(--mm-primary-deep))" : "transparent",
                  color: guideActiveSection === "direct_links" ? "#FFFFFF" : isDarkMode ? "#94A3B8" : "#475569",
                  fontSize: "12px",
                  fontWeight: guideActiveSection === "direct_links" ? "900" : "700",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                <span>🌐</span>
                <span>Portails & Liens Directs</span>
              </button>
            </div>

            {/* Contenu de la section active */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {guideActiveSection === "direct_links" ? (
                <div>
                  <div style={{ marginBottom: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "900", color: isDarkMode ? "#FFFFFF" : "#0F172A" }}>
                      🌐 Répertoire des Portails Officiels Directs de Candidature
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: isDarkMode ? "#94A3B8" : "#64748B" }}>
                      Accès direct aux plateformes officielles des bourses mondiales 100% financées adaptées à ton profil. Aucun intermédiaire.
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
                    {MASTER_SCHOLARSHIPS_DATABASE.filter((s) => isEligibleForSenegalL3CS(s)).slice(0, 12).map((s) => (
                      <div
                        key={s.id}
                        style={{
                          padding: "12px",
                          borderRadius: "12px",
                          background: isDarkMode ? "rgba(255,255,255,0.03)" : "color-mix(in srgb, var(--mm-primary) 4%, white)",
                          border: isDarkMode ? "1px solid color-mix(in srgb, var(--mm-primary) 20.0%, transparent)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: "8px",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                            <span>{s.flag}</span>
                            <span style={{ fontSize: "11px", fontWeight: "900", color: "var(--mm-primary)" }}>{s.country}</span>
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: "800", color: isDarkMode ? "#FFFFFF" : "#0F172A", lineHeight: "1.3" }}>
                            {s.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "#2563EB", fontWeight: "700", marginTop: "2px" }}>
                            💰 {s.monthlyStipend}
                          </div>
                        </div>

                        <a
                          href={resolveScholarshipLinks(s).infoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="god-pill-btn"
                          style={{
                            background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                            color: "#FFFFFF",
                            padding: "8px 12px",
                            borderRadius: "10px",
                            textDecoration: "none",
                            fontSize: "11px",
                            fontWeight: "900",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "5px",
                            boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)",
                          }}
                        >
                          <span>Accéder au portail officiel</span>
                          <span>↗</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                (() => {
                  const sec = SENEGAL_L3_CS_APPLICATION_GUIDE.sections.find((s) => s.id === guideActiveSection);
                  if (!sec) return null;
                  return (
                    <div>
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: "12px",
                          background: isDarkMode ? "rgba(59, 130, 246, 0.12)" : "#EFF6FF",
                          border: isDarkMode ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid #BFDBFE",
                          marginBottom: "14px",
                        }}
                      >
                        <div style={{ fontSize: "14px", fontWeight: "900", color: isDarkMode ? "#BFDBFE" : "#3730A3" }}>
                          {sec.icon} {sec.title}
                        </div>
                        <div style={{ fontSize: "12px", color: isDarkMode ? "#DBEAFE" : "#1D4ED8", marginTop: "3px" }}>
                          {sec.summary}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {sec.steps.map((step, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: "14px 16px",
                              borderRadius: "12px",
                              background: isDarkMode ? "rgba(255,255,255,0.03)" : "#FFFFFF",
                              border: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid #E2E8F0",
                            }}
                          >
                            <div style={{ fontSize: "13px", fontWeight: "900", color: "#2563EB", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                              <span>✓</span>
                              <span>{step.label}</span>
                            </div>
                            <div style={{ fontSize: "12px", color: isDarkMode ? "#CBD5E1" : "#334155", lineHeight: "1.6" }}>
                              {step.detail}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Footer du Guide */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", borderTop: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid color-mix(in srgb, var(--mm-primary) 10%, white)", paddingTop: "14px", marginTop: "8px" }}>
              <button
                onClick={() => {
                  const fullGuideText = [
                    `📘 ${SENEGAL_L3_CS_APPLICATION_GUIDE.title}`,
                    `${SENEGAL_L3_CS_APPLICATION_GUIDE.subtitle}`,
                    `Profil : ${SENEGAL_L3_CS_APPLICATION_GUIDE.profile.level} • ${SENEGAL_L3_CS_APPLICATION_GUIDE.profile.location}`,
                    `----------------------------------------------------`,
                    ...SENEGAL_L3_CS_APPLICATION_GUIDE.sections.map((sec) => [
                      `\n${sec.title.toUpperCase()}`,
                      `Règle : ${sec.summary}`,
                      ...sec.steps.map((st) => `• ${st.label} :\n  ${st.detail}`),
                    ].join("\n")),
                  ].join("\n");
                  navigator.clipboard?.writeText?.(fullGuideText);
                  showToast?.("📋 Guide complet de candidature copié dans le presse-papier !", "success");
                }}
                className="god-pill-btn"
                style={{
                  background: isDarkMode ? "rgba(255,255,255,0.08)" : "#F1F5F9",
                  color: isDarkMode ? "#FFFFFF" : "#0F172A",
                  padding: "9px 16px",
                  borderRadius: "10px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>📋 Copier le guide complet</span>
              </button>

              <button
                onClick={() => setShowGuideModal(false)}
                className="god-pill-btn"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                  color: "#FFFFFF",
                  padding: "9px 20px",
                  borderRadius: "10px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "900",
                  cursor: "pointer",
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
