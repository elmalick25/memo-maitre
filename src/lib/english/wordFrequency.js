// src/lib/english/wordFrequency.js
// ════════════════════════════════════════════════════════════════════════════
// Bandes de fréquence lexicale anglaise — socle des mesures de richesse.
// ════════════════════════════════════════════════════════════════════════════
// Une richesse lexicale ne peut se mesurer qu'à condition d'avoir une échelle
// de référence : le CECRL parle de "familles de mots hors des 2 000 plus
// fréquentes" (typiquement estimées à partir des corpus BNC / COCA). Ce
// module fournit :
//
//   • BAND_1  — les 1 000 lemmes les plus fréquents (le "socle universel")
//   • BAND_2  — les 1 000 suivants (jusqu'aux 2 000)
//   • BAND_3  — 1 000 lemmes académiques et fréquents supplémentaires (≈ 3 000)
//   • AWL     — un sous-ensemble d'Academic Word List (marqueur B2+/C1)
//
// Les listes sont issues des tranches de fréquence publiques (General Service
// List, New General Service List, AWL de Coxhead) ; elles restent volontairement
// limitées à ~3 000 lemmes pour que l'app reste légère : au-delà de 3 000, on
// considère qu'un mot est "rare" au sens B2/C1, ce qui est le seuil utile pour
// noter la richesse.
//
// Un mot est classé par LEMMA : "running", "ran", "runs" comptent comme "run".
// La lemmatisation est heuristique (suffixes anglais réguliers), suffisante
// pour des mesures statistiques.
// ════════════════════════════════════════════════════════════════════════════

// prettier-ignore
const BAND_1_RAW =
  "the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us".split(/\s+/)
  .concat(
    "man find here thing world life hand part child eye woman place work week case point government company number group problem fact be have do say get make go know take see come think look want give use find tell ask work seem feel try leave call good new first last long great little own other old right big high different small large next early young important few public bad same able return sound tell try work still start speak turn feel next stop late show even seem happen play run keep hold bring begin lose write sit stand".split(/\s+/),
  )
  .concat(
    "child mother father family friend house home school car dog cat bird fish food water bread milk coffee tea money name word book page paper letter question answer story game team play music song film movie phone computer light dark red blue green yellow black white sun moon star sky sea river mountain city country town street road door window room table chair bed floor wall roof key hair face hand foot head body heart mind idea plan job business hour minute month country language history science art fact truth kind sort case reason chance right power point rule law fire smoke ice snow rain wind cloud earth ground grass tree flower leaf branch forest air".split(/\s+/),
  )
  .concat(
    "morning evening night today tomorrow yesterday summer winter spring autumn walk run drive fly swim eat drink sleep wake read write draw sing dance sit stand fall break build open close start finish stop wait meet visit send receive buy sell pay cost teach learn study explain listen understand remember forget love hate need believe hope wish worry laugh cry help fight win lose accept refuse allow deny agree disagree change move enter leave arrive depart travel return follow lead push pull carry throw catch touch reach hit shoot cover cross join divide count grow build cause happen mean matter appear seem stay become sound feel taste smell watch listen speak talk answer question notice describe compare choose decide plan design create develop improve solve prove reduce increase provide offer receive collect gather share include contain avoid escape prevent protect defend attack destroy kill save survive succeed fail depend require expect suppose consider treat manage".split(/\s+/),
  );

