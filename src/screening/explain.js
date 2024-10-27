/**
 * Explaining a screening.
 *
 * Six months after a damage, somebody has to read why the desk answered the way
 * it did. The screening record holds the facts and the recommendation holds the
 * verdict, and neither reads as an explanation on its own, so this puts them
 * together in the order a person asks the questions.
 */

import { facilityType } from '../ticket/types.js';
import { responseCode } from '../response/codes.js';

/** A line describing the work area the desk screened against. */
export function explainWorkArea(screening) {
  const { source, radiusFeet } = screening.workArea;
  switch (source) {
    case 'drawn':
      return 'the excavator drew the work area on the ticket';
    case 'corridor':
      return `the ticket gave a run, so a corridor ${radiusFeet} feet either side was used`;
    case 'extent':
      return `the ticket gave one point, so the ${radiusFeet} feet in the extent was used as a radius`;
    case 'point':
      return `the ticket gave one point, so the standing ${radiusFeet} foot radius was used`;
    default:
      return 'the ticket carried no geometry at all';
  }
}

/** A line describing whether the ticket is ours. */
export function explainOwnership(screening) {
  if (!screening.ours) return 'the work area falls outside every district we serve';
  if (screening.districts.length > 0) {
    return `the work area falls in ${screening.districts.join(' and ')}`;
  }
  if (screening.memberClaimed) return 'the centre routed the ticket to one of our member codes';
  return 'no districts are configured, so every ticket is treated as ours';
}

/** One line per facility the screening found. */
export function explainHits(screening) {
  return screening.hits.map((hit) => {
    const label = facilityType(hit.type).label;
    const distance = `${hit.feet.toFixed(1)} feet`;
    if (hit.abandoned) return `${hit.facilityId} is an abandoned ${label} ${distance} away`;
    if (hit.insideTolerance) {
      return `${hit.facilityId} is a ${label} ${distance} away, inside its ${hit.toleranceFeet} foot tolerance zone`;
    }
    return `${hit.facilityId} is a ${label} ${distance} away, outside its ${hit.toleranceFeet} foot tolerance zone`;
  });
}

/** A line describing the verdict. */
export function explainVerdict(screening, recommendation = null) {
  if (recommendation !== null) {
    const definition = responseCode(recommendation.code);
    return `answered ${definition.code}, ${definition.label}, because ${recommendation.reason}`;
  }
  if (screening.conflict) return 'our plant reaches into the work area';
  return screening.clearReason === null
    ? 'no verdict was reached'
    : `cleared: ${screening.clearReason}`;
}

/**
 * The whole explanation, as lines.
 *
 * @param {object} screening
 * @param {object} [recommendation]
 * @returns {string[]}
 */
export function explainScreening(screening, recommendation = null) {
  const lines = [
    `ticket ${screening.number}`,
    explainWorkArea(screening),
    explainOwnership(screening),
  ];
  const hits = explainHits(screening);
  if (hits.length === 0) lines.push('nothing of ours was found near the work area');
  else lines.push(...hits);
  lines.push(explainVerdict(screening, recommendation));
  return lines;
}

/** The explanation as one block of text. */
export function explanationText(screening, recommendation = null) {
  return `${explainScreening(screening, recommendation).join('\n')}\n`;
}

/** The explanation shortened to what fits on an audit trail entry. */
export function explanationDetail(screening, recommendation = null) {
  const verdict = explainVerdict(screening, recommendation);
  const live = screening.hits.filter((hit) => !hit.abandoned).length;
  return `${live} live facilities near the work area, ${verdict}`;
}
