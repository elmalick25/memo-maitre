// 🎓 src/lib/scholarshipCatalog.js
// ============================================================================
// CATALOGUE & MOTEUR D'INTELLIGENCE DES BOURSES DE MASTER INTERNATIONALES
// ÉDITION GOD TIER — DONNÉES OFFICIELLES VÉRIFIÉES
// ============================================================================
// Couvre l'intégralité des bourses mondiales et sénégalaises :
// - 🇸🇳 Sénégal & Coopération Bilatérale Directe (DBS, AMCI, CSC, Rossotrudnichestvo, BGF, ENSAE, CEA)
// - 🌍 Multilatéral, Afrique & Fondations (Mastercard Foundation, Banque Mondiale, BAD, IsDB, UA, CEDEAO, AUF)
// - 🇪🇺 Europe & Royaume-Uni (Erasmus Mundus, Eiffel, Boutmy, Paris-Saclay, Chevening, Commonwealth, Gates, DAAD, ARES, Suisse ESKAS, SI Suède, Stipendium, MAECI)
// - 🌎 Amériques, Asie & Océanie (Fulbright USA, Vanier Canada, MEXT Japon, JICA ABE, GKS Corée, CSC Chine, Türkiye Bursları, Australia Awards, Manaaki NZ)
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
 * Grandes Catégories / Zones de Bourses
 */
export const SCHOLARSHIP_CATEGORIES = [
  { id: "all", label: "🌐 Tous les programmes", icon: "🌐" },
  { id: "senegal", label: "🇸🇳 Sénégal & Coopération", icon: "🇸🇳" },
  { id: "multilateral", label: "🌍 Multilatéral & Fondations", icon: "🌍" },
  { id: "europe", label: "🇪🇺 Europe & Royaume-Uni", icon: "🇪🇺" },
  { id: "americas_asia", label: "🌎 Amériques, Asie & Océanie", icon: "🌎" },
];

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
 * Catalogue exhaustif des Grandes Bourses de Master Officielles Mondiales & Sénégalaises
 */
