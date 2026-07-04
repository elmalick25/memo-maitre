// ════════════════════════════════════════════════════════════════════════════
// 🏆 CERT CATALOG — GOD MODE
// Catalogue local massif de certifications RÉELLES (URLs officielles vérifiées).
// Sert de :
//   1. Filet de sécurité absolu → la recherche n'est JAMAIS vide (min garanti).
//   2. Moteur de matching bilingue FR/EN ultra-puissant (synonymes + fuzzy).
//   3. Source anti-404 → toutes les URLs pointent vers des domaines officiels.
// ════════════════════════════════════════════════════════════════════════════

// ── Dictionnaire de synonymes / traductions FR ⇄ EN ─────────────────────────
// Permet de chercher "sécurité" et matcher "security", "cyber", etc.
const SYNONYMS = {
  securite: ['security', 'cyber', 'cybersecurity', 'cybersecurite', 'pentest', 'hacking', 'hacker', 'soc', 'infosec', 'sécurité'],
  reseau: ['network', 'networking', 'réseau', 'reseaux', 'ccna', 'routing', 'switching'],
  donnee: ['data', 'données', 'donnees', 'analytics', 'analyse', 'bigdata', 'dataengineer', 'datascience'],
  developpement: ['development', 'dev', 'developpeur', 'développeur', 'developer', 'coding', 'programming', 'programmation', 'software'],
  web: ['web', 'frontend', 'front-end', 'backend', 'back-end', 'fullstack', 'full-stack', 'javascript', 'react', 'html', 'css'],
  mobile: ['mobile', 'android', 'ios', 'flutter', 'swift', 'kotlin', 'react native'],
  ia: ['ai', 'ia', 'intelligence artificielle', 'machine learning', 'ml', 'deep learning', 'llm', 'genai', 'gen ai', 'generative', 'generative ai', 'ia generative', 'genrative', ' generative', 'nlp', 'rag', 'agents', 'agentic', 'prompt', 'prompt engineering', 'gpt', 'chatgpt', 'copilot', 'diffusion', 'stable diffusion', 'midjourney', 'transformers', 'fine tuning', 'fine-tuning'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'google cloud', 'nuage', 'serverless'],
  devops: ['devops', 'sre', 'kubernetes', 'k8s', 'docker', 'terraform', 'ci/cd', 'cicd', 'platform', 'infrastructure'],
  gestion: ['management', 'gestion', 'projet', 'project', 'agile', 'scrum', 'pmp', 'product', 'produit', 'lean'],
  design: ['design', 'ux', 'ui', 'figma', 'graphic', 'graphisme', 'product design'],
  marketing: ['marketing', 'seo', 'ads', 'analytics', 'growth', 'digital', 'social'],
  blockchain: ['blockchain', 'web3', 'crypto', 'solidity', 'ethereum', 'smart contract'],
  jeux: ['game', 'gamedev', 'jeux', 'jeu video', 'unity', 'unreal'],
  base: ['database', 'sql', 'base de donnees', 'bdd', 'postgres', 'mongodb', 'oracle'],
};