// Les 1000 suivants (échantillon représentatif). Beaucoup sont ajoutés parce
// qu'ils apparaissent typiquement à la frontière A2/B1.
// prettier-ignore
const BAND_2_RAW =
  "although however therefore whereas moreover meanwhile despite besides although though unless whether beyond behind beneath among across along toward within against beside upon amid alongside instead furthermore likewise otherwise consequently accordingly nevertheless afterwards eventually gradually suddenly quickly slowly barely hardly nearly totally completely absolutely relatively particularly especially specifically obviously apparently probably possibly certainly clearly frankly honestly ideally originally recently currently previously formerly typically usually seldom rarely frequently occasionally constantly permanently briefly temporarily forever roughly precisely exactly approximately essentially fundamentally basically generally mainly primarily largely mostly partially entirely fully partly barely enough almost quite rather somewhat pretty".split(/\s+/)
  .concat(
    "achieve acquire adapt adjust admit adopt advise afford analyze announce apply appreciate approach approve argue arise arrange assess assign assume attend attract avoid balance behave belong benefit blame blend borrow bother breathe broadcast browse burst calculate cancel capture celebrate charge chase claim classify clarify collect combine comment commit communicate compare compete complain complete comply concern conclude confirm confront confuse connect consider consist construct consume contain contribute control convert convince cooperate cope correct correspond count crash crawl create criticize crush cure damage debate decide declare decline decrease dedicate defeat defend define delay deliver demand demonstrate deny depend deploy describe deserve design destroy detect determine develop devote diagnose differ discover discuss dislike display dispose distinguish distribute disturb divide dominate donate download dream drift eliminate emerge emphasize employ enable encourage engage enhance enjoy enroll ensure entertain envy establish evaluate examine exceed exchange exclude execute exercise exhibit exist expand expect expend expert explain explore expose express extend extract face facilitate fade fascinate fasten feed film finance flood flourish focus forbid forecast forgive formulate found frown fulfill function furnish gaze generate govern grab grant guarantee guess guide handle hang harm heal hesitate highlight hire host identify ignore illustrate imagine impact implement imply impose impress improve include incorporate increase indicate infer influence inform inherit initiate inject injure inquire insist inspect inspire install intend interpret intervene introduce invade invent invest investigate invite involve isolate justify launch legislate lend lift limit link locate maintain manipulate manufacture master maximize measure mention mimic minimize misinterpret modernize modify motivate mount navigate negotiate neglect nominate notice obey observe obtain occupy occur operate optimize oppose organize outline overcome overlook oversee owe participate perceive perform persist persuade pinpoint pledge portray possess postpone predict prefer prepare preserve pretend prevent proceed process progress prohibit promise promote propose prosper protect protest prove provide publish pursue qualify quote raise range rank react receive reckon recognize recommend recover reduce refer reflect refuse register regret regulate reject relate relax release rely remain remark remind remove renew rent repair replace reply represent request require rescue resemble reserve resist resolve respond restore restrict retain retreat retrieve review revise revive reward risk sacrifice satisfy scan scatter schedule scold scream secure seek select serve settle shape shave shift shine shrink signal simplify skip solve sort specify speculate split spot spread stabilize state stem strain strengthen stretch strive submit substitute succeed suffer suggest summarize supervise supply support suppose suppress surround survive suspect swap sway swear sweep tackle tempt terminate testify thrive tolerate transfer transform translate transmit trigger trust unite update urge utilize validate value vanish vary verify vote wander warn waste weaken weigh whisper widen wither withdraw witness worship yield".split(/\s+/),
  )
  .concat(
    "ability access account achievement activity advantage advice affair agency alternative amount analysis anxiety application appointment approach argument article aspect assembly assessment asset assumption attempt attention attitude audience author authority average award awareness background balance barrier basis behavior belief benefit bias bond border boundary brain branch budget campaign capacity career category ceremony challenge channel chapter character choice circumstance client clue collection column combination comfort commitment communication community competition complaint concept conclusion condition confidence conflict connection consequence consideration consumer contact context contract contribution conversation criteria criticism crowd culture curiosity currency curriculum damage debate decision definition delight demand demonstration density department departure descendant description desire destination detail determination device difficulty dimension direction disadvantage disaster discipline discovery disease distance district document domain draft duration duty economy edition editor education efficiency effort element emphasis employment encounter energy enterprise entity environment equipment error estimate ethics evaluation evidence exception exchange existence expansion expectation expense experience experiment expert exposure factor failure feature federation feeling figure focus foundation framework function funeral gadget generation gesture goal governance grief growth guideline habit heritage hierarchy horizon hypothesis identity impact impression incident income independence indication industry inequality influence infrastructure ingredient initiative injury insight instance institution instruction instrument intention interaction interest interior intimacy investment involvement issue journey judgment justice knowledge landscape layer leadership legend length license lifestyle link literature location logic loyalty magnitude margin market material matter maximum measurement mechanism medium membership memory mention message method minimum ministry minority mission mixture moment motion motive movement narrative nature necessity network norm novel objective observation obstacle occasion occurrence odds opportunity opposition option organization outcome output overview ownership pace paragraph participation partnership passenger passion path pattern peace percentage performance period phase phenomenon phrase pillar pity policy population portion portrait position possibility potential poverty practice prediction preference presence pressure principle priority procedure profession profit project promise promotion proof property proposal prosperity province publicity purpose quality quantity range rate ratio reaction reality reason recognition record recovery reference reflection reform region regulation relationship relative relevance religion reminder replacement report reputation research reserve resistance resolution resource response responsibility restriction result revenue reward rhythm rival routine safety sample scenario scheme scope section sector security segment sequence session shortage significance situation solution somebody source specialty species sponsor stability standard statement status strategy strength stress structure struggle subject substance success suggestion summit supply support surface surprise survey survival symbol symptom system talent target technique technology tendency territory theory threat tolerance tradition transformation transition translation transportation treatment trend trouble tuition uncertainty unit update usage vacancy validity variety vehicle version victim virtue vision volume vulnerability warning weakness wealth welfare wisdom witness worth wound".split(/\s+/),
  );

