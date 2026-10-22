import { isAuthoritativeDomain } from './scholarshipVerifier.js';

export function isOfficialScholarshipCandidate(item) {
  return Boolean(item?.title && item?.provider && item?.country &&
    typeof item.officialUrl === 'string' && item.officialUrl.startsWith('https://') &&
    isAuthoritativeDomain(item.officialUrl));
}

/** Never invent an annual opening date from a closed application deadline. */
export function preserveOfficialDeadline(deadline) {
  return deadline || { nextDate: null, season: 'Dates à confirmer sur le site officiel', isStrict: false };
}
