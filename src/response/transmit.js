/**
 * Sending postings back to the centre.
 *
 * The centre takes the same labelled block format it sends, with a header
 * naming the operator and counting the blocks so a truncated file is caught on
 * arrival rather than silently losing the last ticket. The acknowledgement it
 * sends back is read here too, because a posting the centre did not take is
 * still outstanding however sure the desk is that it went.
 */

import { ResponseError, responseCode } from './codes.js';
import { formatCentreDate, formatCentreStamp } from '../time/formats.js';
import { parseTransmission, splitTransmissions } from '../io/transmission.js';

const RULE = '=========';

/** Render one posting as a block. */
export function renderPosting(posting, { operator }) {
  const definition = responseCode(posting.code);
  const lines = [
    `TICKET NUMBER: ${posting.number}`,
    `MEMBER: ${operator}`,
    `RESPONSE: ${posting.code}  SCOPE: ${posting.scope}`,
    `POSTED: ${formatCentreStamp(posting.at)}`,
    `BY: ${posting.by}`,
  ];
  if (posting.marksThrough !== null) {
    lines.push(`MARKS THROUGH: ${formatCentreDate(posting.marksThrough)}`);
  }
  if (posting.meetAt !== null) {
    lines.push(`MEET AT: ${formatCentreStamp(posting.meetAt)}`);
  }
  if (posting.supersedes !== null) {
    lines.push(`SUPERSEDES: ${formatCentreStamp(posting.supersedes)}`);
  }
  lines.push(`TEXT: ${definition.label}`);
  if (posting.note !== null) lines.push(`REMARKS: ${posting.note}`);
  return lines.join('\n');
}

/**
 * Render a whole batch.
 *
 * @param {object[]} postings the postings to send
 * @param {object} args
 * @param {string} args.operator the operator member code
 * @param {string} args.at when the file is being sent
 * @param {string} [args.sequence] the sender's own batch number
 */
export function renderBatch(postings, { operator, at, sequence = '1' }) {
  if (!Array.isArray(postings) || postings.length === 0) {
    throw new ResponseError('there is nothing to send', { count: postings?.length ?? 0 });
  }
  const header = [
    `BATCH: ${sequence}`,
    `MEMBER: ${operator}`,
    `SENT: ${formatCentreStamp(at)}`,
    `BLOCKS: ${postings.length}`,
  ].join('\n');
  const blocks = postings.map((posting) => renderPosting(posting, { operator }));
  return `${[header, ...blocks].join(`\n${RULE}\n`)}\n`;
}

/**
 * Read the centre's acknowledgement.
 *
 * @returns {{sequence: string|null, accepted: string[], rejected: Array<{number: string, reason: string}>}}
 */
export function parseAcknowledgement(text) {
  const blocks = splitTransmissions(text);
  if (blocks.length === 0) {
    throw new ResponseError('the acknowledgement is empty', {});
  }
  const header = parseTransmission(blocks[0]);
  const sequence = header.fields.BATCH ?? null;
  const accepted = [];
  const rejected = [];
  for (const block of blocks.slice(1)) {
    const parsed = parseTransmission(block);
    const number = parsed.fields['TICKET NUMBER'];
    if (number === undefined) {
      throw new ResponseError('an acknowledgement block names no ticket', {});
    }
    const status = (parsed.fields.STATUS ?? '').toUpperCase();
    if (status === 'ACCEPTED') accepted.push(number);
    else rejected.push({ number, reason: parsed.fields.REASON ?? status.toLowerCase() });
  }
  return { sequence, accepted, rejected };
}

/** The postings the centre did not take, which are still outstanding. */
export function outstandingAfter(postings, acknowledgement) {
  const taken = new Set(acknowledgement.accepted);
  return postings.filter((posting) => !taken.has(posting.number));
}

/** A short summary of what came back. */
export function acknowledgementSummary(acknowledgement) {
  return {
    sequence: acknowledgement.sequence,
    accepted: acknowledgement.accepted.length,
    rejected: acknowledgement.rejected.length,
    reasons: acknowledgement.rejected.map((entry) => entry.reason),
  };
}