// Bande 3 : marqueurs B2+/C1 — académique, formel, discours abstrait.
// prettier-ignore
const BAND_3_RAW =
  "abundant acumen adjacent adverse advocacy aesthetic albeit ambiguous ambivalent analogy anomaly anthology apex arbitrary arduous articulate audacious autonomy backdrop banal benevolent bleak candor cascade chronic circumvent coalesce coerce cognitive coherent collateral compelling complacent comprehensive comprise conducive congruent connoisseur conscientious consensus constrain contentious contingent contradict conundrum convey corroborate credible criterion culminate cursory deference deficit deliberate delineate demeanor derivative detrimental deviate diligent discern discerning discourse disparage disparity dispel disposition disseminate divergent duplicity elicit eloquent elusive embellish empirical emulate endeavor enigma epitome equanimity equitable erroneous esoteric esteem euphoric evocative exacerbate exemplary exhaustive extrapolate facet fallacy fastidious feasibility fervent finite flourish foresight formidable fortitude foster frivolous garner glimpse hallmark harness heuristic hindsight hone hyperbole hypothesis idiosyncratic ideology illicit imminent impartial impending imperative implicit incentive incessant incisive incongruous inconsistent indispensable inevitable inexorable inference infuse ingenuity inherent innate innocuous innovative insinuate insurmountable integral integrate intrepid intrinsic intuitive juxtapose lament latent legitimate lucid magnitude malaise malleable meticulous milestone mitigate momentum multifaceted mundane myriad negligible nostalgic notion novel notwithstanding nuance obscure obsolete ominous onset opulent orthodox oscillate ostensibly overt paradigm paradox paramount pending perceive pertinent pervasive plausible poignant precarious precedent preclude predicament predisposition prerequisite prevalent proactive proficient profound profuse proponent prospective pungent quantify quintessential rampant rebuke reciprocal reconcile redundant refute reiterate relentless relinquish repercussion reprehensible resilient resonate resurgence retrospect revamp reverberate rhetoric rigorous salient sanction scrutinize seamless serendipity singular skeptic solace solicit somber sporadic staunch stipulate subsequent substantiate subtle succinct superfluous surmise surreptitious sway synergy synthesize tacit tangible tantamount tenuous terrestrial thorough threshold traction transient trivial ubiquitous unanimous underscore undermine undertake unequivocal unforeseen unilateral unprecedented unravel usher validate venerable vernacular viable vibrant vicarious vigilant vindicate visceral volatile voluminous voracious wane warranted wistful zeal exemplify preclude notwithstanding albeit hitherto whereby herewith thereof therein hitherto forthwith heretofore".split(/\s+/);

