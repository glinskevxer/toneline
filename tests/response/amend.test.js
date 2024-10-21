import { describe, expect, it } from 'vitest';
import {
  amendResponse,
  isSuperseded,
  effectiveResponses,
  amendmentChain,
  amendmentCount,
  standingAnswer,
} from '../../src/response/amend.js';
import { buildResponse } from '../../src/response/post.js';
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

describe('the supersedes field', () => {
  it('is null on an ordinary posting', () => {
    expect(posting().supersedes).toBeNull();
  });

  it('has to be a timestamp when it is there', () => {
    expect(() => posting({ supersedes: '2024-03-16' })).toThrow(/named by its own timestamp/);
  });
});

describe('amendResponse', () => {
  it('names the posting it replaces', () => {
    const original = posting();
    const fixed = amendResponse(
      original,
      { code: '7' },
      {
        at: '2024-03-16T11:00',
        by: 'kmartel',
        reason: 'the transmission main was missed on the first pass',
      }
    );
    expect(fixed.supersedes).toBe('2024-03-16T09:40');
    expect(fixed.code).toBe('7');
    expect(fixed.note).toMatch(/transmission main/);
  });

  it('carries the fields it was not asked to change', () => {
    const original = posting({ facilityType: 'gas' });
    const fixed = amendResponse(
      original,
      {},
      {
        at: '2024-03-16T11:00',
        by: 'kmartel',
        reason: 'reissued after a records check',
      }
    );
    expect(fixed.scope).toBe('GAS');
    expect(fixed.marksThrough).toBe('2024-03-29');
  });

  it('refuses an amendment that predates the posting', () => {
    expect(() =>
      amendResponse(posting(), {}, { at: '2024-03-16T08:00', by: 'k', reason: 'x' })
    ).toThrow(ResponseError);
    expect(() =>
      amendResponse(posting(), {}, { at: '2024-03-16T09:40', by: 'k', reason: 'x' })
    ).toThrow(/after the posting it replaces/);
  });

  it('refuses an amendment with no reason', () => {
    expect(() =>
      amendResponse(posting(), {}, { at: '2024-03-16T11:00', by: 'k', reason: '  ' })
    ).toThrow(/has to say why/);
    expect(() =>
      amendResponse(posting(), {}, { at: '2024-03-16T11:00', by: 'k', reason: null })
    ).toThrow(/has to say why/);
  });

  it('still checks what the new code demands', () => {
    expect(() =>
      amendResponse(
        posting(),
        { code: '4', meetAt: null },
        {
          at: '2024-03-16T11:00',
          by: 'k',
          reason: 'meet arranged',
        }
      )
    ).toThrow(/time it was set for/);
  });
});

describe('supersession', () => {
  const original = posting();
  const fixed = amendResponse(
    original,
    { code: '7' },
    {
      at: '2024-03-16T11:00',
      by: 'kmartel',
      reason: 'the transmission main was missed',
    }
  );

  it('knows which posting has been replaced', () => {
    expect(isSuperseded(original, [original, fixed])).toBe(true);
    expect(isSuperseded(fixed, [original, fixed])).toBe(false);
  });

  it('drops the replaced posting from what still stands', () => {
    expect(effectiveResponses([original, fixed]).map((entry) => entry.at)).toEqual([
      '2024-03-16T11:00',
    ]);
  });

  it('leaves a posting for another ticket alone', () => {
    const other = posting({ number: 'B240315000421' });
    expect(effectiveResponses([original, fixed, other])).toHaveLength(2);
  });

  it('follows a chain of corrections back', () => {
    const twice = amendResponse(
      fixed,
      { code: '2' },
      {
        at: '2024-03-16T14:00',
        by: 'kmartel',
        reason: 'the main turned out to be abandoned',
      }
    );
    const chain = amendmentChain(twice, [original, fixed, twice]);
    expect(chain.map((entry) => entry.at)).toEqual([
      '2024-03-16T09:40',
      '2024-03-16T11:00',
      '2024-03-16T14:00',
    ]);
  });

  it('stops the chain where the record runs out', () => {
    expect(amendmentChain(fixed, [fixed])).toHaveLength(1);
  });

  it('counts the corrections', () => {
    expect(amendmentCount([original, fixed], 'B240315000420')).toBe(1);
    expect(amendmentCount([original], 'B240315000420')).toBe(0);
  });
});

describe('standingAnswer', () => {
  const gas = posting({ facilityType: 'gas' });
  const water = posting({ facilityType: 'water', at: '2024-03-16T10:00' });
  const fixedGas = amendResponse(
    gas,
    { code: '7' },
    {
      at: '2024-03-16T11:00',
      by: 'kmartel',
      reason: 'critical main found',
    }
  );

  it('finds the latest answer that still stands', () => {
    const answer = standingAnswer([gas, water, fixedGas], { number: 'B240315000420' });
    expect(answer.at).toBe('2024-03-16T11:00');
  });

  it('narrows to one facility type', () => {
    const answer = standingAnswer([gas, water, fixedGas], {
      number: 'B240315000420',
      scope: 'WATER',
    });
    expect(answer.scope).toBe('WATER');
  });

  it('finds nothing for a ticket with no postings', () => {
    expect(standingAnswer([gas], { number: 'B240315000421' })).toBeNull();
  });
});