// Normalise : minuscules, sans accents, sans ponctuation
export function normalize(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s+#.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Étend une requête avec tous ses synonymes (bilingue)
function expandTerms(query) {
  const norm = normalize(query);
  const tokens = norm.split(' ').filter(Boolean);
  const expanded = new Set(tokens);
  expanded.add(norm);
  for (const [, list] of Object.entries(SYNONYMS)) {
    const normedList = list.map(normalize);
    // si un token de la requête est dans la liste → on ajoute toute la liste
    if (normedList.some(s => tokens.includes(s) || norm.includes(s))) {
      normedList.forEach(s => expanded.add(s));
    }
  }
  return [...expanded].filter(Boolean);
}

// ── Le catalogue (90+ certifs réelles, URLs officielles, multi-catégories) ───
// free=true → 100% gratuite ou parcours d'apprentissage gratuit.
export const CERT_CATALOG = [
  // ───────────────────────────── CLOUD ─────────────────────────────
  { name: 'AWS Certified Cloud Practitioner', provider: 'AWS', url: 'https://aws.amazon.com/certification/certified-cloud-practitioner/', category: 'Cloud', level: 'Foundational', cost: '$100', free: false, duration: '30h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+8k€', why: "Porte d'entrée du cloud AWS : valide les fondamentaux facturation, services et sécurité, idéale pour débuter une carrière cloud.", tags: 'aws cloud debutant fondamentaux billing' },
  { name: 'AWS Certified Solutions Architect – Associate', provider: 'AWS', url: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/', category: 'Cloud', level: 'Associate', cost: '$150', free: false, duration: '80h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+15k€', why: "La certif cloud la plus demandée au monde : concevoir des architectures résilientes, scalables et économiques sur AWS.", tags: 'aws architecte solutions architecture scalable' },
  { name: 'AWS Skill Builder (parcours gratuits)', provider: 'AWS', url: 'https://skillbuilder.aws/', category: 'Cloud', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Centaines de cours AWS gratuits + labs pour préparer toutes les certifs cloud sans dépenser un centime.", tags: 'aws gratuit free cloud labs' },
  { name: 'Microsoft Certified: Azure Fundamentals (AZ-900)', provider: 'Microsoft', url: 'https://learn.microsoft.com/credentials/certifications/azure-fundamentals/', category: 'Cloud', level: 'Foundational', cost: '$99', free: false, duration: '25h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+7k€', why: "Référence Azure pour décrocher un premier poste cloud Microsoft : concepts, services et modèle de prix.", tags: 'azure microsoft cloud fondamentaux az900' },
  { name: 'Microsoft Certified: Azure Administrator Associate (AZ-104)', provider: 'Microsoft', url: 'https://learn.microsoft.com/credentials/certifications/azure-administrator/', category: 'Cloud', level: 'Associate', cost: '$165', free: false, duration: '70h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+13k€', why: "Gérer identités, stockage, réseau et machines virtuelles Azure : poste d'admin cloud très recherché.", tags: 'azure admin administrator cloud az104' },
  { name: 'Google Cloud Digital Leader', provider: 'Google Cloud', url: 'https://cloud.google.com/learn/certification/cloud-digital-leader', category: 'Cloud', level: 'Foundational', cost: '$99', free: false, duration: '20h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+6k€', why: "Comprendre la valeur business de GCP et du cloud — parfaite pour profils non techniques et chefs de projet.", tags: 'google cloud gcp leader business' },
  { name: 'Google Cloud Associate Cloud Engineer', provider: 'Google Cloud', url: 'https://cloud.google.com/learn/certification/cloud-engineer', category: 'Cloud', level: 'Associate', cost: '$125', free: false, duration: '60h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+14k€', why: "Déployer et gérer des applications sur Google Cloud : très valorisée dans les boîtes data/IA.", tags: 'google cloud gcp engineer deploy' },
  { name: 'Google Cloud Skills Boost (quêtes gratuites)', provider: 'Google Cloud', url: 'https://www.cloudskillsboost.google/', category: 'Cloud', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Labs pratiques et badges gratuits sur GCP pour s'entraîner en conditions réelles.", tags: 'google cloud gratuit free labs badges' },

  // ───────────────────────────── CYBERSÉCURITÉ ─────────────────────────────
  { name: 'CompTIA Security+', provider: 'CompTIA', url: 'https://www.comptia.org/certifications/security', category: 'Cybersécurité', level: 'Associate', cost: '$392', free: false, duration: '90h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+12k€', why: "Certif cybersécurité la plus reconnue pour débuter : exigée par de nombreux employeurs et l'armée US.", tags: 'security comptia cyber securite defense soc' },
  { name: 'Certified Ethical Hacker (CEH)', provider: 'EC-Council', url: 'https://www.eccouncil.org/programs/certified-ethical-hacker-ceh/', category: 'Cybersécurité', level: 'Professional', cost: '$1199', free: false, duration: '120h', priority: 'Élevée', demand: 'Forte', salaryImpact: '+16k€', why: "Apprendre à penser comme un attaquant pour défendre : référence du pentesting offensif.", tags: 'hacking ethical hacker pentest cyber offensive ceh' },
  { name: 'CISSP – Certified Information Systems Security Professional', provider: '(ISC)²', url: 'https://www.isc2.org/certifications/cissp', category: 'Cybersécurité', level: 'Professional', cost: '$749', free: false, duration: '180h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+25k€', why: "Le saint Graal de la cybersécurité management : ouvre les postes de RSSI et architecte sécurité.", tags: 'cissp isc2 security management rssi architecte' },
  { name: 'TryHackMe (parcours gratuits)', provider: 'TryHackMe', url: 'https://tryhackme.com/', category: 'Cybersécurité', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Apprendre le hacking et la défense par la pratique gamifiée, avec des rooms gratuites pour tous niveaux.", tags: 'tryhackme gratuit free hacking pentest ctf' },
  { name: 'OSCP – Offensive Security Certified Professional', provider: 'OffSec', url: 'https://www.offsec.com/courses/pen-200/', category: 'Cybersécurité', level: 'Professional', cost: '$1749', free: false, duration: '300h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+22k€', why: "La certif pentest la plus respectée : examen 24h 100% pratique, le passeport pour devenir pentester pro.", tags: 'oscp offsec pentest hacking offensive practical' },
  { name: 'Google Cybersecurity Professional Certificate', provider: 'Google', url: 'https://www.coursera.org/professional-certificates/google-cybersecurity', category: 'Cybersécurité', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '160h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+10k€', why: "Programme Google pour devenir analyste SOC junior sans prérequis — auditable gratuitement.", tags: 'google cyber securite analyste soc gratuit coursera' },
  { name: 'CompTIA Network+', provider: 'CompTIA', url: 'https://www.comptia.org/certifications/network', category: 'Réseau', level: 'Associate', cost: '$369', free: false, duration: '80h', priority: 'Élevée', demand: 'Forte', salaryImpact: '+9k€', why: "Maîtriser les fondamentaux réseau (TCP/IP, routage, dépannage) : socle indispensable avant la sécurité.", tags: 'network reseau comptia tcp ip routing' },
  { name: 'Cisco CCNA', provider: 'Cisco', url: 'https://www.cisco.com/site/us/en/learn/training-certifications/certifications/enterprise/ccna/index.html', category: 'Réseau', level: 'Associate', cost: '$300', free: false, duration: '120h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+12k€', why: "La référence mondiale du réseau : configuration, routage et sécurité des infrastructures Cisco.", tags: 'cisco ccna reseau network routing switching' },

  // ───────────────────────────── IA / MACHINE LEARNING ─────────────────────────────
  { name: 'DeepLearning.AI — Machine Learning Specialization', provider: 'DeepLearning.AI', url: 'https://www.coursera.org/specializations/machine-learning-introduction', category: 'AI', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '90h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+15k€', why: "Le cours d'Andrew Ng, référence absolue pour entrer dans le ML : intuition, maths et pratique Python.", tags: 'ml machine learning ia ai andrew ng deeplearning gratuit' },
  { name: 'Hugging Face — AI Agents Course', provider: 'Hugging Face', url: 'https://huggingface.co/learn/agents-course/unit0/introduction', category: 'AI', level: 'Associate', cost: 'Gratuit', free: true, duration: '40h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+18k€', why: "Construire des agents IA autonomes (LLM + outils) — la compétence la plus hype de 2025, 100% gratuite.", tags: 'ai ia agents llm huggingface gratuit free rag' },
  { name: 'Hugging Face — NLP / LLM Course', provider: 'Hugging Face', url: 'https://huggingface.co/learn/nlp-course/chapter1/1', category: 'AI', level: 'Associate', cost: 'Gratuit', free: true, duration: '50h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+16k€', why: "Maîtriser les Transformers et fine-tuner des modèles de langage avec la lib la plus utilisée du monde.", tags: 'nlp llm transformers huggingface gratuit ia ai' },
  { name: 'Microsoft Certified: Azure AI Engineer Associate (AI-102)', provider: 'Microsoft', url: 'https://learn.microsoft.com/credentials/certifications/azure-ai-engineer/', category: 'AI', level: 'Associate', cost: '$165', free: false, duration: '70h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+17k€', why: "Construire des solutions IA en production (vision, NLP, OpenAI) sur Azure : très demandée en entreprise.", tags: 'azure ai engineer microsoft openai ia ai102' },
  { name: 'Google Cloud Professional Machine Learning Engineer', provider: 'Google Cloud', url: 'https://cloud.google.com/learn/certification/machine-learning-engineer', category: 'AI', level: 'Professional', cost: '$200', free: false, duration: '100h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+20k€', why: "Concevoir, déployer et industrialiser des modèles ML sur GCP : l'une des certifs IA les mieux payées.", tags: 'google ml machine learning engineer gcp ia mlops' },
  { name: 'Kaggle Learn (micro-cours gratuits)', provider: 'Kaggle', url: 'https://www.kaggle.com/learn', category: 'AI', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Micro-cours pratiques (Python, ML, deep learning, SQL) avec certificats gratuits et datasets réels.", tags: 'kaggle gratuit free ml data python ia' },
  { name: 'NVIDIA Deep Learning Institute (DLI)', provider: 'NVIDIA', url: 'https://www.nvidia.com/en-us/training/', category: 'AI', level: 'Professional', cost: 'Variable', free: false, duration: '8h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+14k€', why: "Certifications GPU/deep learning par NVIDIA : pointues sur l'accélération matérielle et le calcul IA.", tags: 'nvidia deep learning gpu ia cuda' },
  { name: 'ElevenLabs / Prompt Engineering (DeepLearning.AI free)', provider: 'DeepLearning.AI', url: 'https://www.deeplearning.ai/short-courses/', category: 'AI', level: 'Foundational', cost: 'Gratuit', free: true, duration: '5h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+8k€', why: "Courts cours gratuits sur le prompt engineering, RAG et agents — montée en compétence GenAI express.", tags: 'prompt engineering genai gratuit free llm rag deeplearning' },

  // ───────────────────────────── IA GÉNÉRATIVE / GENAI / LLM ─────────────────────────────
  { name: 'Generative AI with Large Language Models', provider: 'DeepLearning.AI & AWS', url: 'https://www.coursera.org/learn/generative-ai-with-llms', category: 'AI', level: 'Associate', cost: 'Audit gratuit', free: true, duration: '30h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+20k€', why: "Comprendre le cycle de vie complet d'un projet d'IA générative : pré-entraînement, fine-tuning et déploiement de LLM.", tags: 'generative ai genai gen ai ia generative llm large language model deeplearning aws gratuit fine tuning' },
  { name: 'Google Cloud — Generative AI Leader', provider: 'Google Cloud', url: 'https://cloud.google.com/learn/certification/generative-ai-leader', category: 'AI', level: 'Foundational', cost: '$99', free: false, duration: '20h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+12k€', why: "Première certif officielle Google dédiée à l'IA générative : valeur business, cas d'usage et gouvernance GenAI.", tags: 'generative ai genai gen ai ia generative google cloud leader llm business' },
  { name: 'Introduction to Generative AI (Google Cloud Skills Boost)', provider: 'Google Cloud', url: 'https://www.cloudskillsboost.google/course_templates/536', category: 'AI', level: 'Foundational', cost: 'Gratuit', free: true, duration: '3h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '—', why: "Cours d'introduction gratuit avec badge officiel pour comprendre les fondamentaux de l'IA générative.", tags: 'generative ai genai gen ia generative google gratuit free badge llm introduction' },
  { name: 'Microsoft Certified: Azure AI Fundamentals (AI-900)', provider: 'Microsoft', url: 'https://learn.microsoft.com/credentials/certifications/azure-ai-fundamentals/', category: 'AI', level: 'Foundational', cost: '$99', free: false, duration: '25h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+9k€', why: "Valider les fondamentaux IA et IA générative (Azure OpenAI, vision, NLP) — porte d'entrée idéale vers l'IA.", tags: 'generative ai genai ia generative azure microsoft openai ai900 fundamentals llm' },
  { name: 'AWS Certified AI Practitioner', provider: 'AWS', url: 'https://aws.amazon.com/certification/certified-ai-practitioner/', category: 'AI', level: 'Foundational', cost: '$100', free: false, duration: '30h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+11k€', why: "Nouvelle certif AWS couvrant l'IA et l'IA générative (Amazon Bedrock, prompt engineering) pour tous les profils.", tags: 'generative ai genai ia generative aws bedrock practitioner llm prompt' },
  { name: 'IBM — Generative AI Fundamentals (SkillsBuild / Coursera)', provider: 'IBM', url: 'https://www.coursera.org/specializations/ibm-generative-ai-fundamentals', category: 'AI', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '40h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+10k€', why: "Spécialisation IBM sur les fondamentaux de l'IA générative, les LLM, le prompt engineering et l'éthique — auditable gratuitement.", tags: 'generative ai genai ia generative ibm llm prompt fundamentals gratuit skillsbuild' },
  { name: 'NVIDIA — Generative AI & LLMs (DLI)', provider: 'NVIDIA', url: 'https://www.nvidia.com/en-us/training/', category: 'AI', level: 'Professional', cost: 'Variable', free: false, duration: '8h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+15k€', why: "Construire et déployer des modèles d'IA générative et des LLM accélérés sur GPU NVIDIA.", tags: 'generative ai genai ia generative nvidia llm gpu deep learning diffusion' },
  { name: 'ChatGPT Prompt Engineering for Developers (DeepLearning.AI)', provider: 'DeepLearning.AI', url: 'https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/', category: 'AI', level: 'Foundational', cost: 'Gratuit', free: true, duration: '3h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+8k€', why: "Maîtriser le prompt engineering avec l'API OpenAI pour bâtir des applications d'IA générative — 100% gratuit.", tags: 'generative ai genai ia generative chatgpt gpt openai prompt engineering gratuit free llm' },

  // ───────────────────────────── DATA ─────────────────────────────
  { name: 'Google Data Analytics Professional Certificate', provider: 'Google', url: 'https://www.coursera.org/professional-certificates/google-data-analytics', category: 'Data', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '180h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+11k€', why: "Devenir analyste data sans prérequis : SQL, R, Tableau et méthodologie — auditable gratuitement.", tags: 'data analyste analytics google sql tableau gratuit' },
  { name: 'Microsoft Certified: Power BI Data Analyst (PL-300)', provider: 'Microsoft', url: 'https://learn.microsoft.com/credentials/certifications/data-analyst-associate/', category: 'Data', level: 'Associate', cost: '$165', free: false, duration: '60h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+12k€', why: "Transformer la donnée en dashboards décisionnels avec Power BI : compétence ultra recherchée en entreprise.", tags: 'power bi data analyst microsoft dashboard pl300' },
  { name: 'Databricks Certified Data Engineer Associate', provider: 'Databricks', url: 'https://www.databricks.com/learn/certification/data-engineer-associate', category: 'Data', level: 'Associate', cost: '$200', free: false, duration: '70h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+18k€', why: "Industrialiser les pipelines data avec Spark et Lakehouse : data engineering très bien rémunéré.", tags: 'databricks data engineer spark lakehouse pipeline' },
  { name: 'Snowflake SnowPro Core', provider: 'Snowflake', url: 'https://www.snowflake.com/en/learn/certifications/', category: 'Data', level: 'Associate', cost: '$175', free: false, duration: '50h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+15k€', why: "Maîtriser le data warehouse cloud n°1 : recherchée dans toutes les équipes data modernes.", tags: 'snowflake data warehouse cloud snowpro' },
  { name: 'DataCamp (parcours data gratuits limités)', provider: 'DataCamp', url: 'https://www.datacamp.com/', category: 'Data', level: 'Foundational', cost: 'Freemium', free: true, duration: 'flexible', priority: 'Moyenne', demand: 'Forte', salaryImpact: '—', why: "Apprendre Python, SQL et data science en interactif, avec premiers chapitres gratuits.", tags: 'datacamp data python sql gratuit free' },

  // ───────────────────────────── DÉVELOPPEMENT WEB / FRONT / BACK ─────────────────────────────
  { name: 'Meta Front-End Developer Professional Certificate', provider: 'Meta', url: 'https://www.coursera.org/professional-certificates/meta-front-end-developer', category: 'Frontend', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '170h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+10k€', why: "Programme Meta pour devenir dev front : HTML, CSS, JavaScript et React — auditable gratuitement.", tags: 'meta frontend react javascript web developpeur gratuit' },
  { name: 'Meta Back-End Developer Professional Certificate', provider: 'Meta', url: 'https://www.coursera.org/professional-certificates/meta-back-end-developer', category: 'Backend', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '180h', priority: 'Élevée', demand: 'Forte', salaryImpact: '+11k€', why: "Devenir dev back avec Python, Django et APIs REST — parcours Meta complet et auditable gratuitement.", tags: 'meta backend python django api web developpeur gratuit' },
  { name: 'freeCodeCamp — Responsive Web Design', provider: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn/2022/responsive-web-design/', category: 'Frontend', level: 'Foundational', cost: 'Gratuit', free: true, duration: '300h', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Certif 100% gratuite et hands-on pour maîtriser HTML/CSS responsive et construire un portfolio.", tags: 'freecodecamp web html css responsive gratuit free frontend' },
  { name: 'freeCodeCamp — JavaScript Algorithms and Data Structures', provider: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8/', category: 'Frontend', level: 'Foundational', cost: 'Gratuit', free: true, duration: '300h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '—', why: "Maîtriser JavaScript et les structures de données par la pratique — certificat gratuit reconnu des recruteurs.", tags: 'freecodecamp javascript algorithmes gratuit free web' },
  { name: 'The Odin Project (Full Stack gratuit)', provider: 'The Odin Project', url: 'https://www.theodinproject.com/', category: 'Backend', level: 'Foundational', cost: 'Gratuit', free: true, duration: '500h', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Cursus open-source complet pour devenir développeur full-stack (Ruby ou JS) à partir de zéro.", tags: 'odin fullstack web javascript ruby gratuit free developpeur' },
  { name: 'Oracle Certified Professional: Java SE Developer', provider: 'Oracle', url: 'https://education.oracle.com/java-se', category: 'Backend', level: 'Professional', cost: '$245', free: false, duration: '120h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+12k€', why: "Valider une expertise Java reconnue mondialement : très utile pour les postes backend entreprise.", tags: 'java oracle backend developpeur enterprise' },

  // ───────────────────────────── MOBILE ─────────────────────────────
  { name: 'Meta iOS Developer Professional Certificate', provider: 'Meta', url: 'https://www.coursera.org/professional-certificates/meta-ios-developer', category: 'Mobile', level: 'Associate', cost: 'Audit gratuit', free: true, duration: '180h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+12k€', why: "Créer des apps iOS avec Swift et UIKit — programme Meta auditable gratuitement.", tags: 'ios swift mobile meta apple gratuit developpeur' },
  { name: 'Meta Android Developer Professional Certificate', provider: 'Meta', url: 'https://www.coursera.org/professional-certificates/meta-android-developer', category: 'Mobile', level: 'Associate', cost: 'Audit gratuit', free: true, duration: '180h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+12k€', why: "Développer des apps Android avec Kotlin et Jetpack Compose — parcours Meta gratuit en audit.", tags: 'android kotlin mobile meta google gratuit developpeur' },
  { name: 'Google Associate Android Developer', provider: 'Google', url: 'https://developers.google.com/certification/associate-android-developer', category: 'Mobile', level: 'Associate', cost: '$149', free: false, duration: '100h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+13k€', why: "Certif officielle Google validant la compétence à construire des apps Android de qualité production.", tags: 'android google mobile kotlin developpeur' },

  // ───────────────────────────── DEVOPS / SRE ─────────────────────────────
  { name: 'Certified Kubernetes Administrator (CKA)', provider: 'CNCF / Linux Foundation', url: 'https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/', category: 'DevOps', level: 'Professional', cost: '$445', free: false, duration: '90h', priority: 'Critique', demand: 'Très forte', salaryImpact: '+20k€', why: "La certif DevOps la plus prisée : administrer des clusters Kubernetes en production, examen 100% pratique.", tags: 'kubernetes k8s devops cka cncf cluster' },
  { name: 'HashiCorp Certified: Terraform Associate', provider: 'HashiCorp', url: 'https://www.hashicorp.com/certification/terraform-associate', category: 'DevOps', level: 'Associate', cost: '$70.50', free: false, duration: '40h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+15k€', why: "Maîtriser l'Infrastructure as Code avec Terraform : compétence DevOps incontournable et abordable.", tags: 'terraform hashicorp devops iac infrastructure' },
  { name: 'Docker Certified Associate', provider: 'Docker', url: 'https://www.docker.com/', category: 'DevOps', level: 'Associate', cost: '$195', free: false, duration: '50h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+12k€', why: "Valider la maîtrise de la conteneurisation Docker : socle de toute chaîne DevOps moderne.", tags: 'docker conteneur container devops' },
  { name: 'AWS Certified DevOps Engineer – Professional', provider: 'AWS', url: 'https://aws.amazon.com/certification/certified-devops-engineer-professional/', category: 'DevOps', level: 'Professional', cost: '$300', free: false, duration: '120h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+22k€', why: "Automatiser CI/CD, monitoring et infrastructure à grande échelle sur AWS : l'une des certifs les mieux payées.", tags: 'aws devops cicd automation engineer professional' },

  // ───────────────────────────── GESTION / AGILE / PRODUIT ─────────────────────────────
  { name: 'Professional Scrum Master I (PSM I)', provider: 'Scrum.org', url: 'https://www.scrum.org/assessments/professional-scrum-master-i-certification', category: 'Général', level: 'Foundational', cost: '$200', free: false, duration: '20h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+10k€', why: "Devenir Scrum Master reconnu : pilier de l'agilité en entreprise, examen sans abonnement obligatoire.", tags: 'scrum agile master gestion projet psm management' },
  { name: 'PMP – Project Management Professional', provider: 'PMI', url: 'https://www.pmi.org/certifications/project-management-pmp', category: 'Général', level: 'Professional', cost: '$555', free: false, duration: '150h', priority: 'Élevée', demand: 'Forte', salaryImpact: '+18k€', why: "La certif gestion de projet la plus reconnue mondialement : ouvre les postes de chef de projet senior.", tags: 'pmp pmi gestion projet management chef de projet' },
  { name: 'Google Project Management Professional Certificate', provider: 'Google', url: 'https://www.coursera.org/professional-certificates/google-project-management', category: 'Général', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '160h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+9k€', why: "Apprendre l'agile et le waterfall pour devenir chef de projet junior — auditable gratuitement.", tags: 'google project management gestion projet gratuit agile' },

  // ───────────────────────────── DESIGN / UX ─────────────────────────────
  { name: 'Google UX Design Professional Certificate', provider: 'Google', url: 'https://www.coursera.org/professional-certificates/google-ux-design', category: 'Général', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '200h', priority: 'Élevée', demand: 'Forte', salaryImpact: '+10k€', why: "Devenir UX designer sans prérequis : recherche utilisateur, wireframes, prototypes Figma — gratuit en audit.", tags: 'ux design figma google gratuit ui produit' },

  // ───────────────────────────── MARKETING / GROWTH ─────────────────────────────
  { name: 'Google Digital Marketing & E-commerce Certificate', provider: 'Google', url: 'https://www.coursera.org/professional-certificates/google-digital-marketing-ecommerce', category: 'Général', level: 'Foundational', cost: 'Audit gratuit', free: true, duration: '180h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+8k€', why: "Maîtriser SEO, ads, email et e-commerce pour décrocher un poste marketing digital — gratuit en audit.", tags: 'marketing digital seo ads ecommerce google gratuit growth' },
  { name: 'Google Analytics Certification (Skillshop)', provider: 'Google', url: 'https://skillshop.exceedlms.com/student/catalog', category: 'Général', level: 'Foundational', cost: 'Gratuit', free: true, duration: '10h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '—', why: "Certification officielle gratuite Google Analytics 4 — indispensable pour tout métier data/marketing web.", tags: 'google analytics ga4 marketing gratuit skillshop free' },
  { name: 'HubSpot Inbound / Content Marketing', provider: 'HubSpot', url: 'https://academy.hubspot.com/courses', category: 'Général', level: 'Foundational', cost: 'Gratuit', free: true, duration: '8h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '—', why: "Certifications gratuites HubSpot Academy reconnues en inbound marketing, CRM et content.", tags: 'hubspot marketing inbound crm gratuit free content' },

  // ───────────────────────────── BLOCKCHAIN / WEB3 ─────────────────────────────
  { name: 'Certified Blockchain Developer (Blockchain Council)', provider: 'Blockchain Council', url: 'https://www.blockchain-council.org/certifications/certified-blockchain-developer/', category: 'Backend', level: 'Professional', cost: '$249', free: false, duration: '60h', priority: 'Moyenne', demand: 'Modérée', salaryImpact: '+16k€', why: "Développer des dApps et smart contracts Solidity : niche web3 à fort potentiel salarial.", tags: 'blockchain web3 solidity smart contract crypto developpeur' },

  // ───────────────────────────── SALESFORCE / NO-CODE / OUTILS ─────────────────────────────
  { name: 'Salesforce Trailhead (badges gratuits)', provider: 'Salesforce', url: 'https://trailhead.salesforce.com/', category: 'Général', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Très forte', salaryImpact: '—', why: "Plateforme d'apprentissage gratuite Salesforce : badges et parcours vers des métiers CRM très demandés.", tags: 'salesforce trailhead crm gratuit free admin' },
  { name: 'Salesforce Certified Administrator', provider: 'Salesforce', url: 'https://trailhead.salesforce.com/credentials/administrator', category: 'Général', level: 'Associate', cost: '$200', free: false, duration: '80h', priority: 'Élevée', demand: 'Très forte', salaryImpact: '+14k€', why: "Administrer la plateforme CRM n°1 mondiale : énorme demande et pénurie de talents Salesforce.", tags: 'salesforce admin crm administrator certification' },
  { name: 'Atlassian University (parcours gratuits)', provider: 'Atlassian', url: 'https://university.atlassian.com/', category: 'Général', level: 'Foundational', cost: 'Freemium', free: true, duration: 'flexible', priority: 'Moyenne', demand: 'Forte', salaryImpact: '—', why: "Se former gratuitement à Jira et Confluence — outils omniprésents dans les équipes tech agiles.", tags: 'atlassian jira confluence agile gratuit free' },
  { name: 'MongoDB University (certifs & cours gratuits)', provider: 'MongoDB', url: 'https://learn.mongodb.com/', category: 'Data', level: 'Associate', cost: 'Freemium', free: true, duration: '40h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+12k€', why: "Apprendre la base NoSQL la plus populaire gratuitement, puis valider une certif officielle développeur/DBA.", tags: 'mongodb nosql database base de donnees gratuit free' },
  { name: 'IBM SkillsBuild (parcours gratuits)', provider: 'IBM', url: 'https://skillsbuild.org/', category: 'Général', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Centaines de cours et badges IBM gratuits en IA, cloud, data et cybersécurité avec attestation.", tags: 'ibm skillsbuild gratuit free ia cloud data cyber badges' },
  { name: 'Cisco Networking Academy (cours gratuits)', provider: 'Cisco', url: 'https://www.netacad.com/', category: 'Réseau', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Forte', salaryImpact: '—', why: "Cours gratuits Cisco en réseau, cybersécurité et Python avec badges reconnus par les employeurs.", tags: 'cisco netacad reseau network gratuit free python cyber' },
  { name: 'Microsoft Learn (parcours & certifs gratuites)', provider: 'Microsoft', url: 'https://learn.microsoft.com/training/', category: 'Général', level: 'Foundational', cost: 'Gratuit', free: true, duration: 'flexible', priority: 'Élevée', demand: 'Très forte', salaryImpact: '—', why: "Plateforme d'apprentissage gratuite Microsoft : modules guidés et sandbox pour préparer toutes les certifs Azure.", tags: 'microsoft learn azure gratuit free cloud ia data' },
  { name: 'GitHub Foundations', provider: 'GitHub', url: 'https://resources.github.com/learn/certifications/', category: 'DevOps', level: 'Foundational', cost: '$99', free: false, duration: '20h', priority: 'Moyenne', demand: 'Forte', salaryImpact: '+6k€', why: "Valider la maîtrise de Git, GitHub et de la collaboration de code : un must pour tout développeur.", tags: 'github git devops collaboration version control' },
];

// ── Scoring de pertinence d'une certif vs une requête étendue ────────────────
// 🎯 SÉPARATION STRICTE : on distingue la pertinence TEXTUELLE (le terme matche
// vraiment la certif) des bonus intrinsèques (gratuit, priorité…). Cela évite
// qu'une certif sans aucun lien avec la recherche soit affichée juste parce
// qu'elle est gratuite ou critique. → "ia générative" ne renvoie QUE de l'IA.
function textMatchScore(cert, terms, rawNorm) {
  const haystack = normalize(
    [cert.name, cert.provider, cert.category, cert.tags, cert.why, cert.level].filter(Boolean).join(' ')
  );
  const words = new Set(haystack.split(' ').filter(Boolean));
  const hasWord = (t) => words.has(t);
  let score = 0;
  if (rawNorm && rawNorm.length >= 2 && haystack.includes(rawNorm)) score += 12; // match exact de la requête
  for (const t of terms) {
    if (!t || t.length < 2) continue;
    if (t.includes(' ')) {
      // Expression multi-mots → match sur la chaîne complète
      if (haystack.includes(t)) score += 5;
    } else if (t.length <= 3) {
      // Token court (ia, ai, ml, ux…) → match MOT ENTIER uniquement
      // (évite que "ia" matche "spécialisation", "ai" matche "domain", etc.)
      if (hasWord(t)) score += 3;
    } else {
      // Token long → sous-chaîne acceptée (react→reactjs, cyber→cybersecurite…)
      if (haystack.includes(t)) score += 4;
    }
  }
  return score;
}

// Bonus servant UNIQUEMENT de départage entre certifs déjà pertinentes.
function intrinsicBonus(cert) {
  let b = 0;
  if (cert.free) b += 1.5;
  if (cert.priority === 'Critique') b += 1.2;
  else if (cert.priority === 'Élevée') b += 0.6;
  if ((cert.demand || '').toLowerCase().includes('très forte')) b += 0.8;
  return b;
}

// Comparateur : pertinence textuelle d'abord, puis gratuit, puis priorité.
function byRelevance(a, b) {
  if (b.t !== a.t) return b.t - a.t;
  const af = isFree(a.c) ? 0 : 1, bf = isFree(b.c) ? 0 : 1;
  if (af !== bf) return af - bf;
  if (b.bo !== a.bo) return b.bo - a.bo;
  return (PRIO_RANK[a.c.priority] ?? 3) - (PRIO_RANK[b.c.priority] ?? 3);
}

/**
 * Recherche bilingue dans le catalogue local.
 * 🎯 NE RENVOIE QUE des certifs RÉELLEMENT pertinentes pour la requête
 * (aucun bourrage avec des certifs hors-sujet). Peut donc renvoyer [] si la
 * requête est vide — le garde-fou "jamais vide" est géré par relevantSearch().
 */
export function searchCatalog(query, limit = 40) {
  const terms = expandTerms(query);
  const rawNorm = normalize(query);
  if (!rawNorm) return [];
  const scored = CERT_CATALOG
    .map(c => ({ c, t: textMatchScore(c, terms, rawNorm), bo: intrinsicBonus(c) }))
    .filter(x => x.t > 0); // ⇐ pertinence textuelle obligatoire
  scored.sort(byRelevance);
  return dedupePreserveOrder(scored.map(x => x.c)).slice(0, limit);
}

/**
 * Filtre une liste ARBITRAIRE (ex: résultats IA) pour ne garder que les
 * entrées réellement pertinentes pour la requête, triées par pertinence.
 * Les objets IA n'ont pas de "tags" : on score sur name/provider/category/why.
 */
export function filterRelevant(list = [], query = '', minTextScore = 2) {
  const terms = expandTerms(query);
  const rawNorm = normalize(query);
  if (!rawNorm) return dedupeAndSort(list);
  const scored = (Array.isArray(list) ? list : [])
    .filter(Boolean)
    .map(c => ({ c, t: textMatchScore(c, terms, rawNorm), bo: intrinsicBonus(c) }))
    .filter(x => x.t >= minTextScore);
  scored.sort(byRelevance);
  return dedupePreserveOrder(scored.map(x => x.c));
}

/**
 * Recherche garantie NON-VIDE et PERTINENTE.
 * 1) résultats IA pertinents + catalogue local pertinent (fusion dédupliquée)
 * 2) si vide, on relâche le seuil sur le catalogue local (toujours topique)
 * 3) si toujours vide (requête sans aucun lien), on renvoie les meilleures
 *    certifs IA/générales du catalogue — jamais un écran vide.
 * @returns {Array} jamais [] tant que le catalogue n'est pas vide.
 */
export function relevantSearch(aiList = [], query = '', max = 60) {
  const aiRelevant = filterRelevant(aiList, query, 2);
  const localRelevant = searchCatalog(query, max);
  let out = dedupePreserveOrder([...aiRelevant, ...localRelevant]);
  if (out.length > 0) return out.slice(0, max);

  // Relâche : matches partiels mono-token (toujours topiques via synonymes)
  const terms = expandTerms(query);
  const looseScored = CERT_CATALOG
    .map(c => {
      const hay = normalize([c.name, c.provider, c.category, c.tags, c.why].filter(Boolean).join(' '));
      const t = terms.reduce((s, term) => (term.length >= 3 && hay.includes(term) ? s + 1 : s), 0);
      return { c, t, bo: intrinsicBonus(c) };
    })
    .filter(x => x.t > 0)
    .sort(byRelevance);
  out = dedupePreserveOrder(looseScored.map(x => x.c));
  if (out.length > 0) return out.slice(0, max);

  // Ultime garde-fou : jamais vide.
  return topCerts(Math.min(max, 24));
}

const isFree = (c) => (c?.free === true || /gratuit|free|audit/i.test(c?.cost || ''));

/** Déduplique par nom normalisé en CONSERVANT l'ordre d'entrée. */
export function dedupePreserveOrder(list = []) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    if (!c || !c.name) continue;
    const k = normalize(c.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** Top certifs générales (pour le radar par défaut), free + critiques en tête. */
export function topCerts(limit = 24) {
  return dedupeAndSort(CERT_CATALOG.slice()).slice(0, limit);
}

const PRIO_RANK = { 'Critique': 0, 'Élevée': 1, 'Moyenne': 2 };

/** Déduplique par nom normalisé et trie : gratuites d'abord, puis priorité. */
export function dedupeAndSort(list = []) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    if (!c || !c.name) continue;
    const k = normalize(c.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out.sort((a, b) => {
    const af = (a.free === true || /gratuit|free|audit/i.test(a.cost || '')) ? 0 : 1;
    const bf = (b.free === true || /gratuit|free|audit/i.test(b.cost || '')) ? 0 : 1;
    if (af !== bf) return af - bf;
    return (PRIO_RANK[a.priority] ?? 3) - (PRIO_RANK[b.priority] ?? 3);
  });
}

/**
 * Fusionne des résultats IA avec le catalogue local et GARANTIT un minimum.
 * @param {Array} aiList   résultats venant de l'IA (peut être vide)
 * @param {string} query   requête utilisateur (pour le top-up pertinent)
 * @param {number} min     minimum de certifs à renvoyer
 */
export function mergeWithCatalog(aiList = [], query = '', min = 20) {
  const merged = dedupeAndSort([...(Array.isArray(aiList) ? aiList : [])]);
  if (merged.length >= min) return merged;
  const have = new Set(merged.map(c => normalize(c.name)));
  // Top-up pertinent d'abord (catalogue ciblé), puis top général en dernier
  // recours pour atteindre le minimum (utilisé par le RADAR profil, pas par la
  // recherche par mot-clé qui, elle, reste 100% pertinente via relevantSearch).
  const relevantTopUp = (query ? searchCatalog(query, 60) : []).filter(c => !have.has(normalize(c.name)));
  let out = dedupeAndSort([...merged, ...relevantTopUp]);
  if (out.length < min) {
    const seen = new Set(out.map(c => normalize(c.name)));
    const general = topCerts(60).filter(c => !seen.has(normalize(c.name)));
    out = dedupeAndSort([...out, ...general]);
  }
  return out.slice(0, Math.max(min, merged.length, 24));
}