// Petit sous-ensemble d'AWL (Academic Word List, Coxhead) — marqueur C1/C2.
const AWL_RAW =
  "analyze approach area assess assume authority available benefit concept consist constitute context contract create data define derive distribute economy environment establish estimate evident export factor finance formula function identify income indicate individual interpret involve issue labor legal legislate major method occur percent period policy principle proceed process require research respond role section sector significant similar source specific structure theory vary achieve acquire administrate affect appropriate aspect assist category chapter commission community complex compute conclude conduct consequent construct consume credit culture design distinct element equate evaluate feature final focus impact injure institute invest item journal maintain normal obtain participate perceive positive potential previous primary purchase range region regulate relevant reside resource restrict secure seek select site strategy survey text tradition transfer alternative circumstance comment compensate component consent considerable constant constrain contribute convene coordinate core corporate correspond criteria deduce demonstrate document dominate emphasis ensure exclude framework fund illustrate immigrate imply initial instance interact justify layer link locate maximum minor negate outcome partner philosophy physical proportion publish react register rely remove scheme sequence sex shift specify sufficient task technical technique technology valid volume access adequate annual apparent approximate attitude attribute civil code commit communicate concentrate confer contrast cycle debate despite dimension domestic emerge error ethnic goal grant hence hypothesize implement implicate impose integrate internal investigate job label mechanism obvious occupy option output overall parallel parameter phase predict principal prior professional project promote regime resolve retain series statistic status stress subsequent sum summary undertake academy adjust alter amend aware capacity challenge clause compound conflict consult contact decline discrete draft enable energy enforce entity equivalent evolve expand expose external facilitate fundamental generate generation image liberal license logic margin medical mental modify monitor network notion objective orient perspective precise prime psychology pursue ratio reject revenue stable style substitute sustain symbol target transit trend version welfare whereas abstract accurate acknowledge aggregate allocate assign attach author bond brief capable cite cooperate discriminate display diverse domain edit enhance estate exceed expert explicit federal fee flexibility furthermore gender ignorance incentive incidence incorporate index inhibit initiate input instruct intelligence interval lecture migrate minimum ministry motive neutral nevertheless overseas precede presume rational recover reveal scope subsidy tape trace transform transport underlie utilize".split(/\s+/);

function toSet(list) {
  return new Set(list.filter(Boolean));
}

/**
 * On stocke chaque bande sous forme de Set pour un lookup O(1).
 * BAND_2 exclut ce qui est déjà dans BAND_1, BAND_3 exclut BAND_1 et BAND_2.
 */
const BAND_1 = toSet(BAND_1_RAW);
const BAND_2 = new Set([...BAND_2_RAW].filter((w) => !BAND_1.has(w)));
const BAND_3 = new Set([...BAND_3_RAW].filter((w) => !BAND_1.has(w) && !BAND_2.has(w)));
const AWL = new Set([...AWL_RAW].filter((w) => !BAND_1.has(w)));

/** Nombre approximatif de mots par bande — utile pour l'UI ("2 000 familles"). */
export const BAND_SIZES = Object.freeze({
  band1: BAND_1.size,
  band2: BAND_2.size,
  band3: BAND_3.size,
  awl: AWL.size,
});

// ── Lemmatisation heuristique ────────────────────────────────────────────
// Aucun dictionnaire complet n'est nécessaire pour classer un mot : la
// morphologie régulière de l'anglais couvre 80 % des cas et suffit pour
// des mesures statistiques (l'erreur résiduelle est symétrique entre
// productions et se lisse sur un texte).

