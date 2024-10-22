import { describe, expect, it } from 'vitest';
import {
  renderPosting,
  renderBatch,
  parseAcknowledgement,
  outstandingAfter,
  acknowledgementSummary,
} from '../../src/response/transmit.js';
import { buildResponse } from '../../src/response/post.js';
import { amendResponse } from '../../src/response/amend.js';
import { ResponseError } from '../../src/response/codes.js';

function posting(overrides = {}) {
  return buildResponse({
    number: 'B240315000420',
    code: '2',
    at: '2024-03-16T09:40',
    by: 'loc-14',
    marksThrough: '2024-03-29',
    ...overrides,
  });
}

describe('renderPosting', () => {
  it('writes the labels the centre reads', () => {
    const text = renderPosting(posting(), { operator: 'CTG01' });
    expect(text).toContain('TICKET NUMBER: B240315000420');
    expect(text).toContain('MEMBER: CTG01');
    expect(text).toContain('RESPONSE: 2  SCOPE: ALL');
    expect(text).toContain('POSTED: 03/16/2024 09:40');
    expect(text).toContain('MARKS THROUGH: 03/29/2024');
    expect(text).toContain('TEXT: facilities marked');
  });

  it('leaves out what the posting does not carry', () => {
    const text = renderPosting(posting({ code: '1', marksThrough: null }), { operator: 'CTG01' });
    expect(text).not.toContain('MARKS THROUGH');
    expect(text).not.toContain('MEET AT');
    expect(text).not.toContain('SUPERSEDES');
  });

  it('writes the meet time on a meet', () => {
    const meet = posting({ code: '4', marksThrough: null, meetAt: '2024-03-18T08:00' });
    expect(renderPosting(meet, { operator: 'CTG01' })).toContain('MEET AT: 03/18/2024 08:00');
  });

  it('names the posting it replaces', () => {
    const fixed = amendResponse(
      posting(),
      { code: '7' },
      {
        at: '2024-03-16T11:00',
        by: 'kmartel',
        reason: 'critical main found',
      }
    );
    const text = renderPosting(fixed, { operator: 'CTG01' });
    expect(text).toContain('SUPERSEDES: 03/16/2024 09:40');
    expect(text).toContain('REMARKS: critical main found');
  });

  it('narrows the scope when the posting does', () => {
    expect(renderPosting(posting({ facilityType: 'gas' }), { operator: 'CTG01' })).toContain(
      'SCOPE: GAS'
    );
  });
});

describe('renderBatch', () => {
  it('writes a header and one block per posting', () => {
    const text = renderBatch([posting(), posting({ number: 'B240315000421' })], {
      operator: 'CTG01',
      at: '2024-03-16T10:00',
      sequence: '44',
    });
    expect(text).toContain('BATCH: 44');
    expect(text).toContain('BLOCKS: 2');
    expect(text.split('=========')).toHaveLength(3);
  });

  it('defaults the batch number', () => {
    expect(renderBatch([posting()], { operator: 'CTG01', at: '2024-03-16T10:00' })).toContain(
      'BATCH: 1'
    );
  });

  it('refuses to send nothing', () => {
    expect(() => renderBatch([], { operator: 'CTG01', at: '2024-03-16T10:00' })).toThrow(
      ResponseError
    );
    expect(() => renderBatch(null, { operator: 'CTG01', at: '2024-03-16T10:00' })).toThrow(
      /nothing to send/
    );
  });
});

describe('parseAcknowledgement', () => {
  const text = [
    'BATCH: 44',
    'RECEIVED: 03/16/2024 10:02',
    '=========',
    'TICKET NUMBER: B240315000420',
    'STATUS: ACCEPTED',
    '=========',
    'TICKET NUMBER: B240315000421',
    'STATUS: REJECTED  REASON: TICKET ALREADY CLOSED',
  ].join('\n');

  it('splits what was taken from what was not', () => {
    const ack = parseAcknowledgement(text);
    expect(ack.sequence).toBe('44');
    expect(ack.accepted).toEqual(['B240315000420']);
    expect(ack.rejected).toEqual([{ number: 'B240315000421', reason: 'TICKET ALREADY CLOSED' }]);
  });

  it('falls back to the status when no reason was given', () => {
    const bare = ['BATCH: 44', '=========', 'TICKET NUMBER: B1', 'STATUS: DEFERRED'].join('\n');
    expect(parseAcknowledgement(bare).rejected[0].reason).toBe('deferred');
  });

  it('rejects an empty acknowledgement', () => {
    expect(() => parseAcknowledgement('')).toThrow(/acknowledgement is empty/);
  });

  it('rejects a block naming no ticket', () => {
    const bad = ['BATCH: 44', '=========', 'STATUS: ACCEPTED'].join('\n');
    expect(() => parseAcknowledgement(bad)).toThrow(/names no ticket/);
  });

  it('reads an acknowledgement with a header and nothing else', () => {
    const ack = parseAcknowledgement('BATCH: 44\nRECEIVED: 03/16/2024 10:02');
    expect(ack.accepted).toEqual([]);
    expect(ack.rejected).toEqual([]);
  });
});

describe('outstandingAfter and acknowledgementSummary', () => {
  const postings = [posting(), posting({ number: 'B240315000421' })];
  const ack = parseAcknowledgement(
    ['BATCH: 44', '=========', 'TICKET NUMBER: B240315000420', 'STATUS: ACCEPTED'].join('\n')
  );

  it('keeps what the centre did not take', () => {
    expect(outstandingAfter(postings, ack).map((entry) => entry.number)).toEqual(['B240315000421']);
  });

  it('summarises the acknowledgement', () => {
    expect(acknowledgementSummary(ack)).toEqual({
      sequence: '44',
      accepted: 1,
      rejected: 0,
      reasons: [],
    });
  });
});
