// ═══════════════════════════════════════════════════════════════════════════
// 🌱 Seed Pack permanent : actus tech de référence embarquées dans l'app.
// Dernier niveau de la cascade : Flux frais ⟶ Hot Standby ⟶ Seed Pack.
// Garantit qu'on n'affiche JAMAIS « 0 actu », même sans réseau.
// ═══════════════════════════════════════════════════════════════════════════

const SEED = [
  ["Numerama", "Numerama", "IA générative : comment les modèles de langage apprennent réellement", "Les grands modèles de langage reposent sur l'architecture Transformer et un entraînement sur d'immenses corpus. Tour d'horizon des étapes : pré-entraînement, ajustement fin et alignement par retour humain.", "https://www.numerama.com/tech/"],
  ["Clubic", "Clubic", "Cybersécurité : les cinq réflexes qui bloquent 90 % des attaques", "Double authentification, mises à jour automatiques, gestionnaire de mots de passe, sauvegardes hors ligne et vigilance face au hameçonnage restent les meilleures protections.", "https://www.clubic.com/"],
  ["Le Monde Informatique", "NextINpact", "Cloud souverain : où en sont les offres européennes ?", "Face aux géants américains, les fournisseurs européens misent sur la conformité RGPD et la qualification SecNumCloud pour séduire les entreprises et administrations.", "https://www.lemondeinformatique.fr/"],
  ["Frandroid", "LesNumeriques", "Smartphones : l'IA embarquée change l'usage au quotidien", "Traduction en direct, retouche photo intelligente, résumé de notes : les puces dotées d'unités neuronales exécutent désormais ces tâches sans connexion.", "https://www.frandroid.com/"],
  ["Les Numériques", "LesNumeriques", "Batteries : pourquoi la charge à 80 % prolonge la durée de vie", "Limiter la charge maximale réduit le stress chimique des cellules lithium-ion. La plupart des appareils récents proposent une option de charge optimisée.", "https://www.lesnumeriques.com/"],
  ["MacGeneration", "MacGeneration", "Apple Silicon : l'architecture ARM s'impose sur le poste de travail", "Les puces Apple ont prouvé qu'ARM pouvait conjuguer performances et autonomie. Windows et Linux accélèrent à leur tour leur prise en charge.", "https://www.macg.co/"],
  ["Futura Tech", "Futura", "Informatique quantique : ce que les qubits savent déjà faire", "Simulation moléculaire, optimisation logistique, cryptographie : les premières applications émergent, même si la correction d'erreurs reste le grand défi.", "https://www.futura-sciences.com/tech/"],
  ["ZDNet FR", "NextINpact", "DevOps : l'automatisation des déploiements devient la norme", "Intégration continue, infrastructure en tant que code et observabilité permettent aux équipes de livrer plus souvent avec moins d'incidents.", "https://www.zdnet.fr/"],
  ["Next.ink", "NextINpact", "Open source : pourquoi les entreprises contribuent de plus en plus", "Mutualiser les coûts, attirer des talents et sécuriser la chaîne logicielle : les motivations derrière l'essor des contributions d'entreprise.", "https://next.ink/"],
  ["01net", "Clubic", "Mots de passe : les passkeys vont-elles tout remplacer ?", "Basées sur la cryptographie à clé publique, les passkeys suppriment le risque de vol de mot de passe et simplifient la connexion.", "https://www.01net.com/"],
  ["Journal du Geek", "JournalDuGeek", "Wi-Fi 7 : quels gains concrets pour la maison ?", "Débits plus élevés, latence réduite et fonctionnement multi-bandes simultané : le nouveau standard promet une connexion plus stable.", "https://www.journaldugeek.com/"],
  ["Siècle Digital", "Numerama", "Agents IA : la prochaine étape après les assistants conversationnels", "Capables d'enchaîner des actions de manière autonome, les agents IA s'intègrent aux outils métiers pour automatiser des tâches complètes.", "https://siecledigital.fr/"],
  ["Developpez.com", "Developpez", "TypeScript reste le langage préféré des développeurs web", "Le typage statique réduit les bugs en production et améliore l'autocomplétion. Son adoption continue de progresser dans les grands projets.", "https://www.developpez.com/"],
  ["LinuxFr", "LinuxFr", "Linux sur le poste de travail : une part de marché en hausse", "Le jeu vidéo via Proton, les distributions plus accessibles et la fin de support de vieux systèmes poussent de nouveaux utilisateurs vers Linux.", "https://linuxfr.org/"],
  ["Korben", "LinuxFr", "Auto-hébergement : reprendre le contrôle de ses données", "Un petit serveur domestique suffit pour héberger ses photos, documents et mots de passe, à l'abri des services centralisés.", "https://korben.info/"],
  ["Presse-citron", "JournalDuGeek", "Réglementation : ce que change l'AI Act européen", "Le texte classe les systèmes d'IA selon leur niveau de risque et impose des obligations de transparence aux modèles à usage général.", "https://www.presse-citron.net/"],
  ["BFM Tech", "Clubic", "Data centers : la course à l'efficacité énergétique", "Refroidissement liquide, récupération de chaleur et énergies renouvelables deviennent indispensables face à l'explosion des besoins de l'IA.", "https://www.bfmtv.com/tech/"],
  ["Numerama", "Numerama", "Hameçonnage : les nouvelles arnaques dopées à l'IA", "Courriels sans fautes, voix clonées et faux sites crédibles : les escroqueries gagnent en réalisme. Vérifier l'expéditeur reste essentiel.", "https://www.numerama.com/cyberguerre/"],
  ["Clubic", "Clubic", "Rust gagne du terrain dans les systèmes critiques", "Sa gestion sûre de la mémoire élimine une grande famille de failles. Noyau Linux, navigateurs et cloud l'adoptent progressivement.", "https://www.clubic.com/"],
  ["Le Monde Informatique", "NextINpact", "Bases de données vectorielles : le moteur caché de la recherche IA", "Elles stockent des représentations numériques du sens et permettent aux applications de retrouver l'information pertinente pour un modèle de langage.", "https://www.lemondeinformatique.fr/"],
  ["Futura Tech", "Futura", "Puces neuromorphiques : s'inspirer du cerveau pour calculer", "Ces processeurs imitent les neurones pour traiter l'information avec une consommation électrique très réduite.", "https://www.futura-sciences.com/tech/"],
  ["MacGeneration", "MacGeneration", "Confidentialité : le traitement local des données progresse", "De plus en plus de fonctions intelligentes s'exécutent directement sur l'appareil, limitant l'envoi de données personnelles vers le cloud.", "https://www.macg.co/"],
  ["Frandroid", "LesNumeriques", "Voitures électriques : le logiciel au cœur de l'expérience", "Mises à jour à distance, aide à la conduite et planification des recharges : la voiture devient une plateforme logicielle.", "https://www.frandroid.com/"],
  ["ZDNet FR", "NextINpact", "Kubernetes : simplifier l'orchestration grâce aux plateformes internes", "Les équipes plateforme proposent des modèles prêts à l'emploi pour que les développeurs déploient sans maîtriser chaque détail.", "https://www.zdnet.fr/"],
];

/** Construit le Seed Pack (horodaté à l'appel pour passer les filtres d'âge). */
export function getSeedPack() {
  const now = Date.now();
  return SEED.map(([sourceName, source, title, description, url], i) => ({
    id: `seed_${i}`,
    source, sourceName,
    title, titleFr: title,
    description, descriptionFr: description,
    fullContent: description,
    url,
    ts: now - i * 15 * 60 * 1000,
    score: 3,
    lang: "fr",
    priority: 1,
    isWorld: false,
    isSeed: true,
  }));
}