const IRREGULAR = new Map(
  Object.entries({
    are: "be", is: "be", was: "be", were: "be", been: "be", being: "be", am: "be",
    has: "have", had: "have", having: "have",
    does: "do", did: "do", done: "do", doing: "do",
    said: "say", saying: "say", says: "say",
    made: "make", making: "make",
    went: "go", gone: "go", going: "go", goes: "go",
    took: "take", taken: "take", taking: "take", takes: "take",
    saw: "see", seen: "see", seeing: "see", sees: "see",
    came: "come", coming: "come", comes: "come",
    knew: "know", known: "know", knowing: "know", knows: "know",
    got: "get", gotten: "get", getting: "get", gets: "get",
    gave: "give", given: "give", giving: "give", gives: "give",
    found: "find", finding: "find", finds: "find",
    thought: "think", thinking: "think", thinks: "think",
    told: "tell", telling: "tell", tells: "tell",
    became: "become", becoming: "become", becomes: "become",
    left: "leave", leaving: "leave", leaves: "leave",
    felt: "feel", feeling: "feel", feels: "feel",
    brought: "bring", bringing: "bring", brings: "bring",
    began: "begin", begun: "begin", beginning: "begin", begins: "begin",
    kept: "keep", keeping: "keep", keeps: "keep",
    held: "hold", holding: "hold", holds: "hold",
    wrote: "write", written: "write", writing: "write", writes: "write",
    stood: "stand", standing: "stand", stands: "stand",
    ran: "run", running: "run", runs: "run",
    ate: "eat", eaten: "eat", eating: "eat", eats: "eat",
    drank: "drink", drunk: "drink", drinking: "drink", drinks: "drink",
    spoke: "speak", spoken: "speak", speaking: "speak", speaks: "speak",
    read: "read", reading: "read", reads: "read",
    men: "man", women: "woman", children: "child", people: "person",
    feet: "foot", teeth: "tooth", geese: "goose", mice: "mouse",
    better: "good", best: "good", worse: "bad", worst: "bad",
    more: "much", most: "much", less: "little", least: "little",
    an: "a", these: "this", those: "that",
    myself: "i", yourself: "you", himself: "he", herself: "she",
    ourselves: "we", themselves: "they",
  }),
);

const STOP_STRIP = /^(?:re|un|dis|pre|mis|non|over|under|inter|super|anti)?/;

/**
 * Lemmatise un mot anglais avec des règles morphologiques régulières.
 * L'objectif n'est pas la linguistique parfaite mais l'appartenance à une
 * bande de fréquence.
 */
export function lemmatize(word) {
  if (!word) return "";
  const w = String(word).toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return "";
  if (IRREGULAR.has(w)) return IRREGULAR.get(w);
  if (w.length <= 3) return w;

  // Verbes réguliers
  if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    if (isKnown(stem)) return stem;
    if (isKnown(stem + "e")) return stem + "e"; // making → make
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      const single = stem.slice(0, -1); // running → run
      if (isKnown(single)) return single;
    }
  }
  if (w.endsWith("ied")) {
    const stem = w.slice(0, -3) + "y";
    if (isKnown(stem)) return stem;
  }
  if (w.endsWith("ies")) {
    const stem = w.slice(0, -3) + "y";
    if (isKnown(stem)) return stem;
  }
  if (w.endsWith("ed")) {
    const stem = w.slice(0, -2);
    if (isKnown(stem)) return stem;
    if (isKnown(stem + "e")) return stem + "e"; // moved → move
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      const single = stem.slice(0, -1);
      if (isKnown(single)) return single;
    }
  }
  if (w.endsWith("es")) {
    const stem = w.slice(0, -2);
    if (isKnown(stem)) return stem;
    const stem1 = w.slice(0, -1);
    if (isKnown(stem1)) return stem1;
  }
  if (w.endsWith("s") && !w.endsWith("ss")) {
    const stem = w.slice(0, -1);
    if (isKnown(stem)) return stem;
  }

  // Adjectifs comparatifs / superlatifs
  if (w.endsWith("er")) {
    const stem = w.slice(0, -2);
    if (isKnown(stem)) return stem;
    if (isKnown(stem + "e")) return stem + "e";
  }
  if (w.endsWith("est")) {
    const stem = w.slice(0, -3);
    if (isKnown(stem)) return stem;
    if (isKnown(stem + "e")) return stem + "e";
  }

  // Adverbes en -ly
  if (w.endsWith("ly")) {
    const stem = w.slice(0, -2);
    if (isKnown(stem)) return stem;
    if (stem.endsWith("i")) {
      const y = stem.slice(0, -1) + "y";
      if (isKnown(y)) return y;
    }
  }

  // Noms dérivés fréquents
  if (w.endsWith("ness") && w.length > 6) {
    const stem = w.slice(0, -4);
    if (isKnown(stem)) return stem;
  }
  if (w.endsWith("tion") || w.endsWith("sion")) {
    // On classe la nominalisation dans la même famille que le verbe.
    const verbe = w.slice(0, -3) + "e"; // creation → create
    if (isKnown(verbe)) return verbe;
  }

  return w;
}