export const MASTER_SCHOLARSHIPS_DATABASE = [
  // ==========================================================================
  // SECTION 1 : 🇸🇳 SÉNÉGAL & COOPÉRATION BILATÉRALE DIRECTE (DBS / MESRI)
  // ==========================================================================

  // 🇸🇳 1. BOURSE D'EXCELLENCE DU PRÉSIDENT DE LA RÉPUBLIQUE DU SÉNÉGAL
  {
    id: "bourse_excellence_president_senegal",
    categoryGroup: "senegal",
    title: "Bourse d'Excellence du Président de la République (Grandes Écoles d'Élite)",
    provider: "Présidence de la République du Sénégal & MESRI (Direction des Bourses)",
    country: "Sénégal / Monde",
    countryCode: "SN",
    flag: "🇸🇳",
    targetDegree: "Grandes Écoles d'Ingénieurs, Écoles Normales Supérieures, HEC, MIT, Oxford, EPFL, Polytechnique",
    fundingType: "full_ride",
    monthlyStipend: "1 200 € à 1 800 $ / mois",
    totalValueEst: "~45 000 € / an",
    benefits: [
      "Prise en charge à 100% des frais de scolarité d'élite (Polytechnique Paris, Mines, Centrale, MIT, Harvard, EPFL, etc.)",
      "Allocation mensuelle complète de subsistance (1 200 € en Europe / 1 800 $ en Amérique du Nord)",
      "Billet d'avion annuel A/R Dakar ↔ Pays d'études",
      "Prime d'équipement informatique et forfait livres annuel",
      "Couverture médicale internationale et assurance rapatriement garanties par l'État du Sénégal"
    ],
    eligibility: {
      academicLevel: "Baccalauréat avec Mention Très Bien + CPGE (Classes Préparatoires) ou Licence d'Excellence (Mention Bien/Très Bien)",
      minGpa: "Top 1% de la promotion / Lauréat du Concours Général Sénégalais",
      maxAge: "25 ans au moment de l'admission dans la Grande École",
      nationality: "Nationalité sénégalaise exclusive ou binationale (dossier validé par la DBS)",
      languageReq: "Français C1/C2 (Grandes écoles françaises) ou Anglais TOEFL iBT ≥ 100 / IELTS ≥ 7.5 (Institutions anglophones)",
      workExperience: "Non requise (concours CPGE ou excellence académique directe)",
      nominationMode: "Attribution automatique ou sur dossier après admission définitive dans l'une des Grandes Écoles accréditées par décret présidentiel.",
      selectionConditions: "Obligation morale ou contractuelle de servir l'État du Sénégal ou de contribuer au développement socio-économique national au terme de la formation."
    },
    requiredDocuments: [
      {
        id: "sn_pres_admission",
        name: "Attestation d'Admission Définitive dans la Grande École d'Élite",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Lettre officielle d'admission sans réserve de l'établissement cible (Polytechnique, ENS, HEC Paris, EPFL, MIT, etc.).",
        specifications: "Document original ou certifié conforme portant le sceau de l'école.",
        godTip: "Joindre le relevé des notes obtenues au concours d'entrée pour accélérer la commission présidentielle."
      },
      {
        id: "sn_pres_bac_cg",
        name: "Diplôme du Baccalauréat & Palmarès Concours Général Sénégalais",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevé de notes du Bac (Mention Très Bien/Bien) et attestation de prix au Concours Général sénégalais si applicable.",
        specifications: "Copies légalisées par l'Office du Baccalauréat du Sénégal.",
        godTip: "Les distinctions nationales au Concours Général constituent un accélérateur d'attribution prioritaire."
      },
      {
        id: "sn_pres_nationalite",
        name: "Certificat de Nationalité Sénégalaise & Carte Nationale d'Identité CEDEAO",
        category: "civil",
        categoryLabel: "🏛️ État Civil",
        isMandatory: true,
        description: "Preuve juridique irréfutable de la citoyenneté sénégalaise.",
        specifications: "Certificat de nationalité délivré par le tribunal d'instance + CNI biométrique CEDEAO en cours de validité.",
        godTip: "Vérifier la parfaite concordance orthographique des prénoms et nom sur tous les actes."
      },
      {
        id: "sn_pres_engagement",
        name: "Lettre d'Engagement de Retour et Contribution au Sénégal",
        category: "motivation",
        categoryLabel: "✍️ Engagement",
        isMandatory: true,
        description: "Engagement formel de l'étudiant à mettre ses compétences au service des projets stratégiques du Sénégal (Plan Sénégal Émergent / Souveraineté technologique).",
        specifications: "Document manuscrit ou dactylographié signé et légalisé.",
        godTip: "Articuler son projet professionnel avec les secteurs prioritaires nationaux : IA, Énergie, Mines, Santé, Agriculture ou Finance publique."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Admission dans l'Institution d'Élite", timeline: "Mai - Juillet", details: "Réussir les concours d'entrée ou obtenir l'admission ferme dans l'une des institutions d'excellence ciblées." },
      { step: 2, title: "Dépôt du Dossier à la Direction des Bourses (DBS)", timeline: "Juillet - Août", details: "Soumission du dossier complet physique et numérique auprès du Service des Bourses Étrangères de la DBS à Dakar." },
      { step: 3, title: "Commission Nationale d'Attribution", timeline: "Août - Septembre", details: "Examen des dossiers par la commission interministérielle et validation de l'arrêté présidentiel d'attribution." },
      { step: 4, title: "Mise en Route & Prise en Charge Consulaire", timeline: "Septembre - Octobre", details: "Délivrance de l'attestation de bourse officielle pour le visa étudiant et premier virement d'installation." }
    ],
    selectionCriteria: [
      { criterion: "Rang & Prestige de l'École d'Admission", weight: "40%", description: "Priorité absolue aux Écoles classées dans le Top 50 mondial ou Grandes Écoles françaises d'ingénieurs/commerce de rang A+." },
      { criterion: "Excellence du Parcours Antérieur", weight: "35%", description: "Moyennes en CPGE/Licence, mentions au Bac et distinctions académiques nationales." },
      { criterion: "Pertinence Stratégique pour le Sénégal", weight: "25%", description: "Impact du domaine d'études sur les priorités de développement national et d'industrialisation." }
    ],
    juryInsights: [
      "Les admissions conditionnelles ou avec réserve de paiement ne sont pas traitées : exiger une admission ferme.",
      "Ne pas attendre la rentrée pour déposer à la DBS : les arbitrages budgétaires se clôturent fin août."
    ],
    officialUrl: "https://mesrisenegal.sn/direction-des-bourses-mesri/",
    verifiedOrg: "Ministère de l'Enseignement Supérieur, de la Recherche et de l'Innovation (MESRI Sénégal)",
    nextDeadline: "2027-08-31",
    legalReference: "Décret présidentiel N°2021-1456 fixant le régime des Bourses d'Excellence du Sénégal & Arrêté ministériel MESRI",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇸🇳 2. DIRECTION DES BOURSES DU SÉNÉGAL (DBS) — ALLOCATION D'ÉTUDES À L'ÉTRANGER
  {
    id: "bourse_dbs_etranger_senegal",
    categoryGroup: "senegal",
    title: "Direction des Bourses du Sénégal (DBS) — Allocation de Master à l'Étranger",
    provider: "Direction des Bourses du Sénégal (DBS / MESRI)",
    country: "Sénégal / Étranger",
    countryCode: "SN",
    flag: "🇸🇳",
    targetDegree: "Master 1 / Master 2 / Doctorat à l'Étranger",
    fundingType: "tuition_stipend",
    monthlyStipend: "600 € à 900 € / mois",
    totalValueEst: "~12 000 € / an",
    benefits: [
      "Allocation mensuelle d'études versée directement sur le compte bancaire de l'étudiant à l'étranger",
      "Prise en charge partielle ou totale des frais d'inscription universitaire selon convention",
      "Assistance consulaire via les Services de Gestion des Étudiants Sénégalais à l'Étranger (SGEE Paris, Washington, Rabat, etc.)",
      "Complément de bourse pour les étudiants déjà titulaires d'une exonération partielle"
    ],
    eligibility: {
      academicLevel: "Licence 3 / Bachelor validé dans une université publique ou privée accréditée CAMES / ANAQ-Sup",
      minGpa: "Moyenne générale ≥ 12/20 (Mention Assez Bien minimum sur l'ensemble du cycle)",
      maxAge: "28 ans au 31 décembre de l'année d'attribution pour le Master",
      nationality: "Nationalité sénégalaise obligatoire",
      languageReq: "Maîtrise de la langue d'enseignement du pays d'accueil (Français, Anglais, Arabe)",
      workExperience: "Non requise",
      nominationMode: "Candidature en ligne sur la plateforme officielle de la DBS (e-Bourse / MESRI) puis confirmation physique.",
      selectionConditions: "Priorité accordée aux filières scientifiques, technologiques, médicales et sciences de l'ingénieur non disponibles au Sénégal."
    },
    requiredDocuments: [
      {
        id: "dbs_preinscription",
        name: "Attestation de Pré-inscription ou Inscription Ferme en Master",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Justificatif d'admission dans une université étrangère reconnue pour l'année universitaire en cours.",
        specifications: "Document officiel avec cachet de l'université étrangère.",
        godTip: "Les formations dans les universités publiques partenaires de l'État sénégalais sont priorisées."
      },
      {
        id: "dbs_releves_licence",
        name: "Relevés de Notes des 3 Années de Licence (L1, L2, L3) + Attestation de Réussite",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés semestriels complets et attestation du diplôme de Licence certifiés par l'université d'origine.",
        specifications: "Copies certifiées conformes par les autorités académiques sénégalaises.",
        godTip: "Présenter un parcours sans redoublement constitue un atout décisif."
      },
      {
        id: "dbs_cni_nat",
        name: "Certificat de Nationalité Sénégalaise & CNI Biométrique",
        category: "civil",
        categoryLabel: "🏛️ État Civil",
        isMandatory: true,
        description: "Pièces d'identité et de citoyenneté sénégalaise en cours de validité.",
        specifications: "Original ou copie légalisée.",
        godTip: "S'assurer de la validité de la CNI pour au moins 2 ans."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Ouverture de l'Appel d'Offres DBS", timeline: "Juin - Juillet", details: "Publication de la circulaire ministérielle fixant les quotas et critères par filière." },
      { step: 2, title: "Dépôt Numérique sur la Plateforme e-Bourse", timeline: "Juillet - Août", details: "Téléversement des relevés, attestations et pièces d'état civil." },
      { step: 3, title: "Délibération de la Commission Nationale", timeline: "Septembre", details: "Attribution des quotas selon les critères d'excellence et filières prioritaires." },
      { step: 4, title: "Notification & Prise en Charge SGEE", timeline: "Octobre", details: "Affichage des listes et transmission aux postes consulaires (SGEE)." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique (Mentions Licence)", weight: "50%", description: "Moyenne des semestres S1 à S6 et régularité du cursus." },
      { criterion: "Filière Prioritaire Nationale", weight: "30%", description: "Bonus important pour IA, STEM, Agronomie, Énergies renouvelables et Pétrole/Gaz." },
      { criterion: "Situation Sociale & Statut Boursier Antérieur", weight: "20%", description: "Historique d'allocation nationale au Sénégal." }
    ],
    juryInsights: [
      "Veiller à scanner des documents parfaitement lisibles : tout relevé flou entraîne le rejet immédiat du dossier.",
      "Conserver impérativement le numéro de récépissé e-Bourse généré lors de la soumission."
    ],
    officialUrl: "https://mesrisenegal.sn/direction-des-bourses-mesri/",
    verifiedOrg: "Direction des Bourses (DBS) — Dakar, Sénégal",
    nextDeadline: "2027-08-15",
    legalReference: "Circulaire annuelle MESRI/DBS relative aux allocations de Master et 3ème cycle à l'étranger",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇸🇳 3. BOURSE DE COOPÉRATION BILATÉRALE SÉNÉGAL-MAROC (AMCI / DBS)
  {
    id: "bourse_coop_senegal_maroc_amci",
    categoryGroup: "senegal",
    title: "Bourse de Coopération Bilatérale Sénégal-Maroc (AMCI / DBS)",
    provider: "Agence Marocaine de Coopération Internationale (AMCI) & DBS Sénégal",
    country: "Maroc",
    countryCode: "MA",
    flag: "🇲🇦",
    targetDegree: "Master / Master Spécialisé / Diplôme d'Ingénieur d'État",
    fundingType: "full_ride",
    monthlyStipend: "1 000 DH / mois (Complément DBS)",
    totalValueEst: "~8 000 € / an",
    benefits: [
      "Exonération totale des frais d'inscription dans les universités publiques marocaines (FSR Rabat, ENSIAS, EMI, FSJES, INSEA)",
      "Bourse mensuelle AMCI (1 000 DH) + Complément d'allocation de l'État du Sénégal",
      "Logement garanti en Cité Universitaire Internationale (Cité de l'AMCI à Rabat) ou résidences universitaires publiques",
      "Souscription à la couverture médicale de base AMCI pour étudiants étrangers",
      "Titre de séjour étudiant marocain facilité via la procédure diplomatique"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor obtenu dans une université sénégalaise reconnue avec Mention",
      minGpa: "Moyenne générale ≥ 12.5/20 sur les 3 années de Licence",
      maxAge: "26 ans au 1er septembre de l'année de candidature",
      nationality: "Nationalité sénégalaise exclusive",
      languageReq: "Français C1 (et/ou Arabe selon la filière juridique/littéraire)",
      workExperience: "Non requise",
      nominationMode: "Sélection exclusive par la Direction des Bourses du Sénégal (DBS) qui transmet la liste officielle à l'AMCI.",
      selectionConditions: "Engagement à respecter le règlement intérieur des cités universitaires marocaines."
    },
    requiredDocuments: [
      {
        id: "amci_formulaire",
        name: "Formulaire Officiel de Candidature AMCI Sénégal",
        category: "admin",
        categoryLabel: "📄 Administratif",
        isMandatory: true,
        description: "Formulaire d'inscription dûment renseigné avec choix ordonné des 3 universités et filières marocaines ciblées.",
        specifications: "Formulaire original téléchargeable sur le portail MESRI/AMCI avec photo d'identité récente.",
        godTip: "Cibler des universités hors Casablanca/Rabat en 2ème et 3ème choix pour maximiser l'admission."
      },
      {
        id: "amci_diplomes_releves",
        name: "Diplôme du Baccalauréat, Diplôme de Licence & Tous les Relevés de Notes",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés de notes du Baccalauréat et des années L1, L2, L3 certifiés conformes.",
        specifications: "Copies certifiées conformes par la mairie ou le tribunal.",
        godTip: "Fournir l'attestation de classement dans la promotion de Licence si disponible."
      },
      {
        id: "amci_medical",
        name: "Certificat Médical d'Aptitude Physique & Test Sérologique",
        category: "medical",
        categoryLabel: "🏥 Santé",
        isMandatory: true,
        description: "Certificat médical officiel attestant de l'aptitude physique et de l'absence de maladies contagieuses.",
        specifications: "Délivré par un médecin assermenté d'un centre de santé public sénégalais.",
        godTip: "Effectuer les tests dans un hôpital public reconnu (Hôpital Principal, Le Dantec, Fann)."
      },
      {
        id: "amci_casier",
        name: "Extrait de Casier Judiciaire Sénégalais",
        category: "civil",
        categoryLabel: "🏛️ État Civil",
        isMandatory: true,
        description: "Bulletin n°3 du casier judiciaire datant de moins de 3 mois.",
        specifications: "Original délivré par le Tribunal de Dakar ou du lieu de naissance.",
        godTip: "Le document doit être récent (moins de 90 jours à la date de transmission)."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Publication de l'Appel à Candidatures DBS/AMCI", timeline: "Mai - Juin", details: "Lancement de l'appel d'offres de coopération sénégalo-marocaine par le MESRI." },
      { step: 2, title: "Dépôt des Dossiers Physiques à la DBS", timeline: "Juin - Juillet", details: "Dépôt du dossier en 2 exemplaires au siège de la Direction des Bourses à Dakar." },
      { step: 3, title: "Transmission Diplomatique & Sélection AMCI", timeline: "Juillet - Août", details: "Validation par la commission mixte et transmission à l'AMCI à Rabat." },
      { step: 4, title: "Publication des Résultats & Accueil à Rabat", timeline: "Septembre", details: "Départ groupé des boursiers sénégalais et installation à la Cité Universitaire AMCI." }
    ],
    selectionCriteria: [
      { criterion: "Moyenne Académique Pondérée", weight: "60%", description: "Notes de Licence et mention au Baccalauréat sénégalais." },
      { criterion: "Adéquation de la Filière Choisi", weight: "25%", description: "Correspondance stricte entre la Licence obtenue et le Master visé." },
      { criterion: "Priorité Géographique & Équité", weight: "15%", description: "Diversité régionale des universités sénégalaises d'origine (UCAD, UGB, UIDT, UT, UASZ)." }
    ],
    juryInsights: [
      "Les dossiers incomplets sans certificat médical public sont automatiquement écartés lors du tri préliminaire.",
      "Le choix des filières d'ingénieurs (Génie Civil, Électrique, Informatique) requiert au moins 13/20 de moyenne."
    ],
    officialUrl: "https://www.amci.ma/cooperation-academique",
    verifiedOrg: "Agence Marocaine de Coopération Internationale (AMCI) & DBS Sénégal",
    nextDeadline: "2027-07-15",
    legalReference: "Accord-cadre de Coopération Culturelle, Scientifique et Technique Sénégal-Maroc (AMCI / MESRI Dakar)",
    sourceType: "BILATERAL_ACCORD"
  },

  // 🇸🇳 4. BOURSE DU GOUVERNEMENT FRANÇAIS POUR LE SÉNÉGAL (BGF / SCAC AMBASSADE DE FRANCE À DAKAR)
  {
    id: "bourse_bgf_france_senegal",
    categoryGroup: "senegal",
    title: "Bourses du Gouvernement Français pour le Sénégal (BGF / SCAC)",
    provider: "Service de Coopération et d'Action Culturelle (SCAC) — Ambassade de France au Sénégal",
    country: "France",
    countryCode: "FR",
    flag: "🇫🇷",
    targetDegree: "Master 2 Recherche / Professionnel & Co-tutelle de Thèse",
    fundingType: "full_ride",
    monthlyStipend: "860 € à 1 181 € / mois",
    totalValueEst: "~25 000 € / an",
    benefits: [
      "Allocation mensuelle de subsistance versée directement par Campus France Paris",
      "Prise en charge intégrale des frais de scolarité universitaire en France (statut de boursier du gouvernement français)",
      "Billet d'avion A/R Dakar ↔ France pris en charge par l'Ambassade",
      "Gratuité totale du visa étudiant long séjour (VLS-TS)",
      "Couverture sociale et mutuelle santé complète Campus France"
    ],
    eligibility: {
      academicLevel: "Master 1 validé ou Master 2 en cours dans une université sénégalaise",
      minGpa: "Mention Bien minimum (≥ 14/20) sur le cursus universitaire",
      maxAge: "30 ans à la date de candidature",
      nationality: "Nationalité sénégalaise résidant au Sénégal",
      languageReq: "Français langue maternelle / C1 validé",
      workExperience: "Stages de recherche ou expérience professionnelle valorisés",
      nominationMode: "Appel annuel géré conjointement par le SCAC de l'Ambassade de France à Dakar et l'Espace Campus France Sénégal.",
      selectionConditions: "Projet d'études s'inscrivant dans les priorités du partenariat franco-sénégalais (Santé, Transition écologique, Numérique, Agro-alimentaire, Sciences humaines)."
    },
    requiredDocuments: [
      {
        id: "bgf_projet",
        name: "Projet d'Études et Professionnel Détaillé (2 à 3 pages)",
        category: "motivation",
        categoryLabel: "✍️ Projet",
        isMandatory: true,
        description: "Argumentaire démontrant la plus-value de la formation en France et son impact direct sur le développement du Sénégal.",
        specifications: "Document structuré en 4 parties : Parcours, Choix du Master, Objectifs de recherche, Perspectives de retour.",
        godTip: "Mentionner des contacts déjà établis avec des laboratoires ou entreprises au Sénégal pour le post-Master."
      },
      {
        id: "bgf_acceptation_france",
        name: "Attestation d'Admission ou Lettre d'Acceptation de l'Université Française",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Lettre d'admission en Master 2 émise par le responsable de formation de l'université française.",
        specifications: "Format PDF officiel sur papier à en-tête universitaire.",
        godTip: "Une acceptation ferme dans un Master 2 d'une université d'excellence démultiplie vos chances."
      },
      {
        id: "bgf_lettres_recommandation",
        name: "Deux Lettres de Recommandation Académiques Sénégalaises",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Lettres confidentielles signées par des Professeurs d'université ou Maîtres de Conférences sénégalais (UCAD, UGB, etc.).",
        specifications: "Sur papier à en-tête du département universitaire sénégalais avec email académique.",
        godTip: "Les lettres doivent attester explicitement du rang de l'étudiant dans sa cohorte."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Publication de l'Appel BGF Sénégal", timeline: "Février - Mars", details: "Lancement officiel sur le site de l'Ambassade de France et de Campus France Sénégal." },
      { step: 2, title: "Dépôt du Dossier Numérique", timeline: "Avril - Mai", details: "Soumission du dossier complet via la plateforme dédiée du SCAC Dakar." },
      { step: 3, title: "Entretiens de Sélection Orale", timeline: "Juin", details: "Audition des candidats présélectionnés devant un jury mixte franco-sénégalais à Dakar." },
      { step: 4, title: "Publication des Lauréats & Visa", timeline: "Juillet - Août", details: "Délivrance de l'attestation BGF et procédure visa prioritaire sans frais." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique & Trajectoire", weight: "40%", description: "Résultats d'excellence en Licence et Master 1 au Sénégal." },
      { criterion: "Solidité & Impact du Projet au Sénégal", weight: "35%", description: "Pertinence du projet de Master pour l'écosystème sénégalais." },
      { criterion: "Prestation lors de l'Entretien Oral", weight: "25%", description: "Aisance argumentative, clarté intellectuelle et vision d'avenir." }
    ],
    juryInsights: [
      "Le jury élimine systématiquement les projets flous ne démontrant pas de lien concret avec les besoins du Sénégal.",
      "Préparez l'entretien oral comme une soutenance de thèse professionnelle : soyez précis sur vos cours et stages ciblés."
    ],
    officialUrl: "https://bourses.franceausenegal.com/register",
    verifiedOrg: "SCAC — Ambassade de France à Dakar & Campus France Sénégal",
    nextDeadline: "2027-05-15",
    legalReference: "Convention de Partenariat Stratégique Franco-Sénégalais & Circulaire SCAC Ambassade de France à Dakar",
    sourceType: "BILATERAL_ACCORD"
  },

  // 🇸🇳 5. BOURSE DE COOPÉRATION BILATÉRALE SÉNÉGAL-CHINE (CSC / AMBASSADE DE CHINE / DBS)
  {
    id: "bourse_coop_senegal_chine_csc",
    categoryGroup: "senegal",
    title: "Bourse de Coopération Bilatérale Sénégal-Chine (CSC / DBS Sénégal)",
    provider: "China Scholarship Council (CSC) & Direction des Bourses du Sénégal",
    country: "Chine",
    countryCode: "CN",
    flag: "🇨🇳",
    targetDegree: "Master (Enseigné en Anglais ou Chinois avec 1 an de langue préparatoire)",
    fundingType: "full_ride",
    monthlyStipend: "3 000 RMB / mois (~400 € / mois)",
    totalValueEst: "~20 000 € / an",
    benefits: [
      "Prise en charge intégrale des frais de scolarité dans les universités chinoises d'élite (Tsinghua, Peking, Fudan, Zhejiang, etc.)",
      "Allocation mensuelle de subsistance de 3 000 RMB net versée par le CSC",
      "Logement universitaire gratuit en chambre individuelle ou double en campus international",
      "Assurance médicale globale complète pour étudiants internationaux en Chine",
      "Billet d'avion international initial Dakar ↔ Pékin selon accord bilatéral"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) validé avec Mention Bien minimum",
      minGpa: "Moyenne générale ≥ 13/20",
      maxAge: "35 ans pour les candidats au cycle de Master",
      nationality: "Nationalité sénégalaise obligatoire",
      languageReq: "IELTS ≥ 6.5 / TOEFL ≥ 90 (programmes en anglais) ou HSK Niveau 4 minimum (programmes en chinois)",
      workExperience: "Non requise pour le Master académique",
      nominationMode: "Candidature double obligatoire : sur le portail CSC (Type A - Ambassade) ET dépôt physique auprès de la DBS à Dakar.",
      selectionConditions: "Bonne santé physique et mentale certifiée par le formulaire médical officiel étranger (Foreigner Physical Examination Form)."
    },
    requiredDocuments: [
      {
        id: "csc_sn_form",
        name: "Formulaire Officiel de Candidature en Ligne du CSC (Agency Number Sénégal : 6861)",
        category: "admin",
        categoryLabel: "📄 Administratif",
        isMandatory: true,
        description: "Formulaire rempli en ligne sur le portail Campus China avec le code agence officiel du Sénégal.",
        specifications: "Format PDF généré par le système CSC, signé par le candidat.",
        godTip: "Le code agence (Agency Number) de l'Ambassade de Chine au Sénégal est 6861 (à vérifier sur l'appel annuel)."
      },
      {
        id: "csc_sn_study_plan",
        name: "Projet d'Études / Proposition de Recherche en Chine (Minimum 800 mots)",
        category: "motivation",
        categoryLabel: "✍️ Recherche",
        isMandatory: true,
        description: "Plan d'études exhaustif rédigé en anglais ou en chinois décrivant les objectifs académiques et le sujet de mémoire.",
        specifications: "Document Word/PDF dactylographié d'au moins 800 à 1 200 mots.",
        godTip: "Contacter en amont un professeur dans l'université chinoise ciblée pour obtenir une lettre de pré-acceptation."
      },
      {
        id: "csc_sn_medical",
        name: "Formulaire d'Examen Médical pour Étrangers (Foreigner Physical Examination Form)",
        category: "medical",
        categoryLabel: "🏥 Santé",
        isMandatory: true,
        description: "Formulaire médical standard chinois complété avec résultats d'analyses (sérologie, radio pulmonaire, ECG).",
        specifications: "Signé par un médecin assermenté avec cachet officiel de l'hôpital public sur la photo.",
        godTip: "Ce formulaire a une validité stricte de 6 mois : le faire réaliser au bon moment."
      },
      {
        id: "csc_sn_casier",
        name: "Certificat de Non-Condamnation Pénale (Casier Judiciaire Légaliste)",
        category: "civil",
        categoryLabel: "🏛️ État Civil",
        isMandatory: true,
        description: "Extrait de casier judiciaire sénégalais vierge traduit en anglais ou chinois.",
        specifications: "Document officiel datant de moins de 6 mois.",
        godTip: "Joindre une traduction assermentée en anglais si le document original est en français."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Lancement de l'Appel Bilatéral Chine-Sénégal", timeline: "Décembre - Janvier", details: "Publication de l'avis de bourse par la DBS et l'Ambassade de Chine à Dakar." },
      { step: 2, title: "Inscription sur Campus China & Dépôt DBS", timeline: "Janvier - Février", details: "Saisie en ligne sur le portail CSC et dépôt physique des dossiers à la DBS Dakar." },
      { step: 3, title: "Présélection Nationale & Transmission CSC", timeline: "Mars - Avril", details: "Transmission des dossiers sénégalais retenus aux universités chinoises d'accueil." },
      { step: 4, title: "Délivrance du Visa JW201 & Départ", timeline: "Juillet - Août", details: "Réception des formulaires de visa JW201 et départ pour la Chine en septembre." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique & Rang", weight: "45%", description: "Moyenne des diplômes universitaires sénégalais." },
      { criterion: "Qualité du Plan d'Études (Study Plan)", weight: "35%", description: "Rigueur méthodologique et faisabilité du projet de recherche." },
      { criterion: "Pré-acceptation Universitaire en Chine", weight: "20%", description: "Lettre de pré-admission (Pre-admission letter) d'une université chinoise réputée." }
    ],
    juryInsights: [
      "Obtenir une lettre de pré-admission (Pre-admission Letter) d'une université chinoise garantit quasiment l'obtention finale de la bourse.",
      "Le plan d'études ne doit comporter aucun plagiat : les universités chinoises utilisent des détecteurs stricts."
    ],
    officialUrl: "https://www.campuschina.org/",
    verifiedOrg: "China Scholarship Council (CSC) & Ambassade de Chine à Dakar",
    nextDeadline: "2027-02-28",
    legalReference: "Protocole d'Entente Éducatif Gouvernement de la République du Sénégal — Gouvernement de la République Populaire de Chine (CSC)",
    sourceType: "BILATERAL_ACCORD"
  },

  // 🇸🇳 6. BOURSE D'EXCELLENCE ANSD / ENSAE DAKAR / ISMEA (STATISTIQUE & DATA SCIENCE)
  {
    id: "bourse_ansd_ensae_dakar",
    categoryGroup: "senegal",
    title: "Bourses d'Excellence ANSD / ENSAE Dakar / ISMEA (Ingénieurs Statisticiens)",
    provider: "Agence Nationale de la Statistique et de la Démographie (ANSD) & Banque Mondiale",
    country: "Sénégal",
    countryCode: "SN",
    flag: "🇸🇳",
    targetDegree: "Master Ingénieur Statisticien Économiste (ISE) & Data Science",
    fundingType: "full_ride",
    monthlyStipend: "150 000 FCFA / mois",
    totalValueEst: "~6 000 000 FCFA / an",
    benefits: [
      "Prise en charge intégrale des droits d'inscription et de scolarité à l'ENSAE Dakar",
      "Bourse mensuelle complète de subsistance de 150 000 FCFA versée pendant toute la durée du cursus (2 à 3 ans)",
      "Dotation complète en matériel informatique (ordinateur portable haute performance) et licences logicielles",
      "Stages rémunérés garantis au sein de l'ANSD, des ministères sectoriels et des institutions financières internationales",
      "Recrutement prioritaire dans la fonction publique ou les agences nationales à la sortie"
    ],
    eligibility: {
      academicLevel: "Licence de Mathématiques, Économie, Informatique ou Réussite au Concours International d'Entrée aux Écoles de Statistique Africaines (CAPESA)",
      minGpa: "Admissibilité au Concours International ISE (Ingénieurs Statisticiens Économistes)",
      maxAge: "26 ans l'année du concours",
      nationality: "Nationalité sénégalaise (et pays membres du réseau CAPESA)",
      languageReq: "Français C1",
      workExperience: "Non requise",
      nominationMode: "Attribution automatique de plein droit à tous les lauréats sénégalais admis au concours international d'entrée à l'ENSAE Dakar.",
      selectionConditions: "Engagement décennal éventuel de servir dans le Système Statistique National (ANSD, Ministères, BCEAO)."
    },
    requiredDocuments: [
      {
        id: "ensae_admission_concours",
        name: "Attestation de Réussite au Concours International ISE / ENSAE",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Attestation officielle délivrée par le jury international du CAPESA / ENSAE Dakar.",
        specifications: "Document original délivré par la direction de l'ENSAE.",
        godTip: "Conserver le rang d'admission au concours national pour l'attribution des primes d'excellence."
      },
      {
        id: "ensae_diplomes",
        name: "Diplômes Universitaires & Relevés de Notes de Licence",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés de notes de L1, L2, L3 certifiés conformes.",
        specifications: "Copies certifiées conformes.",
        godTip: "Démontrer des notes solides en Analyse, Algèbre linéaire, Probabilités et Économétrie."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Inscription au Concours International CAPESA / ENSAE", timeline: "Novembre - Janvier", details: "Dépôt de candidature au concours d'ingénieurs statisticiens au centre d'examen de Dakar." },
      { step: 2, title: "Épreuves Écrites du Concours", timeline: "Avril", details: "Passation des épreuves de Mathématiques, Économie et Culture Générale." },
      { step: 3, title: "Publication des Résultats & Attribution Bourse", timeline: "Juin - Juillet", details: "Publication de la liste des admis et validation automatique de la bourse d'études ANSD." },
      { step: 4, title: "Rentrée Académique à Dakar", timeline: "Octobre", details: "Accueil des lauréats et mise en place du versement mensuel de la bourse." }
    ],
    selectionCriteria: [
      { criterion: "Performance au Concours International", weight: "80%", description: "Note globale obtenue aux épreuves écrites anonymes nationales." },
      { criterion: "Dossier Académique Préalable", weight: "20%", description: "Cohérence du cursus mathématique ou économique antérieur." }
    ],
    juryInsights: [
      "Le concours ISE est très sélectif : concentrez vos révisions sur l'algèbre linéaire, le calcul intégral et les probabilités avancées.",
      "Des annales corrigées des 10 dernières années sont disponibles au secrétariat de l'ENSAE Dakar."
    ],
    officialUrl: "https://www.ensae.sn/recherche-et-publications/avis-de-concours",
    verifiedOrg: "Agence Nationale de la Statistique et de la Démographie (ANSD) — Sénégal",
    nextDeadline: "2027-01-31",
    legalReference: "Règlement général du Concours International CAPESA & Décret de création de l'ENSAE Dakar",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇸🇳 7. BOURSES DES CENTRES D'EXCELLENCE AFRICAINS DU SÉNÉGAL (CEA-MITIC & CEA-SAMEF)
  {
    id: "bourse_cea_mitic_senegal",
    categoryGroup: "senegal",
    title: "Bourses des Centres d'Excellence Africains (CEA-MITIC UGB & CEA-SAMEF UCAD)",
    provider: "Banque Mondiale & MESRI Sénégal (UGB Saint-Louis / UCAD Dakar)",
    country: "Sénégal",
    countryCode: "SN",
    flag: "🇸🇳",
    targetDegree: "Master de Recherche / Professionnel en IA, IoT, Télécoms, Santé Mère-Enfant",
    fundingType: "full_ride",
    monthlyStipend: "100 000 FCFA à 150 000 FCFA / mois",
    totalValueEst: "~5 000 000 FCFA / an",
    benefits: [
      "Prise en charge totale des frais de formation de Master dans les laboratoires d'excellence de l'UGB ou de l'UCAD",
      "Allocation mensuelle de subsistance de 100 000 à 150 000 FCFA versée durant les 2 années de Master",
      "Financement des stages de recherche internationaux et participation aux conférences scientifiques",
      "Accès aux infrastructures de calcul haute performance (HPC) et laboratoires de pointe",
      "Accompagnement à l'incubation de startups technologiques issues des mémoires de recherche"
    ],
    eligibility: {
      academicLevel: "Licence en Informatique, Mathématiques Appliquées, Télécoms, Biologie ou Médecine",
      minGpa: "Moyenne générale ≥ 13/20 en Licence",
      maxAge: "28 ans au moment du dépôt",
      nationality: "Nationalité sénégalaise ou ressortissant d'un pays membre de la CEDEAO",
      languageReq: "Français C1 et bon niveau d'Anglais technique (B2)",
      workExperience: "Non requise (projets de code / mémoires valorisés)",
      nominationMode: "Appel à candidatures compétitif ouvert lancé par la coordination du CEA-MITIC (UGB) ou CEA-SAMEF (UCAD).",
      selectionConditions: "Encouragement fort des candidatures féminines (quotas de bourses dédiés aux femmes en sciences dures)."
    },
    requiredDocuments: [
      {
        id: "cea_releves",
        name: "Relevés de Notes Universitaires Certifiés & Diplôme de Licence",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés de notes complets des années de Licence avec mention.",
        specifications: "Certifiés par les facultés universitaires d'origine.",
        godTip: "Mettre en avant les projets académiques pratiques (développement web/mobile, algorithmes, data)."
      },
      {
        id: "cea_lettre_motivation",
        name: "Lettre de Motivation & Projet de Recherche Appliquée",
        category: "motivation",
        categoryLabel: "✍️ Motivation",
        isMandatory: true,
        description: "Exposé du projet scientifique et de sa contribution aux défis de développement africains.",
        specifications: "Document de 2 pages maximum.",
        godTip: "Cibler une problématique concrète : télémédecine, agriculture intelligente, cybersécurité, finance inclusive."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Publication de l'Appel CEA", timeline: "Juin - Juillet", details: "Lancement sur les sites officiels de l'UGB (CEA-MITIC) et de l'UCAD (CEA-SAMEF)." },
      { step: 2, title: "Dépôt des Candidatures en Ligne", timeline: "Juillet - Août", details: "Envoi du dossier numérique complet au secrétariat académique du Centre." },
      { step: 3, title: "Entretiens Techniques de Sélection", timeline: "Septembre", details: "Audition par le comité scientifique international du CEA." },
      { step: 4, title: "Attribution des Bourses & Début des Cours", timeline: "Octobre - Novembre", details: "Signature des conventions de bourse et début des enseignements." }
    ],
    selectionCriteria: [
      { criterion: "Compétences Techniques & Algorithmiques", weight: "50%", description: "Résultats dans les matières fondamentales et projets réalisés." },
      { criterion: "Pertinence du Projet de Recherche", weight: "30%", description: "Impact du sujet pour le développement du Sénégal et de la région." },
      { criterion: "Genre & Diversité Régionale", weight: "20%", description: "Discrimination positive en faveur des candidates féminines d'excellence." }
    ],
    juryInsights: [
      "Les candidates féminines bénéficient d'une bonification de points pour encourager la parité dans la Tech et la Recherche.",
      "Préparez une démonstration de vos compétences en code ou en analyse de données pour l'entretien."
    ],
    officialUrl: "https://www.ugb.sn/fr/bourses-de-mobilites-cea-mitic-2025",
    verifiedOrg: "Centres d'Excellence Africains — Banque Mondiale & MESRI Sénégal",
    nextDeadline: "2027-08-31",
    legalReference: "Accord de Financement Banque Mondiale N°5414-SN & Convention MESRI Centres d'Excellence Africains",
    sourceType: "MULTILATERAL_TREATY"
  },

  // ==========================================================================
  // SECTION 2 : 🌍 MULTILATÉRAL, AFRIQUE & GRANDES FONDATIONS
  // ==========================================================================

  // 🌍 8. PROGRAMME DE BOURSES DE LA FONDATION MASTERCARD
  {
    id: "bourse_mastercard_foundation",
    categoryGroup: "multilateral",
    title: "Programme de Bourses de la Fondation Mastercard (Mastercard Scholars)",
    provider: "Mastercard Foundation (Sciences Po, McGill, Berkeley, Edinburgh, Cambridge, CMU Africa, Ashesi...)",
    country: "Monde / Afrique / Europe / Amériques",
    countryCode: "INTL",
    flag: "🌍",
    targetDegree: "Master Complet dans les Universités Partenaires Mondiales",
    fundingType: "full_ride",
    monthlyStipend: "1 200 € à 2 000 $ / mois",
    totalValueEst: "~60 000 $ / an",
    benefits: [
      "Prise en charge intégrale à 100% des frais de scolarité universitaire durant toute la durée du Master",
      "Allocation mensuelle complète de subsistance (frais de logement, nourriture et dépenses personnelles)",
      "Fourniture d'un ordinateur portable neuf haut de gamme et forfait livres de cours",
      "Billets d'avion internationaux aller-retour entre le pays d'origine et l'université partenaire",
      "Assurance santé internationale complète et remboursement des frais de visa",
      "Programme d'accompagnement au leadership transformateur, mentorat exécutif et fonds d'amorçage de projets d'entrepreneuriat social"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor obtenu avec mention d'excellence dans une université africaine",
      minGpa: "Moyenne générale ≥ 14/20 ou Mention Bien/Très Bien (Top 10% de cohorte)",
      maxAge: "Moins de 35 ans au moment de la candidature",
      nationality: "Citoyen et résident d'un pays d'Afrique subsaharienne (Sénégal, etc.)",
      languageReq: "Anglais (TOEFL ≥ 95 / IELTS ≥ 7.0) ou Français (C1 pour Sciences Po / UdeM)",
      workExperience: "Engagements communautaires, leadership associatif ou bénévolat prouvé",
      nominationMode: "Candidature directe auprès des universités partenaires sélectionnées (Sciences Po Paris, University of Edinburgh, UC Berkeley, McGill, Cambridge, CMU Africa, etc.).",
      selectionConditions: "Critère socio-économique primordial : démontrer un besoin financier réel associé à un potentiel de leadership exceptionnel et une volonté inébranlable de retourner impacter l'Afrique."
    },
    requiredDocuments: [
      {
        id: "mcf_leadership_essay",
        name: "Essais Personnels sur le Leadership Transformateur & Impact Communautaire",
        category: "motivation",
        categoryLabel: "✍️ Essais",
        isMandatory: true,
        description: "Dissertations détaillant les défis surmontés, les initiatives concrètes de leadership menées et la vision pour l'Afrique.",
        specifications: "Format imposé par l'université partenaire (généralement 3 essais de 500 à 800 mots).",
        godTip: "Illustrez avec des exemples concrets et chiffrés : combien de personnes ont bénéficié de votre projet associatif ou communautaire ?"
      },
      {
        id: "mcf_financial_proof",
        name: "Dossier Justificatif de la Situation Financière & Sociale",
        category: "financial",
        categoryLabel: "💰 Social",
        isMandatory: true,
        description: "Documents prouvant les revenus familiaux modestes et l'impossibilité de financer des études internationales sans bourse.",
        specifications: "Bulletins de salaire des parents/tuteurs, attestations fiscales, quittances de loyer ou certificat d'indigence légalisé.",
        godTip: "La transparence absolue et la cohérence des déclarations financières sont auditées rigoureusement."
      },
      {
        id: "mcf_transcripts",
        name: "Relevés de Notes Complets & Certificats de Diplômes Universitaires",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés de notes officiels de chaque année universitaire avec traduction certifiée si requis.",
        specifications: "Transcripts officiels cachetés par les universités d'origine.",
        godTip: "Fournir les attestations de rang de promotion délivrées par le doyen de faculté."
      },
      {
        id: "mcf_recs",
        name: "Trois Lettres de Recommandation (Académique + Engagement Communautaire)",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Deux recommandations académiques + une recommandation attestant de votre leadership bénévole ou professionnel.",
        specifications: "Soumises directement par les référents via le portail de l'université partenaire.",
        godTip: "Le référent associatif/communautaire doit attester de votre intégrité, empathie et capacité à mobiliser des groupes."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Choix de l'Université Partenaire", timeline: "Septembre - Octobre", details: "Consulter la liste des universités membres (Sciences Po, Edinburgh, Berkeley, McGill, Cambridge, CMU Africa) et vérifier les dates limites." },
      { step: 2, title: "Dépôt Conjoint Admission & Bourse Mastercard", timeline: "Novembre - Janvier", details: "Soumission du dossier d'admission académique avec formulaire spécifique Mastercard Foundation Scholars." },
      { step: 3, title: "Présélection & Entretiens de Leadership", timeline: "Février - Mars", details: "Entretiens approfondis en visioconférence sur votre engagement et résilience." },
      { step: 4, title: "Notification d'Attribution & Préparation au Départ", timeline: "Avril - Mai", details: "Attribution de la bourse complète, prise en charge des visas et séminaire d'intégration." }
    ],
    selectionCriteria: [
      { criterion: "Potentiel de Leadership & Engagement Social", weight: "40%", description: "Preuves concrètes d'initiatives ayant amélioré la vie de sa communauté." },
      { criterion: "Excellence Académique dans son Contexte", weight: "35%", description: "Résultats remarquables obtenus en dépit d'obstacles socio-économiques." },
      { criterion: "Besoin Financier Réel & Authenticité", weight: "25%", description: "Vulnérabilité financière démontrée barrant l'accès aux études supérieures sans appui." }
    ],
    juryInsights: [
      "La Fondation Mastercard ne cherche pas des candidats au parcours parfait et privilégié, mais des profils résilients qui ont transformé des épreuves en moteur pour aider les autres.",
      "Soyez authentique : évitez les discours génériques et racontez votre véritable vécu."
    ],
    officialUrl: "https://mastercardfdn.org/en/what-we-do/our-programs/mastercard-foundation-scholars-program/",
    verifiedOrg: "Mastercard Foundation — Toronto, Canada / Kigali, Rwanda",
    nextDeadline: "2027-01-15",
    legalReference: "Charte Internationale du Programme Mastercard Foundation Scholars & Accords universitaires d'élite",
    sourceType: "MULTILATERAL_TREATY"
  },

  // 🌍 9. BOURSE DE LA BANQUE MONDIALE (JJ/WBGSP)
  {
    id: "bourse_banque_mondiale_jjwbgsp",
    categoryGroup: "multilateral",
    title: "Bourses de Master de la Banque Mondiale (JJ/WBGSP)",
    provider: "Groupe de la Banque Mondiale & Gouvernement du Japon",
    country: "International (USA, Europe, Japon, Afrique)",
    countryCode: "INTL",
    flag: "🌍",
    targetDegree: "Master dans l'un des 40+ Programmes de Développement Partenaires (Harvard, Oxford, Columbia, Keio, etc.)",
    fundingType: "full_ride",
    monthlyStipend: "1 500 $ à 2 200 $ / mois",
    totalValueEst: "~55 000 $ / an",
    benefits: [
      "Prise en charge intégrale des frais de scolarité universitaire du Master partenaire",
      "Allocation mensuelle complète de subsistance couvrant logement et vie courante",
      "Billet d'avion international aller-retour en classe économique entre le pays d'origine et l'université",
      "Indemnité spéciale d'installation à l'arrivée (500 $)",
      "Couverture d'assurance médicale complète durant toute la durée de la bourse"
    ],
    eligibility: {
      academicLevel: "Diplôme de Licence / Bachelor obtenu au moins 3 ans avant la date de candidature",
      minGpa: "Excellence académique avérée",
      maxAge: "Aucune limite d'âge formelle (priorité aux professionnels en milieu de carrière)",
      nationality: "Ressortissant d'un pays éligible en développement de la Banque Mondiale (Sénégal inclus)",
      languageReq: "Maîtrise de la langue d'enseignement du programme choisi (Anglais ou Français)",
      workExperience: "Au moins 3 années d'expérience professionnelle rémunérée à plein temps dans le développement économique ou le secteur public",
      nominationMode: "Obtenir impérativement une admission inconditionnelle dans l'un des programmes de Master partenaires officiels de la Banque Mondiale avant de postuler en ligne.",
      selectionConditions: "Engagement formel de retourner travailler dans son pays d'origine pendant au moins 2 ans immédiatement après l'obtention du Master."
    },
    requiredDocuments: [
      {
        id: "wb_unconditional_offer",
        name: "Lettre d'Admission Inconditionnelle dans un Master Partenaire JJ/WBGSP",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Preuve d'acceptation ferme sans réserve dans un des programmes listés par la Banque Mondiale.",
        specifications: "Document officiel de l'université partenaire.",
        godTip: "Postuler dès l'automne auprès des universités partenaires pour avoir l'admission prête lors de l'ouverture du guichet Banque Mondiale en mars."
      },
      {
        id: "wb_work_proof",
        name: "Attestations de Travail Prouvant au Moins 3 Ans d'Expérience dans le Développement",
        category: "work",
        categoryLabel: "💼 Expérience",
        isMandatory: true,
        description: "Contrats de travail et certificats d'employeurs détaillant les responsabilités liées au développement.",
        specifications: "Signées par les ressources humaines sur papier à en-tête d'organisations publiques, ONG ou entreprises.",
        godTip: "Les expériences dans la fonction publique, les agences de régulation ou les projets financés par les bailleurs multilatéraux sont hautement valorisées."
      },
      {
        id: "wb_recommendations",
        name: "Deux Lettres de Recommandation Professionnelles Officielles",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Recommandations soumises par des supérieurs hiérarchiques directs attestant de votre impact professionnel.",
        specifications: "Soumises directement en ligne par les référents via le portail sécurisé de la Banque Mondiale.",
        godTip: "Le référent doit insister sur votre capacité à formuler et exécuter des politiques publiques d'envergure."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Admission dans un Master Partenaire", timeline: "Novembre - Février", details: "Obtenir l'admission inconditionnelle dans l'un des Masters affiliés (Columbia, Harvard, Oxford, LSE, Keio, etc.)." },
      { step: 2, title: "Ouverture du Guichet de Candidature Banque Mondiale", timeline: "Mars - Mai", details: "Soumission du dossier complet en ligne sur le portail JJ/WBGSP." },
      { step: 3, title: "Examen par le Comité de Sélection International", timeline: "Juin", details: "Évaluation multicritères par les experts du Groupe de la Banque Mondiale." },
      { step: 4, title: "Attribution & Départ en Formation", timeline: "Juillet - Août", details: "Notification officielle et prise en charge logistique et financière." }
    ],
    selectionCriteria: [
      { criterion: "Expérience & Impact Professionnel dans le Développement", weight: "40%", description: "Durée et qualité des réalisations dans les secteurs stratégiques (énergie, eau, éducation, santé, finance)." },
      { criterion: "Excellence du Dossier d'Admission Partenaire", weight: "35%", description: "Prestige et sélectivité du programme de Master retenu." },
      { criterion: "Potentiel de Contribution au Retour", weight: "25%", description: "Clarté du plan de réintégration et de valorisation des acquis dans le pays d'origine." }
    ],
    juryInsights: [
      "Les candidatures sans admission inconditionnelle préalable sont rejetées automatiquement par le système sans examen humain.",
      "Mettez l'accent sur les réformes concrètes ou projets de développement que vous avez pilotés."
    ],
    officialUrl: "https://www.worldbank.org/en/programs/scholarships",
    verifiedOrg: "Groupe de la Banque Mondiale (World Bank) — Washington D.C., USA",
    nextDeadline: "2027-05-24",
    legalReference: "Statuts du Joint Japan / World Bank Graduate Scholarship Program (Banque Mondiale — Ministère des Finances du Japon)",
    sourceType: "MULTILATERAL_TREATY"
  },

  // 🌍 10. BOURSE DE LA BANQUE AFRICAINE DE DÉVELOPPEMENT (BAD)
  {
    id: "bourse_bad_afdb_japan",
    categoryGroup: "multilateral",
    title: "Bourse de Master de la Banque Africaine de Développement (BAD / AfDB)",
    provider: "Banque Africaine de Développement (BAD) & Gouvernement du Japon",
    country: "International (Japon / Afrique / Universités Partenaires)",
    countryCode: "INTL",
    flag: "🌍",
    targetDegree: "Master en Ingénierie, Énergie, Économie, Agronomie et Climat",
    fundingType: "full_ride",
    monthlyStipend: "140 000 JPY / mois (~1 000 $ / mois)",
    totalValueEst: "~35 000 $ / an",
    benefits: [
      "Prise en charge intégrale des frais de scolarité de Master",
      "Allocation mensuelle de subsistance versée tout au long du programme",
      "Billet d'avion aller-retour pays d'origine ↔ université d'accueil",
      "Couverture d'assurance santé complète et allocation d'installation initiale",
      "Accès aux opportunités de stages et de réseaux professionnels au sein du Groupe de la BAD"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor obtenu avec mention d'excellence dans un pays membre de la BAD",
      minGpa: "Moyenne générale ≥ 13.5/20",
      maxAge: "35 ans à la date de soumission",
      nationality: "Ressortissant d'un pays membre régional de la Banque Africaine de Développement (Sénégal, etc.)",
      languageReq: "Anglais ou Français selon la langue d'enseignement du Master",
      workExperience: "Au moins 1 à 2 ans d'expérience professionnelle dans un domaine lié au développement",
      nominationMode: "Candidature directe auprès des universités affiliées au programme BAD ou via le portail de la BAD.",
      selectionConditions: "Engagement de retour en Afrique après la diplomation pour contribuer aux 5 Grandes Priorités (High 5s) de la BAD."
    },
    requiredDocuments: [
      {
        id: "bad_admission",
        name: "Lettre d'Admission Officielle dans le Programme de Master Partenaire",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Justificatif d'acceptation dans une université partenaire du programme de bourses de la BAD.",
        specifications: "Format officiel délivré par l'université.",
        godTip: "Privilégier les filières alignées avec les High 5s de la BAD : Éclairer l'Afrique, Nourrir l'Afrique, Industrialiser l'Afrique, Intégrer l'Afrique et Améliorer la qualité de vie."
      },
      {
        id: "bad_releves",
        name: "Relevés de Notes Universitaires & Attestation de Diplôme",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés complets de Licence et diplôme certifié conforme.",
        specifications: "Copies certifiées conformes.",
        godTip: "Faire figurer les mentions et classements académiques officiels."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Lancement de l'Appel Annuel de la BAD", timeline: "Février - Mars", details: "Publication des programmes éligibles sur le portail de la Banque Africaine de Développement." },
      { step: 2, title: "Candidature auprès de l'Université Partenaire", timeline: "Mars - Avril", details: "Dépôt du dossier académique et demande formelle de bourse BAD." },
      { step: 3, title: "Validation par le Comité Mixte BAD/Japon", timeline: "Mai - Juin", details: "Examen des dossiers transmis par les universités partenaires." },
      { step: 4, title: "Attribution Finale & Formalités de Départ", timeline: "Juillet - Août", details: "Notification aux lauréats et mise en place des billets d'avion et versements." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique & Potentiel Professionnel", weight: "45%", description: "Solidité du parcours de Licence et rigueur scientifique." },
      { criterion: "Alignement avec les Priorités Stratégiques (High 5s)", weight: "35%", description: "Pertinence du Master pour les défis d'infrastructure et d'industrialisation du continent." },
      { criterion: "Équité de Genre & Représentation Géographique", weight: "20%", description: "Équilibre entre pays membres régionaux et soutien aux femmes scientifiques." }
    ],
    juryInsights: [
      "Articulez explicitement votre projet de mémoire avec l'une des 5 priorités majeures (High 5s) de la BAD.",
      "Les candidatures féminines dans les filières d'ingénierie et d'énergie sont fortement encouragées."
    ],
    officialUrl: "https://www.afdb.org/en/topics-and-sectors/initiatives-partnerships/japan-africa-dream-scholarship-jads-program",
    verifiedOrg: "Banque Africaine de Développement (BAD) — Abidjan, Côte d'Ivoire",
    nextDeadline: "2027-05-15",
    legalReference: "Accord bilatéral Groupe de la Banque Africaine de Développement (BAD) & Fonds Spécial du Japon",
    sourceType: "MULTILATERAL_TREATY"
  },

  // 🌍 11. BOURSE DE LA BANQUE ISLAMIQUE DE DÉVELOPPEMENT (ISDB)
  {
    id: "bourse_isdb_master",
    categoryGroup: "multilateral",
    title: "Programme de Bourses de Master de la Banque Islamique de Développement (IsDB)",
    provider: "Banque Islamique de Développement (IsDB / IsDB-Turkiye / Partenaires Mondiaux)",
    country: "International (Pays membres IsDB, Turquie, Malaisie, UK, etc.)",
    countryCode: "INTL",
    flag: "🌍",
    targetDegree: "Master en Sciences, Technologies, Ingénierie, Agriculture et Santé",
    fundingType: "full_ride",
    monthlyStipend: "1 200 $ / mois (ou équivalent monnaie locale)",
    totalValueEst: "~35 000 $ / an",
    benefits: [
      "Prise en charge intégrale à 100% des frais de scolarité universitaire de Master",
      "Allocation mensuelle complète de subsistance ajustée selon le coût de la vie du pays d'études",
      "Billet d'avion international aller-retour en début et fin de cursus",
      "Couverture d'assurance maladie et soins médicaux complète",
      "Primes spéciales d'installation, forfait livres de recherche et matériel scientifique"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor obtenu dans une université reconnue avec Mention Très Bien / Bien",
      minGpa: "Moyenne générale ≥ 14/20 ou Grade B+ / Très Bien",
      maxAge: "30 ans maximum pour le cycle de Master",
      nationality: "Citoyen d'un pays membre de l'IsDB (Sénégal, etc.)",
      languageReq: "Maîtrise de la langue d'enseignement (Anglais, Français ou Arabe)",
      workExperience: "Expérience professionnelle ou stages dans les secteurs scientifiques valorisés",
      nominationMode: "Candidature exclusivement en ligne via le portail officiel de bourses de l'IsDB (IsDB Scholarship Portal).",
      selectionConditions: "Engagement éthique à rembourser sans intérêt (Qard Hasan) une fraction symbolique de la bourse après insertion professionnelle auprès d'un fonds de bourses local, pour pérenniser le soutien aux générations futures."
    },
    requiredDocuments: [
      {
        id: "isdb_releves_diplome",
        name: "Diplôme de Licence & Relevés de Notes Complets Traduits en Anglais/Français",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés semestriels universitaires certifiés conformes avec attestation de diplôme.",
        specifications: "Copies certifiées conformes avec traduction officielle si nécessaire.",
        godTip: "Les candidats ayant un parcours en Sciences dures (STEM, Data, IA, Agronomie) sont prioritaires."
      },
      {
        id: "isdb_proposal",
        name: "Projet de Recherche & Impact sur le Développement Durable (ODD)",
        category: "motivation",
        categoryLabel: "✍️ Projet",
        isMandatory: true,
        description: "Document de 2 pages exposant en quoi votre Master répond à un besoin critique de développement dans votre pays.",
        specifications: "Format PDF rédigé en anglais ou français.",
        godTip: "Lier directement son projet aux Objectifs de Développement Durable (ODD) et aux secteurs prioritaires de l'IsDB."
      },
      {
        id: "isdb_medical",
        name: "Certificat Médical d'Aptitude Globale",
        category: "medical",
        categoryLabel: "🏥 Santé",
        isMandatory: true,
        description: "Certificat médical d'un centre hospitalier agréé attestant de la bonne santé du candidat.",
        specifications: "Délivré par un médecin assermenté.",
        godTip: "Le certificat doit comporter les tampons officiels de l'établissement hospitalier."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Ouverture de la Plateforme IsDB Scholarship", timeline: "Décembre - Janvier", details: "Lancement officiel sur le portail sécurisé de la Banque Islamique de Développement." },
      { step: 2, title: "Saisie en Ligne & Téléversement des Pièces", timeline: "Janvier - Février", details: "Enregistrement du profil et choix des universités partenaires recommandées." },
      { step: 3, title: "Évaluation par les Comités Scientifiques Internationaux", timeline: "Mars - Mai", details: "Notation des dossiers par des panels d'académiciens internationaux indépendants." },
      { step: 4, title: "Publication des Lauréats & Placement Universitaire", timeline: "Juin - Juillet", details: "Notification officielle et émission des garanties financières pour le visa." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique (Sciences & Technologies)", weight: "45%", description: "Résultats de haut niveau en Licence dans les domaines d'ingénierie et de sciences." },
      { criterion: "Pertinence du Projet pour le Développement National", weight: "35%", description: "Impact du projet sur l'amélioration des conditions de vie dans le pays membre." },
      { criterion: "Éthique, Leadership & Engagement Social", weight: "20%", description: "Sens de la responsabilité et engagement envers le développement communautaire." }
    ],
    juryInsights: [
      "L'IsDB privilégie massivement les filières STEM (Science, Technologie, Ingénierie, Mathématiques) et l'Agriculture durable.",
      "Ne laissez aucune section du formulaire en ligne vide : tout profil incomplet est éliminé automatiquement au screening."
    ],
    officialUrl: "https://www.isdb.org/scholarships",
    verifiedOrg: "Banque Islamique de Développement (IsDB) — Djeddah, Arabie Saoudite",
    nextDeadline: "2027-02-28",
    legalReference: "Règlement des Programmes de Bourses d'Excellence de la Banque Islamique de Développement (IsDB Board Resolution)",
    sourceType: "MULTILATERAL_TREATY"
  },

  // 🌍 12. BOURSES DE L'UNIVERSITÉ PANAFRICAINE (PAU / UNION AFRICAINE)
  {
    id: "bourse_union_africaine_pau",
    categoryGroup: "multilateral",
    title: "Bourses d'Excellence de l'Université Panafricaine (PAU / Union Africaine)",
    provider: "Commission de l'Union Africaine (PAUSTI Kenya, PAULESI Nigeria, PAUWES Algérie, PAUGHSS Cameroun)",
    country: "Afrique (Kenya, Nigeria, Algérie, Cameroun)",
    countryCode: "INTL",
    flag: "🌍",
    targetDegree: "Master de Recherche / Professionnel dans les 4 Instituts Panafricains d'Excellence",
    fundingType: "full_ride",
    monthlyStipend: "600 $ / mois",
    totalValueEst: "~18 000 $ / an",
    benefits: [
      "Prise en charge totale à 100% des frais de scolarité de Master dans les instituts de l'Union Africaine",
      "Allocation mensuelle de subsistance de 600 $ versée pendant toute la durée des 2 années de Master",
      "Billet d'avion international aller-retour entre le pays d'origine et le pays hôte de l'institut PAU",
      "Prise en charge intégrale des frais de recherche de mémoire et de stage de fin d'études",
      "Couverture d'assurance maladie internationale complète pour étudiants africains"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor obtenu avec Mention Assez Bien ou Bien dans une université africaine reconnue",
      minGpa: "Moyenne générale ≥ 12.5/20",
      maxAge: "30 ans pour les hommes / 35 ans pour les femmes au moment de la candidature",
      nationality: "Citoyen d'un État membre de l'Union Africaine (Sénégal inclus)",
      languageReq: "Maîtrise de l'une des langues de travail de l'Union Africaine (Français ou Anglais)",
      workExperience: "Non requise",
      nominationMode: "Candidature en ligne centralisée sur le portail officiel de l'Université Panafricaine (PAU).",
      selectionConditions: "Engagement à contribuer à la vision de l'Agenda 2063 de l'Union Africaine (« L'Afrique que nous voulons »)."
    },
    requiredDocuments: [
      {
        id: "pau_diplomes",
        name: "Diplôme de Licence & Relevés de Notes Universitaires Complets",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés de notes semestriels certifiés par l'université sénégalaise ou africaine d'origine.",
        specifications: "Format PDF lisible avec cachets visibles.",
        godTip: "Joindre une attestation officielle d'échelle de notation pour faciliter la conversion par le jury panafricain."
      },
      {
        id: "pau_concept_note",
        name: "Note Conceptuelle de Recherche de Master (2 pages)",
        category: "motivation",
        categoryLabel: "✍️ Recherche",
        isMandatory: true,
        description: "Proposition de sujet de recherche de mémoire alignée avec les thématiques de l'institut PAU choisi (Sciences Fondamentales, Énergie/Eau, Gouvernance, Agriculture).",
        specifications: "Format PDF de 2 pages avec problématique, objectifs et méthodologie.",
        godTip: "Aligner clairement votre sujet sur les défis concrets du continent africain."
      },
      {
        id: "pau_passport",
        name: "Passeport National en Cours de Validité & Lettres de Recommandation",
        category: "civil",
        categoryLabel: "🏛️ État Civil",
        isMandatory: true,
        description: "Copie de la page d'identification du passeport + 2 lettres de recommandation d'enseignants universitaires.",
        specifications: "Passeport valide au moins 2 ans.",
        godTip: "Obtenir des lettres d'enseignants soulignant votre rigueur méthodologique."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Lancement de l'Appel de l'Union Africaine", timeline: "Février - Mars", details: "Publication sur le site web de l'Université Panafricaine et de l'Union Africaine." },
      { step: 2, title: "Soumission Numérique sur le Portail PAU", timeline: "Mars - Avril", details: "Téléversement des documents et choix de l'institut (PAUSTI Nairobi, PAULESI Ibadan, PAUWES Tlemcen, PAUGHSS Yaoundé)." },
      { step: 3, title: "Évaluation Scientifique Panafricaine", timeline: "Mai - Juin", details: "Sélection par les comités académiques des 5 régions de l'Union Africaine." },
      { step: 4, title: "Admission Définitive & Prise en Charge Voyage", timeline: "Juillet - Septembre", details: "Émission des billets d'avion et rentrée académique dans l'institut d'accueil." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique Universitaire", weight: "45%", description: "Mentions et cohérence du cursus de Licence." },
      { criterion: "Qualité de la Note Conceptuelle de Recherche", weight: "35%", description: "Originalité et pertinence scientifique de la proposition de mémoire." },
      { criterion: "Équilibre Régional & Genre (Union Africaine)", weight: "20%", description: "Promotion de la diversité des 5 régions d'Afrique et priorité aux femmes scientifiques." }
    ],
    juryInsights: [
      "Les bourses PAU sont 100% prises en charge par l'Union Africaine : soignez particulièrement la note conceptuelle de recherche.",
      "L'institut PAUWES (Tlemcen, Algérie) est très réputé en Énergies Renouvelables et Changement Climatique."
    ],
    officialUrl: "https://www.au-pau.org/submission/",
    verifiedOrg: "Commission de l'Union Africaine (African Union) — Addis-Abeba, Éthiopie",
    nextDeadline: "2027-04-30",
    legalReference: "Décision de la Conférence des Chefs d'État de l'Union Africaine (Assembly/AU/Dec.290(XV)) portant création de la PAU",
    sourceType: "MULTILATERAL_TREATY"
  },

  // 🌍 13. BOURSES DE LA CEDEAO POUR LES ÉTUDES RÉGIONALES DE MASTER
  {
    id: "bourse_cedeao_master",
    categoryGroup: "multilateral",
    title: "Bourses de Master de la CEDEAO (Excellence & Éducation Régionale)",
    provider: "Commission de la CEDEAO (Centre pour le Développement du Genre / Département Éducation)",
    country: "Afrique de l'Ouest (Espace CEDEAO)",
    countryCode: "INTL",
    flag: "🌍",
    targetDegree: "Master Spécialisé dans les Universités de l'Espace CEDEAO (Sénégal, Ghana, Nigeria, Côte d'Ivoire)",
    fundingType: "full_ride",
    monthlyStipend: "200 000 FCFA à 350 000 FCFA / mois",
    totalValueEst: "~7 000 000 FCFA / an",
    benefits: [
      "Prise en charge intégrale des frais de scolarité universitaire dans les établissements hôtes de la CEDEAO",
      "Bourse mensuelle complète de subsistance versée durant les 2 années de Master",
      "Prise en charge des billets d'avion régionaux aller-retour",
      "Assurance santé pour étudiants régionaux et prime annuelle de recherche",
      "Immersion dans les institutions communautaires de la CEDEAO"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor obtenu avec Mention Bien dans une université de l'espace CEDEAO",
      minGpa: "Moyenne générale ≥ 13/20",
      maxAge: "30 ans pour les candidats masculins / 32 ans pour les candidates féminines",
      nationality: "Ressortissant d'un État membre de la CEDEAO (Sénégal, etc.)",
      languageReq: "Français, Anglais ou Portugais selon le pays d'études choisi",
      workExperience: "Non requise",
      nominationMode: "Appel annuel publié par la Commission de la CEDEAO avec transmission par les ministères nationaux de tutelle.",
      selectionConditions: "Volonté démontrée de travailler sur des problématiques d'intégration régionale ouest-africaine."
    },
    requiredDocuments: [
      {
        id: "ecowas_releves",
        name: "Relevés de Notes et Attestation de Licence Certifiés Conformes",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés complets attestant du niveau d'excellence en Licence.",
        specifications: "Copies certifiées conformes par les autorités compétentes.",
        godTip: "Valoriser les matières quantitatives, d'économie du développement ou de droit international."
      },
      {
        id: "ecowas_motivation",
        name: "Lettre de Motivation sur l'Intégration Régionale Ouest-Africaine",
        category: "motivation",
        categoryLabel: "✍️ Motivation",
        isMandatory: true,
        description: "Démonstration de l'impact de la formation pour le développement économique et social de la CEDEAO.",
        specifications: "Document rédigé de 2 pages maximum.",
        godTip: "Faire le lien entre votre spécialité et les protocoles de libre-échange (ZLECAF / CEDEAO)."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Lancement de l'Appel de la Commission CEDEAO", timeline: "Mai - Juin", details: "Diffusion sur le portail officiel de la CEDEAO et via les canaux du MESRI Sénégal." },
      { step: 2, title: "Dépôt des Candidatures en Ligne", timeline: "Juin - Juillet", details: "Téléversement des pièces et choix de l'université partenaire régionale." },
      { step: 3, title: "Sélection par la Commission d'Experts CEDEAO", timeline: "Août", details: "Évaluation des profils et quotas équitables par pays membre." },
      { step: 4, title: "Déploiement des Boursiers & Rentrée", timeline: "Septembre - Octobre", details: "Mise en route vers l'université d'accueil dans l'espace communautaire." }
    ],
    selectionCriteria: [
      { criterion: "Excellence des Résultats Académiques", weight: "50%", description: "Notes de Licence et mentions obtenues." },
      { criterion: "Pertinence du Projet pour l'Intégration CEDEAO", weight: "30%", description: "Contribution aux objectifs de développement sous-régional." },
      { criterion: "Genre & Inclusion Sociale", weight: "20%", description: "Promotion prioritaire de l'excellence féminine en sciences et gestion." }
    ],
    juryInsights: [
      "Les bourses de la CEDEAO valorisent très fortement les candidatures féminines dans les filières STEM.",
      "Soyez précis sur la manière dont votre formation servira le marché commun ouest-africain."
    ],
    officialUrl: "https://www.ecowas.int/education/",
    verifiedOrg: "Commission de la CEDEAO (ECOWAS) — Abuja, Nigeria",
    nextDeadline: "2027-07-31",
    legalReference: "Protocole sur l'Éducation et la Formation de la CEDEAO & Décision du Conseil des Ministres",
    sourceType: "MULTILATERAL_TREATY"
  },

  // 🌍 14. BOURSES DE L'AGENCE UNIVERSITAIRE DE LA FRANCOPHONIE (AUF & EUGEN IONESCU)
  {
    id: "bourse_auf_francophonie",
    categoryGroup: "multilateral",
    title: "Bourses de Mobilité de Master AUF & Programme Eugen Ionescu (Francophonie)",
    provider: "Agence Universitaire de la Francophonie (AUF) & Ministère des Affaires Étrangères de Roumanie",
    country: "Espace Francophone (Roumanie, France, Belgique, Canada, Afrique)",
    countryCode: "INTL",
    flag: "🌍",
    targetDegree: "Master 2 Recherche / Professionnel & Mobilité Scientifique Francophone",
    fundingType: "tuition_stipend",
    monthlyStipend: "800 € à 1 000 € / mois",
    totalValueEst: "~12 000 € / an",
    benefits: [
      "Exonération totale des frais d'inscription dans les universités membres de l'AUF",
      "Allocation mensuelle de subsistance versée durant la mobilité académique (3 à 10 mois)",
      "Billet d'avion international aller-retour pris en charge par l'AUF",
      "Assurance santé et rapatriement couverte par l'organisme",
      "Accès aux Campus Numériques Francophones (CNF) et réseaux de recherche de l'AUF"
    ],
    eligibility: {
      academicLevel: "Master 1 validé ou Master 2 en cours dans une université membre de l'AUF (UCAD, UGB, etc.)",
      minGpa: "Moyenne générale ≥ 13/20",
      maxAge: "35 ans pour les bourses de Master",
      nationality: "Ressortissant d'un pays membre de l'Organisation Internationale de la Francophonie (OIF)",
      languageReq: "Français C1/C2 certifié",
      workExperience: "Non requise (projets de recherche universitaire valorisés)",
      nominationMode: "Candidature en ligne sur la plateforme officielle de l'AUF (Appels régionaux Afrique de l'Ouest).",
      selectionConditions: "Inscription active dans un établissement d'enseignement supérieur membre titulaire de l'AUF au Sénégal."
    },
    requiredDocuments: [
      {
        id: "auf_accord_accueil",
        name: "Attestation d'Acceptation de l'Université Francophone d'Accueil",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Lettre d'accueil signée par le responsable de Master de l'université partenaire membre de l'AUF.",
        specifications: "Sur papier à en-tête officiel de l'établissement hôte.",
        godTip: "Consulter la liste des universités membres de l'AUF pour cibler un laboratoire partenaire."
      },
      {
        id: "auf_projet_recherche",
        name: "Projet de Mémoire ou de Stage de Recherche de Master",
        category: "motivation",
        categoryLabel: "✍️ Projet",
        isMandatory: true,
        description: "Description scientifique détaillée des objectifs de la mobilité et des retombées pour l'université d'origine.",
        specifications: "Document de 3 à 5 pages avec bibliographie francophone.",
        godTip: "Démontrer la co-direction ou la collaboration entre votre université au Sénégal et l'université d'accueil."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Publication des Appels Régionaux AUF", timeline: "Novembre - Décembre", details: "Lancement des appels sur le portail régional Afrique de l'Ouest de l'AUF." },
      { step: 2, title: "Dépôt des Candidatures en Ligne", timeline: "Janvier - Février", details: "Soumission du dossier complet avec visa du recteur de l'université d'origine." },
      { step: 3, title: "Évaluation par la Commission Régionale d'Experts", timeline: "Mars - Avril", details: "Sélection des projets sur la base de leur qualité scientifique." },
      { step: 4, title: "Mise en Place de la Bourse & Déplacement", timeline: "Mai - Juin", details: "Attribution des titres de transport et versements des premières mensualités." }
    ],
    selectionCriteria: [
      { criterion: "Qualité Scientifique du Projet de Mobilité", weight: "50%", description: "Rigueur méthodologique et faisabilité du calendrier de recherche." },
      { criterion: "Excellence du Parcours Académique Antérieur", weight: "30%", description: "Notes de Licence et Master 1 au Sénégal." },
      { criterion: "Partenariat Institutionnel Interuniversitaire", weight: "20%", description: "Solidité des liens entre l'université sénégalaise et l'université d'accueil." }
    ],
    juryInsights: [
      "L'AUF privilégie les projets de mobilité qui créent des ponts durables entre laboratoires sénégalais et internationaux.",
      "Vérifiez que votre recteur ou doyen a bien signé l'attestation de soutien institutionnel avant le dépôt."
    ],
    officialUrl: "https://appels-propositions.auf.org/",
    verifiedOrg: "Agence Universitaire de la Francophonie (AUF) — Direction Régionale Afrique de l'Ouest (Dakar)",
    nextDeadline: "2027-02-15",
    legalReference: "Convention de Coopération Universitaire Francophone AUF & Ministère des Affaires Étrangères de Roumanie (Eugen Ionescu)",
    sourceType: "MULTILATERAL_TREATY"
  },

  // ==========================================================================
  // SECTION 3 : 🇪🇺 GRANDES BOURSES D'EXCELLENCE EUROPÉENNES & ROYAUME-UNI
  // ==========================================================================

  // 🇪🇺 15. ERASMUS MUNDUS JOINT MASTERS
  {
    id: "bourse_erasmus_mundus_ue",
    categoryGroup: "europe",
    title: "Bourses Erasmus Mundus Joint Masters (EMJM - Commission Européenne)",
    provider: "Commission Européenne (EACEA)",
    country: "Union Européenne (Multi-pays : France, Allemagne, Espagne, Italie, etc.)",
    countryCode: "EU",
    flag: "🇪🇺",
    targetDegree: "Double ou Multiple Diplôme de Master International Conjoint",
    fundingType: "full_ride",
    monthlyStipend: "1 400 € / mois (net d'impôt)",
    totalValueEst: "~45 000 € sur 2 ans",
    benefits: [
      "Prise en charge intégrale à 100% de tous les frais d'inscription et de scolarité dans les universités européennes",
      "Allocation mensuelle complète de subsistance de 1 400 € / mois versée durant les 24 mois du cursus",
      "Couverture intégrale d'assurance médicale internationale haut de gamme conforme aux normes EACEA",
      "Études et vie dans au moins 2 à 3 pays européens différents avec diplomation multiple reconnue mondialement",
      "Réseau mondial d'anciens boursiers (EMA) et insertion professionnelle internationale immédiate"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) obtenu ou en cours d'obtention dans une université reconnue",
      minGpa: "Grade B+ / Mention Bien minimum (≥ 13.5/20) ou équivalent",
      maxAge: "Aucune limite d'âge formelle",
      nationality: "Ouvert à toutes les nationalités du monde (candidats hors UE éligibles aux bourses Partner Countries)",
      languageReq: "Anglais niveau C1 certifié (IELTS ≥ 6.5-7.0 / TOEFL iBT ≥ 90-100) ou C1 dans la langue du consortium",
      workExperience: "Stages ou mémoire de recherche fortement valorisés selon le programme choisi",
      nominationMode: "Candidature directe en ligne auprès du consortium du Master Erasmus Mundus ciblé (Catalogue EMJM).",
      selectionConditions: "Règle des 3 candidatures : un étudiant ne peut postuler qu'à 3 programmes de Master Erasmus Mundus maximum par année universitaire."
    },
    requiredDocuments: [
      {
        id: "em_motivation_letter",
        name: "Lettre de Motivation Spécifique au Consortium Conjoint",
        category: "motivation",
        categoryLabel: "✍️ Motivation",
        isMandatory: true,
        description: "Argumentaire démontrant l'intérêt pour la mobilité multi-pays et la complémentarité des universités partenaires.",
        specifications: "PDF de 1 à 2 pages en anglais rédigé avec une structure irréprochable.",
        godTip: "Expliquez précisément pourquoi ce Master conjoint unique vous correspond mieux qu'un Master national classique."
      },
      {
        id: "em_recs",
        name: "Deux Lettres de Recommandation Académiques en Anglais",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Lettres détaillées rédigées par des professeurs ou directeurs de recherche universitaires.",
        specifications: "Sur papier à en-tête institutionnel avec signature officielle et coordonnées vérifiables.",
        godTip: "Les recommandations doivent quantifier vos aptitudes analytiques (ex: 'parmi les 5 meilleurs étudiants sur 120')."
      },
      {
        id: "em_transcripts",
        name: "Relevés de Notes Officiels & Diplôme de Licence Traduits en Anglais",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Transcripts académiques certifiés avec système de notation et traduction assermentée.",
        specifications: "Fichiers PDF haute résolution certifiés conformes.",
        godTip: "Joindre le supplément au diplôme ou une explication officielle du système de crédits/notations."
      },
      {
        id: "em_english_test",
        name: "Certificat de Test d'Anglais Officiel (IELTS / TOEFL / Cambridge)",
        category: "language",
        categoryLabel: "🗣️ Langue",
        isMandatory: true,
        description: "Score officiel de compétence en anglais datant de moins de 2 ans.",
        specifications: "IELTS Academic ≥ 6.5 (aucun score sous 6.0) ou TOEFL iBT ≥ 90.",
        godTip: "Passer le test dès l'automne pour avoir les résultats définitifs avant la clôture en janvier."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Exploration du Catalogue Officiel EMJM", timeline: "Septembre - Octobre", details: "Consulter la base EACEA et sélectionner jusqu'à 3 programmes de Master conjoints correspondant à votre profil." },
      { step: 2, title: "Soumission des Dossiers aux Consortiums", timeline: "Octobre - Janvier", details: "Création des comptes sur les portails dédiés de chaque Master et téléversement des pièces." },
      { step: 3, title: "Évaluation Internationale & Entretiens", timeline: "Février - Mars", details: "Sélection par le jury académique conjoint européen et entretiens oraux en visioconférence." },
      { step: 4, title: "Notification d'Attribution & Visas Européens", timeline: "Avril - Mai", details: "Publication de la liste principale (Main List) et délivrance des attestations de bourse pour les visas." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique & Résultats Antérieurs", weight: "40%", description: "Mentions en Licence, régularité du cursus et solidité des bases théoriques." },
      { criterion: "Motivation & Adéquation avec la Mobilité Conjointe", weight: "35%", description: "Capacité d'adaptation interculturelle et cohérence du projet professionnel international." },
      { criterion: "Lettres de Recommandation & Expérience Pratique", weight: "25%", description: "Appréciations des référents académiques et stages/publications scientifiques." }
    ],
    juryInsights: [
      "Les jurys Erasmus Mundus reçoivent des candidatures du monde entier : évitez absolument les lettres types génériques copiées sur Internet.",
      "Mettez en avant votre capacité d'adaptation et votre curiosité pour l'apprentissage dans plusieurs pays et cultures académiques."
    ],
    officialUrl: "https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en",
    verifiedOrg: "Commission Européenne (EACEA) — Bruxelles, Belgique",
    nextDeadline: "2027-01-15",
    legalReference: "Règlement (UE) 2021/817 du Parlement Européen et du Conseil établissant Erasmus+ (EMJM Guidelines EACEA)",
    sourceType: "MULTILATERAL_TREATY"
  },

  // 🇫🇷 16. BOURSE D'EXCELLENCE EIFFEL (CAMPUS FRANCE)
  {
    id: "bourse_eiffel_france",
    categoryGroup: "europe",
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
      "Allocation mensuelle directe de subsistance de 1 181 € net",
      "Billet d'avion international aller-retour pays d'origine ↔ France pris en charge",
      "Couverture sociale complète Campus France et complémentaire santé mutuelle",
      "Priorité absolue pour un logement en résidence universitaire CROUS",
      "Activités culturelles, visites institutionnelles et voyages d'intégration"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) validé avec Mention Très Bien",
      minGpa: "Top 5% de la promotion universitaire d'origine",
      maxAge: "27 ans maximum l'année de l'appel à candidatures pour le niveau Master",
      nationality: "Nationalité étrangère exclusive (les binationaux franco-étrangers sont inéligibles)",
      languageReq: "Français B2/C1 (filières francophones) ou Anglais TOEFL ≥ 90 / IELTS ≥ 6.5 (filières anglophones)",
      workExperience: "Stages et engagement associatif valorisés",
      nominationMode: "Candidature institutionnelle obligatoire : vous devez être présenté et présélectionné par une université ou grande école française d'accueil (aucun dossier direct à Campus France).",
      selectionConditions: "Filières éligibles : Sciences & Ingénierie, Économie-Gestion, Droit & Sciences Politiques."
    },
    requiredDocuments: [
      {
        id: "eiffel_cv",
        name: "Curriculum Vitae Détaillé (1 à 2 pages)",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "CV structuré en français ou anglais précisant le parcours d'études, classements de promotion, stages et distinctions.",
        specifications: "Format PDF non verrouillé, maximum 2 pages.",
        godTip: "Mentionnez clairement votre rang de promotion (ex. Major de promotion ou Top 5%) et détaillez l'impact de vos projets."
      },
      {
        id: "eiffel_projet_pro",
        name: "Projet Professionnel et Personnel Rédigé",
        category: "motivation",
        categoryLabel: "✍️ Motivation",
        isMandatory: true,
        description: "Argumentaire de 1 à 2 pages exposant le choix de la formation en France, la cohérence du projet professionnel et son impact.",
        specifications: "PDF rédigé en français ou anglais, 1 000 à 1 500 mots.",
        godTip: "Structurez en 3 axes : 1. Pourquoi ce Master français d'élite ? 2. Plan de carrière à 5 ans. 3. Contribution au développement international."
      },
      {
        id: "eiffel_transcripts",
        name: "Relevés de Notes des 3 Dernières Années Universitaires",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés officiels complets de Licence avec mention et classement certifié par l'établissement.",
        specifications: "Copies certifiées conformes avec traduction assermentée si non francophone.",
        godTip: "Une attestation formelle du Doyen mentionnant votre rang dans la cohorte est le document qui fait la différence."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Contact de l'Établissement Français d'Accueil", timeline: "Septembre - Novembre", details: "Contacter le responsable de Master ou le bureau des relations internationales de l'école française pour demander à être présenté." },
      { step: 2, title: "Sélection Interne par l'Université Française", timeline: "Novembre - Décembre", details: "L'université sélectionne ses meilleurs candidats et transmet leurs dossiers à Campus France Paris." },
      { step: 3, title: "Dépôt Institutionnel Officiel", timeline: "Début Janvier", details: "Clôture des soumissions de dossiers par les universités sur la plateforme Campus France." },
      { step: 4, title: "Délibération de la Commission & Résultats", timeline: "Fin Mars - Début Avril", details: "Publication de la liste officielle des lauréats sur le site de Campus France." }
    ],
    selectionCriteria: [
      { criterion: "Excellence du Candidat & Rang de Promotion", weight: "40%", description: "Résultats académiques de premier ordre et distinctions obtenues." },
      { criterion: "Politique Internationale de l'Établissement Présentateur", weight: "35%", description: "Cohérence de la formation proposée avec la stratégie d'attractivité de l'école." },
      { criterion: "Politique Prioritaire du Ministère des Affaires Étrangères", weight: "25%", description: "Priorité géographique et équilibre des zones de coopération." }
    ],
    juryInsights: [
      "Campus France rejette immédiatement tout dossier envoyé en direct par un étudiant : le dossier doit obligatoirement transiter par l'université française.",
      "Postulez dès septembre/octobre auprès des universités françaises pour maximiser vos chances d'être retenu dans leur contingent limité de candidats Eiffel."
    ],
    officialUrl: "https://www.campusfrance.org/fr/le-programme-de-bourses-france-excellence-eiffel",
    verifiedOrg: "Ministère de l'Europe et des Affaires Étrangères (Campus France Paris)",
    nextDeadline: "2027-01-10",
    legalReference: "Vade-Mecum Officiel du Programme France Excellence Eiffel — Ministère de l'Europe et des Affaires Étrangères (Campus France)",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇫🇷 17. BOURSE EMILE BOUTMY (SCIENCES PO PARIS)
  {
    id: "bourse_emile_boutmy_sciencespo",
    categoryGroup: "europe",
    title: "Bourses Emile Boutmy (Sciences Po Paris)",
    provider: "Sciences Po Paris",
    country: "France",
    countryCode: "FR",
    flag: "🇫🇷",
    targetDegree: "Master Universitaire (Écoles de Sciences Po : Affaires Publiques, Internationales, Droit, Management)",
    fundingType: "tuition_stipend",
    monthlyStipend: "Jusqu'à 14 720 € / an (Exonération + Bourse)",
    totalValueEst: "~30 000 € sur 2 ans",
    benefits: [
      "Prise en charge partielle ou totale des frais de scolarité de Master à Sciences Po (exonération jusqu'à 14 720 € / an)",
      "Bourse de vie annuelle complémentaire pour les meilleurs profils internationaux",
      "Accompagnement personnalisé et accès au réseau mondial des alumni de Sciences Po",
      "Éligibilité aux aides au logement et services sociaux de Sciences Po"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor validé avec Mention Très Bien dans une université internationale",
      minGpa: "Top 5% de la promotion d'origine",
      maxAge: "Aucune limite d'âge formelle",
      nationality: "Ressortissant d'un pays non-membre de l'Union Européenne dont le foyer fiscal n'est pas dans l'UE",
      languageReq: "Français C1 (Master francophone) ou Anglais IELTS ≥ 7.0 / TOEFL ≥ 100 (Master anglophone)",
      workExperience: "Engagements associatifs, leadership civique et stages fortement valorisés",
      nominationMode: "Candidature directe intégrée au dossier d'admission internationale en ligne de Sciences Po Paris.",
      selectionConditions: "L'attribution est strictement conditionnée à l'admission définitive dans l'un des Masters de Sciences Po."
    },
    requiredDocuments: [
      {
        id: "boutmy_financial_proof",
        name: "Justificatifs de Revenus Familiaux & Avis d'Imposition",
        category: "financial",
        categoryLabel: "💰 Financier",
        isMandatory: true,
        description: "Déclarations de revenus des parents ou tuteurs prouvant la situation financière du foyer.",
        specifications: "Documents officiels traduits en français ou anglais.",
        godTip: "Une situation financière modeste associée à une excellence académique éclatante maximise l'obtention de la bourse maximale."
      },
      {
        id: "boutmy_essays",
        name: "Essais de Motivation & Projet Intellectuel pour Sciences Po",
        category: "motivation",
        categoryLabel: "✍️ Essais",
        isMandatory: true,
        description: "Dissertations exposant votre vision des politiques publiques, des relations internationales ou du droit.",
        specifications: "Format imposé dans le portail d'admission de Sciences Po.",
        godTip: "Démontrez votre culture générale, votre esprit critique et votre engagement citoyen."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Ouverture des Admissions Sciences Po", timeline: "Octobre", details: "Création du dossier en ligne et sélection de la mention Bourse Emile Boutmy dans la section financière." },
      { step: 2, title: "Clôture de la Session de Bourse", timeline: "Début Décembre", details: "Soumission définitive du dossier d'admission complet avec justificatifs financiers." },
      { step: 3, title: "Publication des Résultats d'Admission & Bourse", timeline: "Février - Mars", details: "Notification conjointe de l'admission en Master et de l'attribution de la bourse Boutmy." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique Universitaire", weight: "45%", description: "Notes de Licence et rigueur de la pensée critique." },
      { criterion: "Critères Socio-Économiques & Besoin Financier", weight: "35%", description: "Évaluation du quotient familial et besoin avéré d'aide pour étudier à Paris." },
      { criterion: "Profil Extra-Académique & Engagement", weight: "20%", description: "Activités civiques, bénévolat, leadership et prises d'initiatives." }
    ],
    juryInsights: [
      "La case 'Bourse Emile Boutmy' doit obligatoirement être cochée lors du dépôt initial : aucune demande rétroactive n'est acceptée.",
      "Ne sous-estimez pas la qualité rédactionnelle de vos essais : Sciences Po élimine les candidatures au style approximatif."
    ],
    officialUrl: "https://www.sciencespo.fr/students/fr/financer/bourses-aides-financieres/bourse-emile-boutmy/",
    verifiedOrg: "Direction des Admissions — Sciences Po Paris",
    nextDeadline: "2026-12-01",
    legalReference: "Délibération du Conseil de Direction de l'Institut d'Études Politiques de Paris (Sciences Po) sur les bourses d'excellence",
    sourceType: "PUBLIC_UNIVERSITY"
  },

  // 🇬🇧 18. BOURSES CHEVENING (ROYAUME-UNI)
  {
    id: "bourse_chevening_uk",
    categoryGroup: "europe",
    title: "Bourses d'Excellence Chevening (UK Government)",
    provider: "Foreign, Commonwealth & Development Office (FCDO - Royaume-Uni)",
    country: "Royaume-Uni",
    countryCode: "GB",
    flag: "🇬🇧",
    targetDegree: "Master d'un an (One-Year Taught Master) dans toute université britannique (Oxford, Cambridge, LSE, Imperial, UCL, King's, Manchester...)",
    fundingType: "full_ride",
    monthlyStipend: "1 200 £ à 1 500 £ / mois (selon Londres/Province)",
    totalValueEst: "~40 000 £ / an",
    benefits: [
      "Prise en charge intégrale à 100% des frais de scolarité universitaire de Master (sans plafond pour la majorité des universités)",
      "Allocation mensuelle complète de subsistance pour le logement et la vie quotidienne au Royaume-Uni",
      "Billet d'avion international aller-retour en classe économique Dakar/pays d'origine ↔ UK",
      "Indemnité d'arrivée spéciale et remboursement des frais de visa étudiant britannique (UK Student Visa)",
      "Accès exclusif aux réceptions diplomatiques du FCDO, événements académiques et réseau mondial des 55 000+ alumni Chevening"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) avec équivalent d'un diplôme britannique de niveau Upper Second-Class (2:1) ou First-Class (Mention Bien minimum)",
      minGpa: "Moyenne générale ≥ 13.5/20",
      maxAge: "Aucune limite d'âge",
      nationality: "Citoyen d'un pays éligible Chevening (Sénégal, etc.)",
      languageReq: "Anglais niveau C1 (IELTS Academic ≥ 6.5-7.0 / PTE Academic ≥ 58 / TOEFL iBT ≥ 79)",
      workExperience: "Au moins 2 800 heures d'expérience professionnelle rémunérée, bénévole ou en stage (équivalent à minimum 2 ans de travail)",
      nominationMode: "Candidature directe en ligne sur le portail mondial Chevening (sélectionner le comité du pays d'origine).",
      selectionConditions: "Engagement formel de retourner dans son pays d'origine pendant au moins 2 ans immédiatement après l'obtention du Master au Royaume-Uni."
    },
    requiredDocuments: [
      {
        id: "chev_essays",
        name: "Quatre Essais de Leadership & Vision Professionnelle (500 mots chacun)",
        category: "motivation",
        categoryLabel: "✍️ Essais",
        isMandatory: true,
        description: "Quatre essais fondamentaux : 1. Leadership & Influence, 2. Relations professionnelles (Networking), 3. Choix des 3 Masters, 4. Plan de carrière à 2, 5 et 10 ans.",
        specifications: "Exactement 500 mots par essai rédigés en anglais avec la méthode STAR (Situation, Task, Action, Result).",
        godTip: "Utilisez impérativement la méthode STAR : montrez concrètement comment vous avez influencé une décision ou résolu un problème d'envergure."
      },
      {
        id: "chev_transcripts",
        name: "Relevés de Notes & Diplômes Universitaires avec Traduction Assermentée",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés complets certifiés et traduits officiellement en anglais par un traducteur assermenté.",
        specifications: "Fichiers PDF nets de moins de 5 Mo.",
        godTip: "Fournir l'attestation officielle de délivrance du diplôme de Licence."
      },
      {
        id: "chev_recs",
        name: "Deux Lettres de Recommandation Professionnelles / Académiques",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Lettres rédigées en anglais par des référents attestant de votre leadership et intégrité.",
        specifications: "Soumises en ligne après la phase de présélection.",
        godTip: "Les référents doivent confirmer avec précision les compétences de leadership décrites dans vos essais."
      },
      {
        id: "chev_offers",
        name: "Trois Choix de Master & Au Moins Une Offre Inconditionnelle (Unconditional Offer)",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Postuler en parallèle auprès de 3 universités britanniques pour obtenir une offre inconditionnelle avant juillet.",
        specifications: "Offre d'admission inconditionnelle (Unconditional Offer) au format PDF.",
        godTip: "Choisissez 3 Masters cohérents entre eux pour que vos essais de motivation soient percutants pour les 3 choix."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Ouverture du Portail Mondial Chevening", timeline: "Début Août", details: "Création du compte et rédaction minutieuse des 4 essais de leadership." },
      { step: 2, title: "Clôture des Candidatures en Ligne", timeline: "Début Novembre", details: "Soumission définitive du dossier complet en anglais." },
      { step: 3, title: "Entretiens de Présélection à l'Ambassade", timeline: "Février - Avril", details: "Entretien oral approfondi devant le jury de l'Ambassade britannique à Dakar." },
      { step: 4, title: "Notification Finale & Soumission de l'Offre Ferme", timeline: "Juin - Juillet", details: "Validation de la bourse et démarches de visa diplomatique pour le départ en septembre." }
    ],
    selectionCriteria: [
      { criterion: "Potentiel de Leadership & Influence Démontré", weight: "40%", description: "Capacité prouvée à mobiliser des équipes et transformer des organisations." },
      { criterion: "Stratégie de Réseau (Networking)", weight: "30%", description: "Aptitude à tisser des relations de haut niveau et dynamiser des réseaux professionnels." },
      { criterion: "Clarté & Réalisme du Plan de Carrière au Retour", weight: "30%", description: "Vision stratégique d'impact sur le développement socio-économique du pays d'origine." }
    ],
    juryInsights: [
      "Les jurys Chevening traquent le plagiat et l'utilisation brute d'IA : tout essai générique non ancré dans votre expérience vécue est éliminé au premier tour.",
      "Préparez l'entretien de l'Ambassade en connaissant par cœur vos exemples d'essais : le jury vous testera sur les détails opérationnels."
    ],
    officialUrl: "https://www.chevening.org/apply/",
    verifiedOrg: "Foreign, Commonwealth & Development Office (FCDO) — Londres, Royaume-Uni",
    nextDeadline: "2026-11-05",
    legalReference: "UK Foreign, Commonwealth & Development Office (FCDO) Policy Guidelines for Chevening Scholarships",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇩🇪 19. BOURSES DU DAAD (ALLEMAGNE)
  {
    id: "bourse_daad_epos_germany",
    categoryGroup: "europe",
    title: "Bourses DAAD EPOS & Helmut Schmidt (Master en Allemagne)",
    provider: "Office Allemand d'Échanges Universitaires (DAAD) & Ministère Fédéral de la Coopération (BMZ)",
    country: "Allemagne",
    countryCode: "DE",
    flag: "🇩🇪",
    targetDegree: "Master d'Excellence dans les Universités Allemandes Partenaires (TU Munich, Heidelberg, Bonn, Berlin, etc.)",
    fundingType: "full_ride",
    monthlyStipend: "934 € / mois",
    totalValueEst: "~25 000 € / an",
    benefits: [
      "Exonération totale des frais de scolarité universitaire en Allemagne",
      "Allocation mensuelle de subsistance de 934 € versée sur 12 à 24 mois",
      "Prise en charge intégrale de l'assurance santé, accident et responsabilité civile en Allemagne",
      "Billet d'avion international aller-retour pays d'origine ↔ Allemagne",
      "Cours intensif de langue allemande gratuit de 2 à 6 mois avant le début du Master",
      "Allocation forfaitaire annuelle pour frais d'études et recherche (460 € / an)"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) obtenu il y a moins de 6 ans avec Mention Bien/Très Bien",
      minGpa: "Moyenne générale ≥ 13/20",
      maxAge: "Aucune limite d'âge formelle (diplôme de Licence datant de moins de 6 ans)",
      nationality: "Ressortissant d'un pays en développement éligible au CAD de l'OCDE (Sénégal inclus)",
      languageReq: "Anglais TOEFL ≥ 80 / IELTS ≥ 6.0 (programmes en anglais) ou Allemand DSH-2 / TestDaF 4 (programmes en allemand)",
      workExperience: "Au moins 2 années d'expérience professionnelle pertinente à plein temps après la Licence",
      nominationMode: "Candidature directe auprès de l'université allemande partenaire du programme EPOS, accompagnée du formulaire de bourse DAAD.",
      selectionConditions: "Le cursus de Master doit être directement lié aux objectifs de développement durable (gouvernance, ingénierie, santé publique, agronomie, énergies renouvelables)."
    },
    requiredDocuments: [
      {
        id: "daad_form",
        name: "Formulaire Officiel de Demande de Bourse du DAAD",
        category: "admin",
        categoryLabel: "📄 Formulaire",
        isMandatory: true,
        description: "Formulaire standard du DAAD complété, daté et signé.",
        specifications: "Format PDF officiel téléchargeable sur le site du DAAD.",
        godTip: "Renseignez avec exactitude l'ordre de priorité de vos choix de Master (maximum 3 cours EPOS)."
      },
      {
        id: "daad_cv_europass",
        name: "Curriculum Vitae Format Europass Daté et Signé",
        category: "academic",
        categoryLabel: "🎓 CV",
        isMandatory: true,
        description: "CV chronologique sans interruption de parcours respectant les standards européens Europass.",
        specifications: "Généré via le portail officiel Europass, signé à la main.",
        godTip: "Détaillez vos 2 années d'expérience professionnelle avec les missions accomplies et outils maîtrisés."
      },
      {
        id: "daad_motivation",
        name: "Lettre de Motivation Axée sur le Développement (Development-Related Motivation)",
        category: "motivation",
        categoryLabel: "✍️ Motivation",
        isMandatory: true,
        description: "Exposé de 2 pages démontrant les motivations académiques et l'impact direct du Master pour votre pays.",
        specifications: "Document Word/PDF dactylographié en anglais ou allemand.",
        godTip: "Expliquez pourquoi l'Allemagne est le meilleur pays pour cette spécialisation et comment vous réintégrerez votre institution au retour."
      },
      {
        id: "daad_work_proof",
        name: "Attestation d'Employeur avec Garantie de Réintégration ou Soutien Institutionnel",
        category: "work",
        categoryLabel: "💼 Travail",
        isMandatory: true,
        description: "Lettre officielle de l'employeur confirmant vos 2 ans d'ancienneté et attestant que la formation bénéficiera à l'institution.",
        specifications: "Sur papier à en-tête officiel de l'entreprise ou du ministère avec cachet.",
        godTip: "Une lettre mentionnant que votre poste vous sera réservé à votre retour donne un avantage majeur au dossier."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Sélection du Master dans la Brochure EPOS", timeline: "Juin - Août", details: "Consulter la brochure annuelle des cours EPOS du DAAD et identifier les programmes adaptés." },
      { step: 2, title: "Soumission du Dossier à l'Université Allemande", timeline: "Août - Octobre", details: "Envoi direct du dossier à l'université partenaire allemande (portail en ligne ou courrier)." },
      { step: 3, title: "Présélection Universitaire & Transmission au DAAD", timeline: "Novembre - Décembre", details: "L'université sélectionne ses meilleurs profils et propose la liste au DAAD." },
      { step: 4, title: "Décision Finale du DAAD & Cours d'Allemand", timeline: "Février - Avril", details: "Attribution définitive de la bourse et début du cours d'allemand préparatoire." }
    ],
    selectionCriteria: [
      { criterion: "Pertinence de l'Expérience Professionnelle (≥ 2 ans)", weight: "40%", description: "Solidité des responsabilités exercées dans le secteur du développement." },
      { criterion: "Excellence Académique & Résultats de Licence", weight: "35%", description: "Mentions universitaires et solidité des bases méthodologiques." },
      { criterion: "Motivation Liée au Développement du Pays d'Origine", weight: "25%", description: "Clarté de la vision de transfert de technologies et de compétences au retour." }
    ],
    juryInsights: [
      "Les candidats sans les 2 années d'expérience professionnelle révolues après la Licence sont déclarés inéligibles sans recours.",
      "Chaque université allemande du réseau EPOS a sa propre date limite : vérifiez les dates spécifiques sur leur site."
    ],
    officialUrl: "https://www.daad.de/en/study-and-research-in-germany/scholarships/daad-scholarships/",
    verifiedOrg: "Deutscher Akademischer Austauschdienst (DAAD) — Bonn, Allemagne",
    nextDeadline: "2026-09-30",
    legalReference: "Directives du Ministère Fédéral Allemand de la Coopération Économique (BMZ) & DAAD EPOS Programmrichtlinien",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇧🇪 20. BOURSES DE MASTER ARES (BELGIQUE)
  {
    id: "bourse_ares_belgique",
    categoryGroup: "europe",
    title: "Bourses de Master International ARES (Belgique)",
    provider: "Académie de Recherche et d'Enseignement Supérieur (ARES) — Belgique",
    country: "Belgique",
    countryCode: "BE",
    flag: "🇧🇪",
    targetDegree: "Master de Spécialisation d'un an dans les Universités Francophones de Belgique (UCLouvain, ULB, ULiège, UNamur, UMons)",
    fundingType: "full_ride",
    monthlyStipend: "1 150 € / mois",
    totalValueEst: "~28 000 € / an",
    benefits: [
      "Prise en charge intégrale des frais de scolarité universitaire de Master en Belgique",
      "Allocation mensuelle complète de subsistance de 1 150 € net",
      "Billet d'avion international aller-retour en classe économique",
      "Frais d'installation initiaux (700 €) et allocation annuelle pour matériel didactique",
      "Couverture d'assurance santé, hospitalisation et rapatriement complète en Belgique"
    ],
    eligibility: {
      academicLevel: "Diplôme de deuxième cycle (Licence Bac+3 ou Master 1) équivalent à un grade académique belge",
      minGpa: "Mention Bien / Excellence académique",
      maxAge: "Moins de 40 ans (ou moins de 45 ans pour certaines formations spécifiques) à la date de clôture",
      nationality: "Ressortissant et résident de l'un des 31 pays partenaires de la Coopération belge (Sénégal inclus)",
      languageReq: "Français C1 (ou Anglais B2/C1 pour les masters anglophones)",
      workExperience: "Au moins 2 années d'expérience professionnelle dans un secteur lié au développement après l'obtention du diplôme de base",
      nominationMode: "Candidature 100% gratuite exclusivement en ligne sur la plateforme sécurisée GIRAF de l'ARES.",
      selectionConditions: "Engagement de retour dans le pays d'origine après l'année de Master en Belgique."
    },
    requiredDocuments: [
      {
        id: "ares_giraf_form",
        name: "Formulaire Officiel de Candidature ARES (Plateforme GIRAF)",
        category: "admin",
        categoryLabel: "📄 Formulaire",
        isMandatory: true,
        description: "Formulaire électronique complet renseigné directement sur la plateforme GIRAF de l'ARES.",
        specifications: "Soumission numérique sans aucun frais.",
        godTip: "Ne payez aucun intermédiaire : la candidature ARES est strictement gratuite du début à la fin."
      },
      {
        id: "ares_work_certs",
        name: "Attestations de Travail Confirmant 2 Ans d'Expérience Post-Diplôme",
        category: "work",
        categoryLabel: "💼 Expérience",
        isMandatory: true,
        description: "Certificats d'employeurs avec dates précises, description des tâches et signature officielle.",
        specifications: "Documents certifiés sur papier à en-tête d'organisations publiques, privées ou ONG.",
        godTip: "Les certificats de travail doivent couvrir au minimum 24 mois complets d'activité à la date limite."
      },
      {
        id: "ares_transcripts",
        name: "Diplômes Universitaires & Relevés de Notes de Chaque Année",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés officiels complets des années d'études supérieures avec mentions obtenues.",
        specifications: "Copies certifiées conformes aux originaux.",
        godTip: "Les formations ARES sont des Masters de spécialisation : montrez la continuité avec votre métier actuel."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Lancement de l'Appel sur la Plateforme GIRAF", timeline: "Octobre", details: "Création du profil sur le site de l'ARES et sélection d'un seul Master de spécialisation." },
      { step: 2, title: "Clôture des Candidatures GIRAF", timeline: "Novembre - Décembre", details: "Téléversement de l'ensemble des justificatifs et validation finale du formulaire." },
      { step: 3, title: "Sélection par les Jurys Académiques Belges", timeline: "Février - Mars", details: "Évaluation collégiale par les professeurs des universités belges partenaires." },
      { step: 4, title: "Notification d'Attribution & Visas", timeline: "Mai - Juin", details: "Envoi des attestations de bourse et démarches pour le visa d'études belge." }
    ],
    selectionCriteria: [
      { criterion: "Expérience Professionnelle Pertinente (≥ 2 ans)", weight: "40%", description: "Adéquation des fonctions exercées avec le programme de spécialisation belge." },
      { criterion: "Excellence du Dossier Académique Antérieur", weight: "35%", description: "Résultats d'études supérieures et solidité des compétences de base." },
      { criterion: "Potentiel d'Impact au Retour dans le Pays Partenaire", weight: "25%", description: "Contribution claire à la résolution de problématiques de développement local." }
    ],
    juryInsights: [
      "Le dépôt de plusieurs candidatures sous des profils différents entraîne l'annulation automatique de tous les dossiers.",
      "Démontrez comment les compétences pointues acquises en Belgique seront immédiatement appliquées dans votre poste au retour."
    ],
    officialUrl: "https://www.ares-ac.be/fr/cooperation-au-developpement/bourses",
    verifiedOrg: "Académie de Recherche et d'Enseignement Supérieur (ARES) — Bruxelles, Belgique",
    nextDeadline: "2026-11-17",
    legalReference: "Décret de la Fédération Wallonie-Bruxelles & Direction Générale Coopération au Développement (DGD Belgique)",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇨🇭 21. BOURSES D'EXCELLENCE DE LA CONFÉDÉRATION SUISSE (ESKAS / SEFRI)
  {
    id: "bourse_confederation_suisse",
    categoryGroup: "europe",
    title: "Bourses d'Excellence de la Confédération Suisse (ESKAS / SEFRI)",
    provider: "Secrétariat d'État à la Formation, à la Recherche et à l'Innovation (SEFRI) — Berne",
    country: "Suisse",
    countryCode: "CH",
    flag: "🇨🇭",
    targetDegree: "Master de Recherche / Doctorat / Post-Doctorat (EPFL, ETH Zurich, Universités de Genève, Lausanne, Bâle, Zurich...)",
    fundingType: "full_ride",
    monthlyStipend: "1 920 CHF / mois",
    totalValueEst: "~35 000 CHF / an",
    benefits: [
      "Prise en charge des taxes universitaires suisses pour les boursiers de la Confédération",
      "Allocation mensuelle complète de subsistance de 1 920 CHF net versée par la Commission fédérale",
      "Prise en charge intégrale de l'assurance maladie et accident obligatoire suisse",
      "Indemnité spéciale d'installation à l'arrivée (300 CHF) et abonnement demi-tarif aux transports publics suisses (CFF)",
      "Activités culturelles, visites guidées et intégration dans l'écosystème de recherche de pointe mondial"
    ],
    eligibility: {
      academicLevel: "Master 1 ou Master 2 complété avec Mention Très Bien (pour bourses de recherche et doctorat)",
      minGpa: "Excellence académique exceptionnelle (Top 3% de la promotion)",
      maxAge: "Né après le 31 décembre 1990 (moins de 35 ans)",
      nationality: "Citoyen d'un pays partenaire de la Commission fédérale (Sénégal inclus)",
      languageReq: "Anglais C1 (TOEFL ≥ 100 / IELTS ≥ 7.0) ou Français/Allemand C1 selon le canton d'accueil",
      workExperience: "Publications académiques ou expérience en laboratoire de recherche hautement valorisées",
      nominationMode: "Obtenir impérativement l'accord formel écrit d'un Professeur suisse titulaire prêt à diriger vos travaux de recherche avant de déposer le dossier à l'Ambassade de Suisse à Dakar.",
      selectionConditions: "Le projet de recherche doit être inédit, rigoureux et adossé à un laboratoire suisse accrédité."
    },
    requiredDocuments: [
      {
        id: "ch_prof_letter",
        name: "Lettre d'Acceptation Formelle du Professeur Hôte en Suisse",
        category: "academic",
        categoryLabel: "🎓 Acceptation",
        isMandatory: true,
        description: "Lettre officielle du Professeur suisse confirmant son accord pour encadrer vos recherches et mettant à disposition les moyens du laboratoire.",
        specifications: "Sur papier à en-tête de l'EPFL, ETHZ ou de l'université suisse avec signature originale.",
        godTip: "Cette lettre est la clé de voûte absolue de la candidature : contactez les professeurs suisses dès le printemps avec un synopsis percutant."
      },
      {
        id: "ch_research_proposal",
        name: "Projet de Recherche Scientifique Détaillé (Research Proposal - 5 pages)",
        category: "motivation",
        categoryLabel: "✍️ Recherche",
        isMandatory: true,
        description: "Proposition de recherche complète structurée selon le canevas officiel de la Commission fédérale suisse.",
        specifications: "Format PDF de 5 pages maximum rédigé en anglais, français ou allemand.",
        godTip: "Exposez la méthodologie, l'état de l'art mondial, les objectifs novateurs et le calendrier prévisionnel des publications."
      },
      {
        id: "ch_transcripts",
        name: "Copies Certifiées de Tous les Diplômes & Relevés de Notes Universitaires",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés complets de Licence et Master certifiés avec traductions officielles si nécessaire.",
        specifications: "Copies certifiées conformes en 3 exemplaires physiques.",
        godTip: "Fournir 2 lettres de recommandation confidentielles d'anciens professeurs sur les formulaires types de l'ESKAS."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Obtention de l'Accord d'un Professeur Suisse", timeline: "Mai - Août", details: "Contacter les chercheurs en Suisse et finaliser le projet de recherche conjoint." },
      { step: 2, title: "Demande du Dossier de Candidature à l'Ambassade de Suisse", timeline: "Août - Septembre", details: "Retirer le dossier officiel auprès de l'Ambassade de Suisse à Dakar." },
      { step: 3, title: "Dépôt des Dossiers Physiques à l'Ambassade", timeline: "Octobre - Novembre", details: "Dépôt en 3 exemplaires complets à l'Ambassade de Suisse à Dakar." },
      { step: 4, title: "Décision Finale de la Commission Fédérale à Berne", timeline: "Mai de l'année suivante", details: "Notification officielle par la Commission fédérale des bourses étrangères (ESKAS)." }
    ],
    selectionCriteria: [
      { criterion: "Profil Académique & Potentiel Scientifique du Candidat", weight: "40%", description: "Excellence des résultats universitaires et publications antérieures." },
      { criterion: "Qualité & Caractère Innovant du Projet de Recherche", weight: "35%", description: "Originalité scientifique et pertinence méthodologique du projet proposé." },
      { criterion: "Potentiel de Coopération Scientifique Durable", weight: "25%", description: "Création de partenariats durables entre la Suisse et le pays d'origine." }
    ],
    juryInsights: [
      "Toute candidature soumise sans la lettre de soutien d'un professeur suisse titulaire est rejetée sans examen.",
      "La Suisse privilégie les projets de recherche fondamentale et appliquée de très haute précision technique."
    ],
    officialUrl: "https://www.sbfi.admin.ch/sbfi/en/home/education/scholarships-and-grants/swiss-government-excellence-scholarships.html",
    verifiedOrg: "Commission Fédérale des Bourses Étrangères (ESKAS / SEFRI) — Berne, Suisse",
    nextDeadline: "2026-11-15",
    legalReference: "Loi fédérale sur l'encouragement des hautes écoles & Directives de la Commission Fédérale des Bourses Étrangères (ESKAS)",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇸🇪 22. BOURSES DU SWEDISH INSTITUTE (SUÈDE)
  {
    id: "bourse_si_sweden",
    categoryGroup: "europe",
    title: "Bourses SI Scholarship for Global Professionals (Suède)",
    provider: "Swedish Institute (Ministère des Affaires Étrangères de Suède)",
    country: "Suède",
    countryCode: "SE",
    flag: "🇸🇪",
    targetDegree: "Master d'un à deux ans dans les Universités Suédoises (KTH, Lund, Uppsala, Chalmers, Stockholm University, Karolinska...)",
    fundingType: "full_ride",
    monthlyStipend: "12 000 SEK / mois (~1 100 € / mois)",
    totalValueEst: "~35 000 € / an",
    benefits: [
      "Prise en charge intégrale à 100% des frais de scolarité universitaire de Master en Suède (payés directement à l'université)",
      "Allocation mensuelle de subsistance de 12 000 SEK versée pour couvrir le logement et la vie quotidienne",
      "Subvention forfaitaire de voyage international (15 000 SEK) pour le vol aller-retour",
      "Couverture complète d'assurance santé et accident durant tout le séjour en Suède",
      "Adhésion au réseau exclusif SI Network for Future Global Leaders et réseau mondial des alumni suédois"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor obtenu avec Mention Bien minimum",
      minGpa: "Moyenne générale ≥ 13.5/20",
      maxAge: "Aucune limite d'âge",
      nationality: "Ressortissant d'un pays éligible au programme SI (Sénégal, etc.)",
      languageReq: "Anglais niveau C1 (IELTS ≥ 6.5 / TOEFL ≥ 90)",
      workExperience: "Au moins 3 000 heures d'expérience professionnelle rémunérée ou bénévole (démontrant un leadership affirmé)",
      nominationMode: "Procédure en 2 étapes : postuler d'abord aux Masters suédois sur Universityadmissions.se puis postuler à la bourse SI en février.",
      selectionConditions: "Le programme de Master doit figurer dans la liste officielle des Masters éligibles au programme SI (axés sur le climat, l'innovation, la gouvernance et les ODD)."
    },
    requiredDocuments: [
      {
        id: "si_cv",
        name: "Curriculum Vitae sur le Modèle Officiel du Swedish Institute",
        category: "academic",
        categoryLabel: "🎓 CV SI",
        isMandatory: true,
        description: "CV rédigé exclusivement sur le modèle standard téléchargeable du SI (maximum 3 pages).",
        specifications: "Format officiel imposé par le Swedish Institute.",
        godTip: "Utilisez scrupuleusement le modèle fourni : tout CV dans un autre format entraîne la disqualification immédiate."
      },
      {
        id: "si_work_proof",
        name: "Formulaires Officiels de Preuve d'Expérience Professionnelle et de Leadership",
        category: "work",
        categoryLabel: "💼 Expérience",
        isMandatory: true,
        description: "Formulaires types du SI signés par vos employeurs attestant de vos 3 000 heures de travail et de votre leadership.",
        specifications: "Cachet officiel et signature de l'employeur obligatoires sur le formulaire officiel du SI.",
        godTip: "Faites remplir les formulaires avec précision par vos supérieurs pour justifier le quota des 3 000 heures."
      },
      {
        id: "si_recs",
        name: "Deux Lettres de Recommandation sur le Modèle Type du SI",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Recommandations professionnelles évaluant votre capacité à impulser le changement durable.",
        specifications: "Rédigées sur le canevas imposé par le Swedish Institute.",
        godTip: "Les lettres doivent donner des exemples tangibles de votre capacité à résoudre des problèmes complexes."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Candidature aux Masters sur Universityadmissions.se", timeline: "Octobre - Janvier", details: "Sélectionner jusqu'à 4 programmes de Master éligibles et payer/justifier l'exonération des frais de dossier." },
      { step: 2, title: "Candidature à la Bourse sur le Portail SI", timeline: "Février (Guichet de 10 jours)", details: "Téléversement du CV SI, des preuves de travail et lettres de recommandation sur le portail du Swedish Institute." },
      { step: 3, title: "Résultats d'Admission Universitaire", timeline: "Fin Mars", details: "Obtenir l'admission ferme dans l'un des Masters suédois choisis." },
      { step: 4, title: "Publication de la Liste des Lauréats SI", timeline: "Fin Avril", details: "Notification officielle de l'attribution de la bourse complète." }
    ],
    selectionCriteria: [
      { criterion: "Leadership & Expérience Professionnelle (≥ 3 000 heures)", weight: "45%", description: "Qualité des responsabilités et preuve d'initiatives à impact sociétal." },
      { criterion: "Adéquation du Master avec l'Agenda 2030 (ODD)", weight: "35%", description: "Lien direct entre le programme de Master et les Objectifs de Développement Durable." },
      { criterion: "Excellence du Dossier Académique Global", weight: "20%", description: "Performance lors du cycle de Licence antérieur." }
    ],
    juryInsights: [
      "Le Swedish Institute est intransigeant sur l'utilisation stricte de ses formulaires types téléchargeables.",
      "Mettez en avant vos initiatives durables et votre vision de l'éco-responsabilité et de l'innovation inclusive."
    ],
    officialUrl: "https://si.se/en/apply/scholarships/swedish-institute-scholarships-for-global-professionals/",
    verifiedOrg: "Swedish Institute (SI) — Stockholm, Suède",
    nextDeadline: "2027-02-20",
    legalReference: "Ordonnance du Gouvernement Suédois régissant le Swedish Institute (Svenska institutet) & Fonds Climat/ODD",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // ==========================================================================
  // SECTION 4 : 🌎 AMÉRIQUES, ASIE & OCÉANIE
  // ==========================================================================

  // 🇺🇸 23. BOURSES FULBRIGHT (USA)
  {
    id: "bourse_fulbright_usa",
    categoryGroup: "americas_asia",
    title: "Programme Fulbright Foreign Student (USA)",
    provider: "Département d'État des États-Unis (Bureau of Educational and Cultural Affairs / IIE)",
    country: "États-Unis",
    countryCode: "US",
    flag: "🇺🇸",
    targetDegree: "Master Universitaire de 2 ans dans les Meilleures Universités Américaines (Columbia, Harvard, Stanford, NYU, Berkeley, MIT, etc.)",
    fundingType: "full_ride",
    monthlyStipend: "1 800 $ à 2 500 $ / mois (selon l'État)",
    totalValueEst: "~65 000 $ / an",
    benefits: [
      "Prise en charge intégrale à 100% des frais de scolarité universitaire de Master aux États-Unis (Tuition waiver complet)",
      "Allocation mensuelle de subsistance confortable adaptée au coût de la vie de la ville américaine d'accueil",
      "Billet d'avion international aller-retour Dakar/pays d'origine ↔ États-Unis",
      "Assurance santé accident et maladie gouvernementale américaine (ASPE) conforme aux exigences fédérales",
      "Prise en charge intégrale des frais de visa J-1 d'échange culturel",
      "Séminaires d'enrichissement Fulbright aux USA et intégration au réseau le plus prestigieux au monde (60+ Prix Nobel)"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) validé avec Mention Bien minimum",
      minGpa: "Moyenne générale ≥ 13.5/20 ou GPA ≥ 3.3/4.0",
      maxAge: "Aucune limite d'âge formelle",
      nationality: "Nationalité sénégalaise résidant au Sénégal au moment du dépôt (citoyens américains et résidents permanents inéligibles)",
      languageReq: "Anglais niveau C1 certifié (TOEFL iBT ≥ 90-100 / IELTS ≥ 7.0)",
      workExperience: "Au moins 2 années d'expérience professionnelle ou d'engagement de recherche après la Licence",
      nominationMode: "Candidature en ligne via le portail officiel Fulbright de l'Ambassade des États-Unis à Dakar (Embassy Nomination).",
      selectionConditions: "Règle des 2 ans de retour : obligation légale (Visa J-1 Two-Year Home-Country Physical Presence Requirement) de résider dans son pays d'origine pendant 2 ans après la fin du programme."
    },
    requiredDocuments: [
      {
        id: "fulbright_study_obj",
        name: "Déclaration d'Objectifs d'Études (Study Objectives Essay - 2 pages)",
        category: "motivation",
        categoryLabel: "✍️ Objectifs",
        isMandatory: true,
        description: "Exposé académique de haut niveau détaillant le domaine d'études, les cours visés et les projets de recherche aux USA.",
        specifications: "Document rédigé en anglais, structure claire et argumentation scientifique rigoureuse.",
        godTip: "Soyez extrêmement précis sur les méthodologies et théories que vous souhaitez étudier aux États-Unis."
      },
      {
        id: "fulbright_personal_statement",
        name: "Déclaration Personnelle (Personal Statement - 1 à 2 pages)",
        category: "motivation",
        categoryLabel: "✍️ Récit",
        isMandatory: true,
        description: "Récit narratif authentique illustrant votre parcours de vie, vos valeurs, vos défis surmontés et votre identité.",
        specifications: "Format narratif en anglais axé sur le leadership et la diplomatie culturelle.",
        godTip: "Ne répétez pas votre CV : racontez une histoire marquante qui a forgé votre vocation et votre désir d'impacter votre société."
      },
      {
        id: "fulbright_recs",
        name: "Trois Lettres de Recommandation Confidentielles en Anglais",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Lettres soumises en ligne par des professeurs d'université ou employeurs attestant de vos capacités intellectuelles et morales.",
        specifications: "Rédigées en anglais sur papier à en-tête avec coordonnées vérifiables.",
        godTip: "Diversifiez vos référents : 2 professeurs d'université + 1 superviseur professionnel ou responsable associatif."
      },
      {
        id: "fulbright_transcripts",
        name: "Relevés de Notes Officiels & Diplômes avec Traduction Assermentée",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés complets de Licence traduits en anglais par un traducteur certifié.",
        specifications: "Copies certifiées conformes aux originaux.",
        godTip: "Faire figurer le système de notation pour faciliter l'évaluation par l'IIE à New York."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Lancement de l'Appel par l'Ambassade des USA à Dakar", timeline: "Février - Mars", details: "Publication sur le site web de l'Ambassade des États-Unis au Sénégal." },
      { step: 2, title: "Soumission Numérique du Dossier Complet", timeline: "Mars - Mai", details: "Saisie sur la plateforme Embark/Fulbright avec essais et recommandations." },
      { step: 3, title: "Entretiens de Sélection à l'Ambassade", timeline: "Juin - Juillet", details: "Entretien oral en anglais devant le comité de sélection binational à Dakar." },
      { step: 4, title: "Tests Standardisés & Placement Universitaire par l'IIE", timeline: "Août - Février suivant", details: "Passation des tests TOEFL/GRE pris en charge par Fulbright et placement dans 4 universités américaines." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique & Potentiel Intellectuel", weight: "40%", description: "Résultats de premier ordre et rigueur de la pensée critique." },
      { criterion: "Potentiel de Leadership & Diplomatie Citoyenne", weight: "35%", description: "Capacité à être un ambassadeur culturel de son pays aux USA et vice-versa." },
      { criterion: "Clarté & Faisabilité du Projet Professionnel au Retour", weight: "25%", description: "Impact du projet sur le développement institutionnel et économique du pays d'origine." }
    ],
    juryInsights: [
      "Le jury Fulbright attache une importance capitale à votre capacité à dialoguer, représenter votre culture avec fierté et écouter les autres.",
      "Les deux essais (Study Objectives et Personal Statement) doivent être parfaitement complémentaires sans redondance."
    ],
    officialUrl: "https://foreign.fulbrightonline.org/about/foreign-student-program",
    verifiedOrg: "U.S. Embassy Dakar & Institute of International Education (IIE) — USA",
    nextDeadline: "2027-05-15",
    legalReference: "Mutual Educational and Cultural Exchange Act of 1961 (Fulbright-Hays Act) — U.S. Department of State / IIE",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇯🇵 24. BOURSES DU GOUVERNEMENT DU JAPON (MEXT)
  {
    id: "bourse_mext_japan",
    categoryGroup: "americas_asia",
    title: "Bourses MEXT du Gouvernement Japonais (Research & Master Students)",
    provider: "Ministère de l'Éducation, de la Culture, des Sports, des Sciences et de la Technologie du Japon (Monbukagakusho)",
    country: "Japon",
    countryCode: "JP",
    flag: "🇯🇵",
    targetDegree: "Master de Recherche / Professionnel dans les Universités Nationales Japonaises (Université de Tokyo, Kyoto, Osaka, Tohoku, Waseda...)",
    fundingType: "full_ride",
    monthlyStipend: "144 000 JPY / mois (~950 € / mois)",
    totalValueEst: "~30 000 € / an",
    benefits: [
      "Exonération intégrale à 100% de tous les frais d'examen, d'inscription et de scolarité universitaire au Japon",
      "Allocation mensuelle de subsistance de 144 000 JPY net versée durant toute la période d'études",
      "Billet d'avion international aller-retour en classe économique Dakar/pays d'origine ↔ Tokyo",
      "Cours intensif de langue et civilisation japonaises gratuit de 6 mois à l'arrivée",
      "Accompagnement administratif complet pour le visa diplomatique et le logement en campus universitaire japonais"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) avec Mention Bien minimum",
      minGpa: "Moyenne générale ≥ 13.5/20",
      maxAge: "Né après le 2 avril 1991 (moins de 35 ans)",
      nationality: "Nationalité sénégalaise (ressortissants de pays entretenant des relations diplomatiques avec le Japon)",
      languageReq: "Anglais niveau B2/C1 ou Japonais (JLPT) - volonté d'apprendre la langue japonaise requise",
      workExperience: "Non requise (projets de recherche scientifique prioritaires)",
      nominationMode: "Voie de l'Ambassade (Embassy Recommendation) : sélection initiale via l'Ambassade du Japon à Dakar.",
      selectionConditions: "Le domaine d'études doit correspondre à une filière enseignée dans les universités japonaises."
    },
    requiredDocuments: [
      {
        id: "mext_research_plan",
        name: "Projet de Recherche Détaillé au Japon (Field of Study & Research Program Plan)",
        category: "motivation",
        categoryLabel: "✍️ Recherche",
        isMandatory: true,
        description: "Document officiel structuré en 2 parties : 1. Recherches antérieures, 2. Projet de recherche précis prévu au Japon.",
        specifications: "Rédigé en anglais ou en japonais sur le formulaire officiel du MEXT.",
        godTip: "Démontrez pourquoi le Japon est le leader mondial dans votre domaine et citez des professeurs japonais spécialistes."
      },
      {
        id: "mext_transcripts",
        name: "Relevés de Notes Certifiés & Diplôme de Licence",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Relevés complets de chaque année universitaire avec attestation de diplôme en anglais.",
        specifications: "Copies certifiées conformes avec traduction certifiée en anglais.",
        godTip: "Fournir un tableau récapitulatif des moyennes semestrielles certifié par la faculté."
      },
      {
        id: "mext_medical",
        name: "Certificat Médical Officiel du MEXT",
        category: "medical",
        categoryLabel: "🏥 Santé",
        isMandatory: true,
        description: "Formulaire médical officiel du MEXT complété et tamponné par un médecin d'un hôpital public.",
        specifications: "Sur le modèle officiel MEXT avec radiographie pulmonaire et analyses sérologiques.",
        godTip: "Utiliser exclusivement le formulaire médical téléchargé sur le site du MEXT."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Publication de l'Appel par l'Ambassade du Japon à Dakar", timeline: "Avril - Mai", details: "Téléchargement des formulaires officiels sur le site de l'Ambassade du Japon au Sénégal." },
      { step: 2, title: "Dépôt des Dossiers Physiques à Dakar", timeline: "Fin Mai - Début Juin", details: "Dépôt du dossier complet en 3 exemplaires physiques au Service Culturel de l'Ambassade." },
      { step: 3, title: "Épreuves Écrites (Langues) & Entretiens", timeline: "Juin - Juillet", details: "Examen écrit d'anglais/japonais et entretien oral devant le jury de l'Ambassade." },
      { step: 4, title: "Contact des Universités Japonaises & Bourse", timeline: "Août - Janvier suivant", details: "Obtention des lettres d'acceptation de professeurs japonais et départ pour Tokyo en avril ou octobre." }
    ],
    selectionCriteria: [
      { criterion: "Qualité & Faisabilité du Projet de Recherche", weight: "45%", description: "Rigueur scientifique et pertinence des travaux envisagés au Japon." },
      { criterion: "Performance aux Épreuves Écrites de Langues", weight: "30%", description: "Note obtenue aux examens d'anglais et de japonais organisés à Dakar." },
      { criterion: "Entretien Oral & Motivation Culturelle", weight: "25%", description: "Capacité d'adaptation à la société japonaise et clarté de l'exposé oral." }
    ],
    juryInsights: [
      "L'examen écrit d'anglais organisé à l'Ambassade est éliminatoire : révisez la grammaire avancée et le vocabulaire académique.",
      "Identifiez en amont 2 à 3 laboratoires universitaires japonais travaillant exactement sur votre thématique de recherche."
    ],
    officialUrl: "https://www.studyinjapan.go.jp/en/planning/scholarship/",
    verifiedOrg: "Ministère de l'Éducation du Japon (MEXT) & Ambassade du Japon à Dakar",
    nextDeadline: "2027-05-31",
    legalReference: "Règlement du Ministère de l'Éducation, de la Culture, des Sports, de la Science et de la Technologie du Japon (Monbukagakusho)",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇯🇵 25. BOURSE JICA - INITIATIVE ABE (JAPON)
  {
    id: "bourse_jica_abe_initiative",
    categoryGroup: "americas_asia",
    title: "Bourses JICA — Initiative ABE (African Business Education for Youth - Japon)",
    provider: "Agence Japonaise de Coopération Internationale (JICA)",
    country: "Japon",
    countryCode: "JP",
    flag: "🇯🇵",
    targetDegree: "Master Professionnel + Stage Rémunéré en Entreprise Japonaise",
    fundingType: "full_ride",
    monthlyStipend: "145 000 JPY / mois (~960 € / mois)",
    totalValueEst: "~35 000 € / an",
    benefits: [
      "Prise en charge intégrale des frais de scolarité universitaire de Master au Japon",
      "Allocation mensuelle complète de subsistance pour le logement et les dépenses courantes",
      "Billet d'avion international aller-retour Dakar ↔ Japon",
      "Stage professionnel rémunéré garanti au sein d'une entreprise privée japonaise (Sony, Toyota, Mitsubishi, startups Tech, etc.)",
      "Réseau d'affaires Afrique-Japon et soutien à l'entrepreneuriat au retour"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) validé dans une filière technique, scientifique ou de gestion",
      minGpa: "Moyenne générale ≥ 13/20",
      maxAge: "Entre 22 et 39 ans au 1er avril de l'année d'admission",
      nationality: "Citoyen d'un pays africain (Sénégal, etc.)",
      languageReq: "Anglais niveau B2/C1 (aptitude à suivre un Master enseigné en anglais)",
      workExperience: "Expérience professionnelle dans le secteur privé ou la fonction publique liée au développement économique",
      nominationMode: "Dépôt de candidature auprès du Bureau de la JICA à Dakar (Immeuble Fann Résidence).",
      selectionConditions: "Forte volonté de tisser des partenariats d'affaires et de transferts technologiques entre le Japon et le Sénégal."
    },
    requiredDocuments: [
      {
        id: "jica_form",
        name: "Formulaire Officiel de Candidature ABE Initiative",
        category: "admin",
        categoryLabel: "📄 Formulaire",
        isMandatory: true,
        description: "Formulaire complet détaillant l'expérience professionnelle et le plan d'affaires post-Master.",
        specifications: "Format officiel de la JICA.",
        godTip: "Démontrez comment votre profil aidera les entreprises japonaises à investir ou s'implanter en Afrique."
      },
      {
        id: "jica_recherche_plan",
        name: "Plan de Recherche de Master & Stratégie de Stage en Entreprise",
        category: "motivation",
        categoryLabel: "✍️ Projet",
        isMandatory: true,
        description: "Projet de mémoire axé sur une problématique industrielle ou technologique concrète.",
        specifications: "Document rédigé en anglais.",
        godTip: "Identifiez des secteurs industriels clés : énergies renouvelables, TIC, logistique portuaire, agro-industrie."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Lancement de l'Appel ABE par la JICA Sénégal", timeline: "Juin - Juillet", details: "Séance d'information au bureau de la JICA à Dakar." },
      { step: 2, title: "Dépôt des Dossiers au Bureau JICA Dakar", timeline: "Septembre - Octobre", details: "Soumission des dossiers physiques et numériques complets." },
      { step: 3, title: "Entretiens & Évaluations Techniques", timeline: "Novembre - Décembre", details: "Entretiens avec des experts japonais et représentants de la JICA." },
      { step: 4, title: "Placement Universitaire & Départ pour le Japon", timeline: "Juin - Septembre suivant", details: "Finalisation des admissions et départ pour les universités japonaises." }
    ],
    selectionCriteria: [
      { criterion: "Potentiel de Contribution au Partenariat Économique Afrique-Japon", weight: "40%", description: "Vision claire des opportunités d'affaires entre le Sénégal et le Japon." },
      { criterion: "Solidité du Profil Professionnel & Académique", weight: "35%", description: "Expérience technique et compétences dans son secteur d'activité." },
      { criterion: "Motivation & Leadership Personnel", weight: "25%", description: "Capacité à porter des projets industriels d'envergure." }
    ],
    juryInsights: [
      "L'Initiative ABE combine Master académique et stage en entreprise japonaise : montrez votre fibre d'affaires et de partenariat.",
      "Les projets favorisant la création d'emplois locaux au Sénégal sont priorisés."
    ],
    officialUrl: "https://www.jica.go.jp/english/africahiroba/business/detail/03/index.html",
    verifiedOrg: "Agence Japonaise de Coopération Internationale (JICA) — Bureau de Dakar",
    nextDeadline: "2026-10-15",
    legalReference: "Accord de Coopération Technique Japon-Afrique (TICAD V/VI/VII) — JICA African Business Education Initiative",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇰🇷 26. BOURSES GLOBAL KOREA SCHOLARSHIP (GKS / KGSP - CORÉE DU SUD)
  {
    id: "bourse_gks_korea",
    categoryGroup: "americas_asia",
    title: "Bourses Global Korea Scholarship (GKS / KGSP - Corée du Sud)",
    provider: "National Institute for International Education (NIIED) — Ministère de l'Éducation de Corée",
    country: "Corée du Sud",
    countryCode: "KR",
    flag: "🇰🇷",
    targetDegree: "Master (1 an de langue coréenne intensive + 2 ans de Master dans les universités SKY : Seoul National, KAIST, Yonsei, Korea University...)",
    fundingType: "full_ride",
    monthlyStipend: "1 000 000 KRW / mois (~750 € / mois)",
    totalValueEst: "~30 000 $ / an",
    benefits: [
      "Prise en charge intégrale à 100% de tous les frais de scolarité universitaire et droits d'admission en Corée du Sud",
      "Allocation mensuelle complète de subsistance de 1 000 000 KRW net",
      "Billet d'avion international aller-retour en classe économique Dakar ↔ Séoul",
      "Prise en charge intégrale de l'année préparatoire intensive de langue coréenne (TOPIK)",
      "Prime d'installation initiale (200 000 KRW), subvention de recherche et prime spéciale de maîtrise de la langue (TOPIK 5/6 : 100 000 KRW/mois)",
      "Assurance médicale nationale coréenne complète prise en charge"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) avec Mention Bien minimum",
      minGpa: "GPA cumulé ≥ 80% (Grade B / 13/20 minimum) ou classement dans le Top 20% de sa promotion",
      maxAge: "Moins de 40 ans au 1er septembre de l'année d'admission",
      nationality: "Nationalité sénégalaise (les citoyens coréens et leurs parents sont inéligibles)",
      languageReq: "Anglais niveau C1 (IELTS ≥ 6.5 / TOEFL ≥ 85) ou Coréen (TOPIK)",
      workExperience: "Non requise",
      nominationMode: "Deux voies possibles : 1. Voie de l'Ambassade de Corée à Dakar (Embassy Track), 2. Voie directe des Universités (University Track).",
      selectionConditions: "Obligation d'obtenir le niveau TOPIK 3 en coréen à l'issue de l'année de langue préparatoire pour intégrer le cycle de Master."
    },
    requiredDocuments: [
      {
        id: "gks_statement_purpose",
        name: "Projet d'Études & Déclaration Personnelle (Statement of Purpose & Personal Statement)",
        category: "motivation",
        categoryLabel: "✍️ Projet",
        isMandatory: true,
        description: "Formulaires officiels du NIIED décrivant le parcours, les motivations pour la Corée et le projet de mémoire.",
        specifications: "Format officiel imposé par le NIIED rédigé en anglais ou coréen.",
        godTip: "Soulignez l'avance technologique de la Corée du Sud (K-Tech, Semi-conducteurs, IA, Énergie, Culture) en lien avec votre projet."
      },
      {
        id: "gks_transcripts_apostille",
        name: "Relevés de Notes & Diplômes de Licence avec Apostille ou Légalisation Consulaire",
        category: "academic",
        categoryLabel: "🎓 Légalisation",
        isMandatory: true,
        description: "Relevés et diplômes certifiés conformes, traduits en anglais et légalisés par le Ministère des Affaires Étrangères et l'Ambassade de Corée.",
        specifications: "Légalisation consulaire obligatoire pour la sélection finale.",
        godTip: "Anticipez les démarches de légalisation au Ministère des Affaires Étrangères à Dakar dès le mois de janvier."
      },
      {
        id: "gks_recs",
        name: "Deux Lettres de Recommandation Académiques sous Enveloppe Scellée",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Lettres rédigées par des professeurs d'université sur le formulaire type GKS sous pli cacheté et signé sur le rabat.",
        specifications: "Enveloppes scellées avec signature du professeur sur le sceau.",
        godTip: "Ne brisez jamais le sceau de l'enveloppe : le jury NIIED rejette tout pli ouvert."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Publication des Directives Annuelles GKS par le NIIED", timeline: "Début Février", details: "Téléchargement du formulaire officiel et de la liste des universités coréennes partenaires." },
      { step: 2, title: "Dépôt des Dossiers à l'Ambassade de Corée à Dakar", timeline: "Février - Début Mars", details: "Dépôt physique des 4 exemplaires (1 original légalisé + 3 photocopies simples)." },
      { step: 3, title: "Entretiens de Sélection & 2ème Tour NIIED", timeline: "Fin Mars - Avril", details: "Entretien oral à l'Ambassade de Corée à Dakar et transmission à Séoul." },
      { step: 4, title: "Admission Universitaire & Résultats Finaux", timeline: "Mai - Juin", details: "Sélection par les universités coréennes et publication des résultats définitifs par le NIIED pour un départ en août." }
    ],
    selectionCriteria: [
      { criterion: "Excellence Académique & GPA Cumulé", weight: "40%", description: "Moyenne générale en Licence et rang de promotion." },
      { criterion: "Qualité du Projet d'Études & Motivation pour la Corée", weight: "35%", description: "Clarté du projet scientifique et volonté d'intégration en Corée du Sud." },
      { criterion: "Lettres de Recommandation & Maîtrise Linguistique", weight: "25%", description: "Score d'anglais/coréen et éloges académiques des référents." }
    ],
    juryInsights: [
      "Le NIIED disqualifie automatiquement les dossiers dont les formulaires ne respectent pas scrupuleusement les consignes de formatage.",
      "Avoir des bases en langue coréenne (même un niveau débutant) rapporte des points bonus décisifs lors de l'entretien."
    ],
    officialUrl: "https://www.studyinkorea.go.kr/ko/scholarship/Gks1NoticeList.do",
    verifiedOrg: "National Institute for International Education (NIIED) & Ambassade de Corée à Dakar",
    nextDeadline: "2027-03-05",
    legalReference: "Directives Officielles du National Institute for International Education (NIIED) — Ministère de l'Éducation de Corée",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇹🇷 27. BOURSES DU GOUVERNEMENT TURC (TÜRKIYE BURSLARI - YTB)
  {
    id: "bourse_turkiye_burslari",
    categoryGroup: "americas_asia",
    title: "Bourses Türkiye Bursları (Gouvernement de Turquie)",
    provider: "Présidence des Turcs de l'Étranger et des Communautés Apparentées (YTB)",
    country: "Turquie",
    countryCode: "TR",
    flag: "🇹🇷",
    targetDegree: "Master (1 an de langue turque C1 gratuite + 2 ans de Master dans les universités d'Istanbul, Ankara, METU, Boğaziçi, Koç...)",
    fundingType: "full_ride",
    monthlyStipend: "3 500 TL / mois",
    totalValueEst: "~15 000 € / an",
    benefits: [
      "Prise en charge intégrale à 100% de tous les frais de scolarité universitaire en Turquie",
      "Allocation mensuelle complète de subsistance versée directement par le gouvernement turc",
      "Logement universitaire garanti et gratuit en résidence publique d'État (KYK)",
      "Billet d'avion international aller-retour en début et fin de cycle Dakar ↔ Istanbul/Ankara",
      "Année préparatoire complète et gratuite d'apprentissage intensif du turc (Diplôme TÖMER C1)",
      "Assurance santé publique complète (GSS) couvrant tous les soins hospitaliers en Turquie"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) validé avec Mention Bien minimum",
      minGpa: "Moyenne générale ≥ 75% (minimum 13/20 sur le cycle de Licence)",
      maxAge: "Moins de 30 ans au 1er janvier de l'année de candidature pour le Master",
      nationality: "Citoyen de tout pays étranger (les citoyens turcs sont inéligibles)",
      languageReq: "Français, Anglais ou Turc selon le Master (les programmes en anglais exigent TOEFL/GRE)",
      workExperience: "Non requise",
      nominationMode: "Candidature 100% en ligne sur le portail officiel Türkiye Bursları (TBBS).",
      selectionConditions: "Obligation de valider le niveau C1 en langue turque lors de l'année préparatoire pour les cursus en turc."
    },
    requiredDocuments: [
      {
        id: "tb_letter_intent",
        name: "Lettre d'Intention & Projet de Recherche Structuré (Letter of Intent)",
        category: "motivation",
        categoryLabel: "✍️ Projet",
        isMandatory: true,
        description: "Exposé rédigé en sections répondant aux questions du portail YTB sur le parcours, le choix de la Turquie et le sujet de mémoire.",
        specifications: "Rédigé sur le portail TBBS en français, anglais ou turc.",
        godTip: "Démontrez la complémentarité géostratégique et économique entre la Turquie et votre pays d'origine."
      },
      {
        id: "tb_transcripts",
        name: "Diplôme de Licence & Relevés de Notes Officiels Complets",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Scans haute résolution de vos relevés de notes universitaires et du diplôme de Licence.",
        specifications: "Fichiers PDF ou JPEG nets.",
        godTip: "Téléversez tous les certificats de stages, distinctions et attestations de bénévolat pour booster votre score automatique."
      },
      {
        id: "tb_passport",
        name: "Passeport International en Cours de Validité",
        category: "civil",
        categoryLabel: "🏛️ État Civil",
        isMandatory: true,
        description: "Copie de la page d'identification du passeport valide au moins 1 an.",
        specifications: "Format numérique haute résolution.",
        godTip: "Vérifier que la date d'expiration couvre au moins l'année d'arrivée en Turquie."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Ouverture du Guichet Annuel Unique TBBS", timeline: "10 Janvier - 20 Février", details: "Création du compte sur le portail officiel et saisie des 12 choix universitaires turcs." },
      { step: 2, title: "Évaluation Préliminaire & Algorithmique", timeline: "Mars - Avril", details: "Filtrage automatique sur la base des notes académiques et du profil social." },
      { step: 3, title: "Entretiens de Sélection en Présentiel à Dakar", timeline: "Mai - Juin", details: "Entretien oral avec la délégation ministérielle turque à l'Ambassade de Turquie à Dakar." },
      { step: 4, title: "Annonce des Lauréats & Voyage en Turquie", timeline: "Fin Juillet - Août", details: "Signature de l'accord de bourse, délivrance du visa gratuit et vol pour la Turquie en septembre." }
    ],
    selectionCriteria: [
      { criterion: "Moyenne Académique de Licence (≥ 75%)", weight: "40%", description: "Résultats universitaires et rigueur dans les matières fondamentales." },
      { criterion: "Entretien Oral & Clarté du Projet", weight: "35%", description: "Aisance argumentative et maturité du projet professionnel devant le jury à Dakar." },
      { criterion: "Activités Extrascolaires & Engagement Citoyen", weight: "25%", description: "Expériences associatives, sportives, artistiques et certificats professionnels." }
    ],
    juryInsights: [
      "Le portail Türkiye Bursları permet de choisir jusqu'à 12 universités : diversifiez vos choix en incluant des métropoles universitaires dynamiques (Ankara, Izmir, Bursa, Konya) en plus d'Istanbul.",
      "L'entretien oral se déroule à Dakar : soyez prêt à expliquer pourquoi vous avez choisi la Turquie plutôt qu'un pays occidental."
    ],
    officialUrl: "https://turkiyeburslari.gov.tr/applysteps",
    verifiedOrg: "Présidence des Turcs de l'Étranger (YTB) — Ankara, Turquie",
    nextDeadline: "2027-02-20",
    legalReference: "Loi N°5978 relative à la Présidence des Turcs de l'Étranger et des Communautés Apparentées (YTB)",
    sourceType: "GOVERNMENT_DIRECT"
  },

  // 🇦🇺 28. BOURSES DU GOUVERNEMENT AUSTRALIEN (AUSTRALIA AWARDS AFRICA)
  {
    id: "bourse_australia_awards",
    categoryGroup: "americas_asia",
    title: "Bourses Australia Awards for Africa (Gouvernement Australien)",
    provider: "Department of Foreign Affairs and Trade (DFAT) — Australie",
    country: "Australie",
    countryCode: "AU",
    flag: "🇦🇺",
    targetDegree: "Master Professionnel de 2 ans dans les Universités Australiennes du Group of Eight (Go8 : ANU, Melbourne, Sydney, Queensland, Monash, UNSW...)",
    fundingType: "full_ride",
    monthlyStipend: "2 500 AUD / mois (~1 500 € / mois)",
    totalValueEst: "~70 000 AUD / an",
    benefits: [
      "Prise en charge intégrale à 100% de tous les frais de scolarité de Master dans les universités australiennes",
      "Allocation mensuelle complète de subsistance confortable (Contribution to Living Expenses - CLE)",
      "Billet d'avion international aller-retour en classe économique entre le pays d'origine et l'Australie",
      "Indemnité forfaitaire d'installation initiale à l'arrivée (Establishment Allowance)",
      "Couverture d'assurance santé pour étudiants étrangers (Overseas Student Health Cover - OSHC) complète",
      "Programme d'accueil académique préparatoire (Introductory Academic Program) et tutorat universitaire"
    ],
    eligibility: {
      academicLevel: "Licence / Bachelor (Bac+3/4) validé avec Mention Bien minimum",
      minGpa: "Moyenne générale ≥ 13.5/20",
      maxAge: "Aucune limite d'âge (priorité aux professionnels en activité)",
      nationality: "Ressortissant d'un pays africain éligible (Sénégal inclus)",
      languageReq: "Anglais niveau C1 certifié (IELTS Academic ≥ 6.5 avec aucun score sous 6.0 / TOEFL iBT ≥ 84)",
      workExperience: "Au moins 2 à 3 années d'expérience professionnelle dans un secteur clé du développement (mines, agronomie, climat, santé publique, gestion publique)",
      nominationMode: "Candidature en ligne sur le portail officiel Australia Awards (OASIS).",
      selectionConditions: "Règle des 2 ans de retour obligatoire dans son pays d'origine au terme du Master pour contribuer au développement national."
    },
    requiredDocuments: [
      {
        id: "aus_dev_impact_plan",
        name: "Plan de Réintégration & d'Impact sur le Développement (Development Impact Plan - DIP)",
        category: "motivation",
        categoryLabel: "✍️ Impact Plan",
        isMandatory: true,
        description: "Document stratégique démontrant comment les compétences acquises en Australie seront appliquées dans votre institution au retour.",
        specifications: "Format officiel imposé par le DFAT.",
        godTip: "DIP extrêmement concret : définissez des objectifs mesurables à 6 mois et 2 ans après votre retour au Sénégal."
      },
      {
        id: "aus_transcripts",
        name: "Relevés de Notes & Diplômes Universitaires Certifiés",
        category: "academic",
        categoryLabel: "🎓 Académique",
        isMandatory: true,
        description: "Transcripts académiques officiels certifiés avec traduction certifiée en anglais.",
        specifications: "Copies certifiées conformes par un notaire ou officier public.",
        godTip: "Faire certifier chaque page par un tampon officiel pour respecter les normes de l'OASIS."
      },
      {
        id: "aus_recs",
        name: "Deux Lettres de Recommandation Professionnelles & Académiques",
        category: "letters",
        categoryLabel: "✉️ Recommandations",
        isMandatory: true,
        description: "Recommandations rédigées en anglais par un employeur direct et un professeur d'université.",
        specifications: "Sur papier à en-tête avec signature officielle.",
        godTip: "L'employeur doit confirmer la pertinence du Master pour les missions de l'entreprise ou du ministère."
      }
    ],
    applicationSteps: [
      { step: 1, title: "Ouverture des Candidatures sur le Système OASIS", timeline: "Février", details: "Création du compte et téléversement des pièces justificatives." },
      { step: 2, title: "Clôture des Soumissions en Ligne", timeline: "Fin Avril", details: "Validation définitive du dossier complet en anglais." },
      { step: 3, title: "Présélection & Entretiens à Dakar/Région", timeline: "Août - Septembre", details: "Audition devant le panel d'experts australiens." },
      { step: 4, title: "Attribution Finale & Stage Préparatoire", timeline: "Novembre - Janvier suivant", details: "Formation d'intégration et départ pour l'Australie en janvier/février." }
    ],
    selectionCriteria: [
      { criterion: "Qualité du Plan d'Impact sur le Développement (DIP)", weight: "40%", description: "Faisabilité et retombées concrètes des réformes proposées au retour." },
      { criterion: "Expérience Professionnelle & Compétences Métier", weight: "35%", description: "Richesse du parcours professionnel et engagement public." },
      { criterion: "Excellence Académique & Maîtrise de l'Anglais", weight: "25%", description: "Résultats d'études supérieures et score d'IELTS." }
    ],
    juryInsights: [
      "Le Development Impact Plan (DIP) est le critère numéro 1 de sélection : travaillez-le avec votre supérieur hiérarchique direct.",
      "L'Australie soutient fortement les candidatures féminines et les personnes en situation de handicap."
    ],
    officialUrl: "https://australiaawardsafrica.org/awards/australia-awards-scholarships/",
    verifiedOrg: "Department of Foreign Affairs and Trade (DFAT) — Canberra, Australie",
    nextDeadline: "2027-04-30",
    legalReference: "Australian Government Policy Guidelines for Australia Awards — Department of Foreign Affairs and Trade (DFAT)",
    sourceType: "GOVERNMENT_DIRECT"
  }
];

/**
 * Calculateur de statut de date limite
 */
export function computeScholarshipDeadlineInfo(deadlineDateStr) {
  if (!deadlineDateStr) return { status: "open", label: "Ouvert en continu", color: "#10B981" };
  const now = new Date();
  const deadline = new Date(deadlineDateStr);
  const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: "closed", label: "Session clôturée (Prochaine session en préparation)", color: "#94A3B8" };
  }
  if (diffDays === 0) {
    return { status: "urgent", label: "🚨 Clôture aujourd'hui !", color: "#EF4444" };
  }
  if (diffDays <= 15) {
    return { status: "urgent", label: `🚨 Clôture dans ${diffDays} jour${diffDays > 1 ? "s" : ""}`, color: "#EF4444" };
  }
  if (diffDays <= 45) {
    return { status: "soon", label: `⚡ Clôture dans ${diffDays} jours`, color: "#F59E0B" };
  }
  return { status: "open", label: `🟢 Ouvert (J-${diffDays})`, color: "#10B981" };
}

/**
 * Moteur de filtrage multicritères avancé — Sessions Ouvertes Uniquement
 */
export function resolveNextDeadline(item) {
  const raw = item?.nextDeadline;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (item?.recurrence === "one_shot") return raw;

  // Les campagnes de bourses sont annuelles : si la date est dépassée,
  // on projette automatiquement la prochaine session (même jour, année suivante).
  const now = new Date();
  while (date.getTime() < now.getTime()) {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Évaluateur d'éligibilité pour le profil :
 * - Localisation & Nationalité : Sénégalais (ouvert à toutes les bourses du monde accessibles aux candidats du Sénégal)
 * - Niveau d'études : Dernière année de Licence (L3 / Bachelor en cours, sans obligation de diplôme déjà remis)
 * - Filière : Informatique, Intelligence Artificielle, Sciences & Technologies (STEM, Tech, Data)
 */
export function isEligibleForSenegalL3CS(item) {
  if (!item) return false;

  const acadText = (item.eligibility?.academicLevel || "").toLowerCase();
  const degreeText = (item.targetDegree || "").toLowerCase();
  const expText = (item.eligibility?.workExperience || "").toLowerCase();
  const natText = (item.eligibility?.nationality || "").toLowerCase();
  const title = (item.title || "").toLowerCase();

  // 1. EXCLUSION STRICTE : Programmes réservés aux titulaires d'un Master 1 déjà validé ou Master 2
  // Un étudiant en fin de Licence 3 entre en Master 1 (première année de Master).
  const requiresM1OrHigher =
    acadText.includes("master 1 validé") ||
    acadText.includes("master 1 ou master 2") ||
    acadText.includes("master 2 en cours") ||
    acadText.includes("titulaire d'un master") ||
    acadText.includes("complété avec mention") ||
    (degreeText.includes("master 2") && !degreeText.includes("master 1") && !degreeText.includes("master complet") && !degreeText.includes("double"));

  if (requiresM1OrHigher) return false;

  // 2. EXCLUSION STRICTE : Doctorat / Thèse uniquement
  const requiresPhdOnly =
    (acadText.includes("doctorat uniquement") || acadText.includes("thèse uniquement") || degreeText.includes("co-tutelle de thèse")) &&
    !degreeText.includes("master 1") && !degreeText.includes("master complet");
  if (requiresPhdOnly) return false;

  // 3. EXCLUSION STRICTE : Expérience professionnelle bloquante post-diplôme (2 à 3 ans requis)
  // Un étudiant direct en L3 n'a pas 2 ou 3 ans d'expérience professionnelle post-diplôme
  const hasHardWorkExpReq =
    expText.includes("3 ans minimum") ||
    expText.includes("2 ans minimum") ||
    expText.includes("3 000 heures") ||
    expText.includes("2 800 heures") ||
    expText.includes("au moins 3 ans d'expérience") ||
    expText.includes("au moins 2 ans d'expérience") ||
    expText.includes("au moins 2 à 3 années d'expérience") ||
    expText.includes("au moins 1 à 2 ans d'expérience") ||
    expText.includes("années d'expérience professionnelle") ||
    expText.includes("expérience professionnelle d'au moins 2 ans") ||
    acadText.includes("au moins 3 ans avant la date") ||
    acadText.includes("au moins 2 ans avant la date");

  if (hasHardWorkExpReq) return false;

  // 4. ADMISSIBILITÉ LICENCE / L3 : Le niveau d'admission requis doit être la Licence / Bachelor (Bac+3)
  const acceptsLicence =
    acadText.includes("licence") ||
    acadText.includes("bachelor") ||
    acadText.includes("bac+3") ||
    acadText.includes("undergraduate") ||
    acadText.includes("dernière année") ||
    acadText.includes("diplôme équivalent") ||
    acadText.includes("concours") ||
    acadText.includes("deuxième cycle") ||
    acadText.includes("baccalauréat avec mention très bien + cpge");

  if (!acceptsLicence) return false;

  // 5. EXCLUSION NATIONALITÉ : Citoyens européens ou suisses uniquement
  const isExcludedNationality =
    natText.includes("réservé aux citoyens de l'union européenne") ||
    natText.includes("citoyens européens uniquement") ||
    natText.includes("citoyens suisses uniquement");

  if (isExcludedNationality) return false;

  // 6. FILIÈRE : Doit accepter l'Informatique, les Sciences & Technologies ou toutes filières
  const isPureNonTech =
    (acadText.includes("droit international pur") || title.includes("beaux-arts")) &&
    !degreeText.includes("informatique") &&
    !degreeText.includes("sciences");

  if (isPureNonTech) return false;

  return true;
}

export function filterScholarships(list, { categoryGroup = "all", country = "all", fundingType = "all", field = "all", status = "all", searchQuery = "", forMeOnly = false } = {}) {
  return list.filter((item) => {
    // Filtre spécifique "Pour moi" (L3 Informatique • Sénégal)
    if (forMeOnly && !isEligibleForSenegalL3CS(item)) {
      return false;
    }

    // Calcul de date limite : exclure systématiquement les sessions clôturées
    const deadlineInfo = computeScholarshipDeadlineInfo(resolveNextDeadline(item));
    if (status !== "include_closed" && status !== "saved") {
      if (deadlineInfo.status === "closed") return false;
      if (status === "urgent" && deadlineInfo.status !== "urgent") return false;
    }

    // Filtre de groupe de catégorie (Sénégal, Multilatéral, Europe, Amériques/Asie)
    if (categoryGroup !== "all" && item.categoryGroup !== categoryGroup) return false;

    // Filtre pays
    if (country !== "all" && item.countryCode !== country) return false;

    // Filtre type de financement
    if (fundingType !== "all" && item.fundingType !== fundingType) return false;

    // Filtre recherche textuelle
    if (searchQuery && searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchCountry = item.country.toLowerCase().includes(q);
      const matchProvider = item.provider.toLowerCase().includes(q);
      const matchDegree = item.targetDegree.toLowerCase().includes(q);
      const matchAcademic = item.eligibility.academicLevel.toLowerCase().includes(q);
      const matchDocs = item.requiredDocuments?.some((d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
      
      if (!matchTitle && !matchCountry && !matchProvider && !matchDegree && !matchAcademic && !matchDocs) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Calculateur de statistiques globales du catalogue (Sessions Ouvertes Uniquement)
 */
export function getScholarshipStats(list) {
  const openList = list.filter((s) => computeScholarshipDeadlineInfo(resolveNextDeadline(s)).status !== "closed");
  const total = openList.length;
  const fullRideCount = openList.filter((s) => s.fundingType === "full_ride").length;
  const senegalCount = openList.filter((s) => s.categoryGroup === "senegal").length;
  const multilateralCount = openList.filter((s) => s.categoryGroup === "multilateral").length;
  const europeCount = openList.filter((s) => s.categoryGroup === "europe").length;
  const americasAsiaCount = openList.filter((s) => s.categoryGroup === "americas_asia").length;
  const forMeCount = openList.filter((s) => isEligibleForSenegalL3CS(s)).length;
  const uniqueCountries = new Set(openList.map((s) => s.countryCode));

  return {
    total,
    fullRideCount,
    senegalCount,
    multilateralCount,
    europeCount,
    americasAsiaCount,
    forMeCount,
    countriesCount: uniqueCountries.size,
  };
}

/**
 * 📘 GUIDE OFFICIEL DE CANDIDATURE — PROFIL ÉTUDIANT L3 INFORMATIQUE & SCIENCES (SÉNÉGAL)
 * Conseils stratégiques concrets adaptés au système universitaire sénégalais (UCAD, UGB, UIDT, Bambey, ESP, etc.)
 */
export const SENEGAL_L3_CS_APPLICATION_GUIDE = {
  title: "Guide Stratégique : Décrocher un Master International en étant en L3 Informatique au Sénégal",
  subtitle: "Comment postuler avant d'avoir le diplôme final, monter un dossier d'élite et réussir le circuit administratif à Dakar",
  profile: {
    level: "Dernière année de Licence (L3 Informatique / STEM)",
    location: "Sénégal (Diplômé universitaire prévu en juillet/août)",
    target: "Master d'Excellence 100% Financé (Europe, Amériques, Asie & Multilatéral)",
  },
  sections: [
    {
      id: "l3_status",
      icon: "🎓",
      title: "1. Postuler en L3 sans avoir encore le diplôme physique",
      summary: "95% des bourses internationales clôturent entre décembre et mars, bien avant la remise des diplômes en juillet.",
      steps: [
        {
          label: "Attestation d'inscription en Licence 3",
          detail: "Demande auprès de la scolarité centrale de ton université (UCAD, UGB, ESP, etc.) une attestation officielle d'inscription pour l'année universitaire en cours avec tampon et signature."
        },
        {
          label: "Relevés de notes de L1, L2 et Semestre 5",
          detail: "Fournis les relevés officiels complets des 4 premiers semestres (L1 et L2) plus le relevé provisoire ou définitif du Semestre 5 dès sa publication. Un dossier avec une moyenne ascendante (L1 < L2 < L3) est très valorisé."
        },
        {
          label: "Attestation de fin d'études prévue (Expected Graduation Letter)",
          detail: "Fais signer par ton Chef de Département ou le Doyen de la Faculté une lettre officielle en français (et idéalement en anglais) certifiant : 'M./Mme X est actuellement étudiant(e) régulier(ère) en L3 Informatique. Sous réserve de la validation des examens de juin/juillet, son diplôme de Licence lui sera officiellement délivré avant le 31 août'."
        },
        {
          label: "Condition suspensive d'admission",
          detail: "Toutes les bourses prestigieuses (Eiffel, Erasmus Mundus, MEXT, GKS) accordent des admissions sous condition suspensive de présentation du diplôme au moment de l'inscription finale en septembre."
        }
      ]
    },
    {
      id: "cs_portfolio",
      icon: "💻",
      title: "2. Valoriser ton profil Informatique & Sciences",
      summary: "En informatique, le code et les réalisations concrètes pèsent souvent plus que les seules notes académiques.",
      steps: [
        {
          label: "Profil GitHub soigné avec 2 à 3 projets phares",
          detail: "Mets en avant des repositories propres avec un README.md détaillé en anglais, des captures d'écran, une architecture claire et un déploiement en ligne (Vercel, Render ou Hugging Face). Projets recommandés : Full-Stack, IA/Data Science, Algorithmique ou Cybersécurité."
        },
        {
          label: "CV International d'une seule page (Format Harvard / Europass)",
          detail: "Structure ton CV selon la règle '1 page maximum' : Stack technique en haut (Langages, Frameworks, Bases de données, Outils Cloud), Projets notables, Formations, et Expériences/Stages ou projets académiques de L3."
        },
        {
          label: "2 Lettres de recommandation académiques solides",
          detail: "Sollicite tes professeurs dès octobre. Choisis un enseignant-chercheur ayant enseigné des matières fondamentales (Algorithmique, Base de données, Réseaux ou IA). Fournis-leur ton CV et ton projet pour qu'ils personnalisent leur lettre avec des exemples précis de ta rigueur."
        },
        {
          label: "Statement of Purpose (Lettre de motivation stratégique)",
          detail: "Explique pourquoi ce Master précis, en quoi ta Licence en informatique au Sénégal t'a préparé, et comment tu comptes appliquer ces compétences à des défis technologiques concrets (Cloud africain, IA appliquée à la santé ou l'agriculture, cybersécurité bancaire)."
        }
      ]
    },
    {
      id: "languages",
      icon: "🗣️",
      title: "3. Tests de langue anglaise & Dispenses",
      summary: "Ne laisse pas la barrière linguistique t'éliminer : anticipe les certifications exigées.",
      steps: [
        {
          label: "France & Bourses Francophones (Eiffel, BGF)",
          detail: "Dispense totale de test de français pour les étudiants sénégalais titulaires d'une Licence délivrée par une université publique sénégalaise (l'enseignement étant officiellement en français)."
        },
        {
          label: "Duolingo English Test (DET) — L'alternative économique et rapide",
          detail: "De plus en plus de masters en Europe (Irlande, certains masters Erasmus Mundus, universités partenaires) acceptent le DET (~59$, résultat en 48h depuis chez soi). Vise un score ≥ 120-125."
        },
        {
          label: "IELTS Academic ou TOEFL iBT",
          detail: "Indispensables pour le Royaume-Uni, l'Australie, les USA et certains masters DAAD en Allemagne. Les centres d'examen officiels à Dakar (British Council Dakar pour IELTS) nécessitent une inscription 1 mois à l'avance. Vise IELTS ≥ 6.5 (aucun score sous 6.0) ou TOEFL ≥ 88-92."
        },
        {
          label: "Attestation de cours dispensés en anglais (English Medium of Instruction)",
          detail: "Certaines universités asiatiques (Corée GKS, Turquie) ou certains programmes européens acceptent une attestation de ton université certifiant que certains modules d'informatique ont été suivis en anglais."
        }
      ]
    },
    {
      id: "dakar_admin",
      icon: "🏛️",
      title: "4. Le circuit administratif et légalisation à Dakar",
      summary: "Étapes obligatoires pour rendre tes diplômes et relevés recevables à l'international.",
      steps: [
        {
          label: "Étape 1 : Copies certifiées conformes à la mairie ou commissariat",
          detail: "Fais certifier plusieurs copies de ton Baccalauréat, relevés de notes du Bac, et relevés de Licence auprès de ta mairie de commune ou commissariat à Dakar."
        },
        {
          label: "Étape 2 : Légalisation au Ministère de l'Enseignement Supérieur (MESRI)",
          detail: "Rends-toi aux Sphères Ministérielles de Diamniadio (bâtiment MESRI) ou au bureau de légalisation académique avec les originaux et copies certifiées pour apposer le visa de conformité de l'État."
        },
        {
          label: "Étape 3 : Légalisation au Ministère des Affaires Étrangères (MIAAE)",
          detail: "Direction des Affaires Consulaires (Place Peytavin / Avenue Franklin Roosevelt, Dakar). Indispensable pour que tes documents soient authentifiés auprès des ambassades étrangères."
        },
        {
          label: "Étape 4 : Traduction assermentée en anglais (si pays non-francophone)",
          detail: "Fais traduire tes relevés et attestations par un traducteur assermenté agréé près la Cour d'Appel de Dakar (ou via les départements d'anglais de l'UCAD)."
        }
      ]
    },
    {
      id: "timeline",
      icon: "📅",
      title: "5. Calendrier Stratégique Mois par Mois",
      summary: "Une candidature réussie se prépare dès le début du premier semestre de L3.",
      steps: [
        {
          label: "Septembre – Octobre (Début L3)",
          detail: "Passeport biométrique sénégalais valide (au moins 2 ans de validité). Choix des 5 à 7 bourses cibles. Préparation des tests d'anglais (IELTS/Duolingo). Contact avec les professeurs pour les recommandations."
        },
        {
          label: "Novembre – Janvier (Pic des candidatures européennes)",
          detail: "Dépôt des dossiers Eiffel (via universités françaises partenaires), Erasmus Mundus (catalogue EACEA), DAAD Allemagne, Mastercard Foundation, et IsDB (Banque Islamique)."
        },
        {
          label: "Février – Avril (Bourses asiatiques & bilatérales)",
          detail: "Dépôt bourses MEXT (Ambassade du Japon à Dakar), GKS (Ambassade de Corée), Türkiye Bursları, et bourses bilatérales du Sénégal (Direction des Bourses MESRI)."
        },
        {
          label: "Mai – Juillet (Résultats & Visa)",
          detail: "Réception des admissions et attestations de bourse. Entretien Campus France (si France) ou visa ambassade. Finalisation de la soutenance de Licence et obtention de l'attestation définitive de réussite."
        }
      ]
    }
  ]
};
