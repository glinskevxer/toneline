/**
 * Making the trail hard to quietly edit.
 *
 * The audit trail is the operator's own record and it is read after a damage,
 * sometimes by people with an interest in what it says. Chaining each entry to
 * the one before it does not stop anybody changing the file, but it does stop a
 * change going unnoticed, which is the honest thing to claim.
 */

import { createHash } from 'node:crypto';
import { AuditError } from './trail.js';

/** The digest the chain starts from. */
export const GENESIS = '0'.repeat(64);

/** The fields that go into an entry digest, in a fixed order. */
export function digestInput(entry, previous) {
  return [
    previous,
    entry.at,
    entry.subject,
    entry.action,
    entry.by,
    entry.detail ?? '',
    entry.data === null ? '' : JSON.stringify(entry.data),
  ].join(' | ');
}

/** The digest for one entry, given the one before it. */
export function digestFor(entry, previous = GENESIS) {
  return createHash('sha256').update(digestInput(entry, previous)).digest('hex');
}

/**
 * Chain a run of entries.
 *
 * @param {object[]} entries the entries in the order they were written
 * @returns {Array<{entry: object, digest: string, previous: string}>}
 */
export function chain(entries) {
  const links = [];
  let previous = GENESIS;
  for (const entry of entries) {
    const digest = digestFor(entry, previous);
    links.push({ entry, digest, previous });
    previous = digest;
  }
  return links;
}

/** The digest at the end of a run, which is the whole trail in one string. */
export function chainHead(entries) {
  const links = chain(entries);
  return links.length === 0 ? GENESIS : links[links.length - 1].digest;
}

/**
 * Check a chain against the digests it was written with.
 *
 * @returns {{sound: boolean, brokenAt: number|null, reason: string|null}}
 */
export function verifyChain(links) {
  let previous = GENESIS;
  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    if (link.previous !== previous) {
      return broken(i, 'the link does not follow the one before it');
    }
    if (digestFor(link.entry, previous) !== link.digest) {
      return broken(i, 'the entry does not match its digest');
    }
    previous = link.digest;
  }
  return { sound: true, brokenAt: null, reason: null };
}

function broken(index, reason) {
  return { sound: false, brokenAt: index, reason };
}

/** Chain a trail and hand back the head, refusing an entry with no subject. */
export function sealTrail(trail) {
  const entries = trail.sorted();
  for (const entry of entries) {
    if (entry.subject === '') {
      throw new AuditError('an entry with no subject cannot be sealed', { at: entry.at });
    }
  }
  return { head: chainHead(entries), entries: entries.length };
}