function isKnown(word) {
  return BAND_1.has(word) || BAND_2.has(word) || BAND_3.has(word);
}

/** Bande à laquelle appartient un mot : 1, 2, 3 ou 4 (= au-delà). */
export function frequencyBand(word) {
  const lemma = lemmatize(word);
  if (!lemma) return 0;
  if (BAND_1.has(lemma)) return 1;
  if (BAND_2.has(lemma)) return 2;
  if (BAND_3.has(lemma)) return 3;
  return 4;
}

export function isAcademic(word) {
  return AWL.has(lemmatize(word));
}

/** Tokenise un texte anglais en mots exploitables. */
export function tokenize(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .match(/[a-z][a-z'\-]*/g) || [];
}

/**
 * Calcule les indicateurs lexicaux d'un texte.
 *
 * @returns {{
 *   words:number, distinctLemmas:number, guiraud:number,
 *   band1Ratio:number, band2Ratio:number, band3Ratio:number, rareWordRatio:number,
 *   academicRatio:number, hapaxRatio:number
 * }}
 */
export function lexicalProfile(text) {
  const tokens = tokenize(text);
  const total = tokens.length;
  if (total === 0) {
    return {
      words: 0, distinctLemmas: 0, guiraud: 0,
      band1Ratio: 0, band2Ratio: 0, band3Ratio: 0, rareWordRatio: 0,
      academicRatio: 0, hapaxRatio: 0,
    };
  }
  const lemmaCount = new Map();
  let band1 = 0, band2 = 0, band3 = 0, band4 = 0, academic = 0;
  for (const tok of tokens) {
    const lemma = lemmatize(tok);
    if (!lemma) continue;
    lemmaCount.set(lemma, (lemmaCount.get(lemma) || 0) + 1);
    const b = frequencyBand(tok);
    if (b === 1) band1++;
    else if (b === 2) band2++;
    else if (b === 3) band3++;
    else band4++;
    if (isAcademic(tok)) academic++;
  }
  const distinct = lemmaCount.size;
  const hapax = [...lemmaCount.values()].filter((c) => c === 1).length;
  return {
    words: total,
    distinctLemmas: distinct,
    guiraud: +(distinct / Math.sqrt(total)).toFixed(2),
    band1Ratio: +(band1 / total).toFixed(3),
    band2Ratio: +(band2 / total).toFixed(3),
    band3Ratio: +(band3 / total).toFixed(3),
    // Ce qui compte pour le CECRL : ratio de mots hors des 2 000 les plus fréquents.
    rareWordRatio: +((band3 + band4) / total).toFixed(3),
    academicRatio: +(academic / total).toFixed(3),
    hapaxRatio: +(hapax / total).toFixed(3),
  };
}

export const _internals = { BAND_1, BAND_2, BAND_3, AWL };
