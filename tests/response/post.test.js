import { describe, expect, it } from 'vitest';
import {
  buildResponse,
  coversType,
  sortResponses,
  latestResponse,
  coveredScopes,
  isFullyAnswered,
  outstandingScopes,
} from '../../src/response/post.js';
import { ResponseError } from '../../src/response/codes.js';

const MARKED = {
  number: 'b240315000420',
  code: '2',
  at: '2024-03-16T09:40',
  by: 'locator-14',
  marksThrough: '2024-03-29',
};

describe('buildResponse', () => {
  it('builds a frozen posting', () => {
    const response = buildResponse(MARKED);
    expect(response.number).toBe('B240315000420');
    expect(response.key).toBe('MARKED');
    expect(response.scope).toBe('ALL');
    expect(Object.isFrozen(response)).toBe(true);
  });

  it('accepts the code by key', () => {
    expect(buildResponse({ ...MARKED, code: undefined, key: 'MARKED' }).code).toBe('2');
  });

  it('narrows the posting to one facility type', () => {
    expect(buildResponse({ ...MARKED, facilityType: 'gas' }).scope).toBe('GAS');
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildResponse(null)).toThrow(ResponseError);
  });

  it('rejects a missing ticket number or poster', () => {
    expect(() => buildResponse({ ...MARKED, number: '' })).toThrow(/number is required/);
    expect(() => buildResponse({ ...MARKED, by: '' })).toThrow(/by is required/);
  });

  it('rejects a bad timestamp', () => {
    expect(() => buildResponse({ ...MARKED, at: '2024-03-16' })).toThrow(/needs a timestamp/);
  });

  it('demands a marks date on a code that leaves paint on the ground', () => {
    expect(() => buildResponse({ ...MARKED, marksThrough: null })).toThrow(/how long the marks/);
  });

  it('rejects a marks date of the wrong shape', () => {
    expect(() => buildResponse({ ...MARKED, marksThrough: '03/29/2024' })).toThrow(/calendar date/);
  });

  it('does not ask for marks on a no facilities posting', () => {
    const clear = buildResponse({ ...MARKED, code: '1', marksThrough: null });
    expect(clear.marksThrough).toBeNull();
  });

  it('demands a time on a scheduled meet', () => {
    expect(() => buildResponse({ ...MARKED, code: '4', marksThrough: null })).toThrow(
      /time it was set for/
    );
    const meet = buildResponse({
      ...MARKED,
      code: '4',
      marksThrough: null,
      meetAt: '2024-03-18T08:00',
    });
    expect(meet.meetAt).toBe('2024-03-18T08:00');
  });

  it('rejects a meet time of the wrong shape', () => {
    expect(() => buildResponse({ ...MARKED, meetAt: '2024-03-18' })).toThrow(/meetAt must be/);
  });

  it('rejects an unknown facility type', () => {
    expect(() => buildResponse({ ...MARKED, facilityType: 'air' })).toThrow(
      /not one this operator/
    );
  });
});

describe('coversType', () => {
  it('lets a whole ticket posting cover everything', () => {
    expect(coversType(buildResponse(MARKED), 'gas')).toBe(true);
  });

  it('keeps a narrowed posting to its own type', () => {
    const gas = buildResponse({ ...MARKED, facilityType: 'gas' });
    expect(coversType(gas, 'GAS')).toBe(true);
    expect(coversType(gas, 'ELECTRIC')).toBe(false);
  });
});

describe('ordering and lookup', () => {
  const gas = buildResponse({ ...MARKED, facilityType: 'gas', at: '2024-03-16T09:40' });
  const electric = buildResponse({
    ...MARKED,
    facilityType: 'electric',
    at: '2024-03-16T11:15',
  });
  const early = buildResponse({ ...MARKED, facilityType: 'water', at: '2024-03-16T08:00' });

  it('sorts oldest first', () => {
    expect(sortResponses([electric, early, gas]).map((r) => r.scope)).toEqual([
      'WATER',
      'GAS',
      'ELECTRIC',
    ]);
  });

  it('leaves the list it was given alone', () => {
    const list = [electric, early];
    sortResponses(list);
    expect(list[0]).toBe(electric);
  });

  it('finds the latest posting overall', () => {
    expect(latestResponse([gas, early, electric]).scope).toBe('ELECTRIC');
    expect(latestResponse([])).toBeNull();
  });

  it('finds the latest posting for one type', () => {
    expect(latestResponse([gas, early, electric], { scope: 'GAS' }).scope).toBe('GAS');
  });

  it('lists the scopes covered', () => {
    expect(coveredScopes([gas, electric])).toEqual(['ELECTRIC', 'GAS']);
  });
});

describe('coverage', () => {
  const gas = buildResponse({ ...MARKED, facilityType: 'gas' });
  const electric = buildResponse({ ...MARKED, facilityType: 'electric' });

  it('counts a whole ticket posting as complete', () => {
    expect(isFullyAnswered([buildResponse(MARKED)], ['GAS', 'ELECTRIC'])).toBe(true);
    expect(outstandingScopes([buildResponse(MARKED)], ['GAS'])).toEqual([]);
  });

  it('needs one posting per type otherwise', () => {
    expect(isFullyAnswered([gas], ['GAS', 'ELECTRIC'])).toBe(false);
    expect(isFullyAnswered([gas, electric], ['GAS', 'ELECTRIC'])).toBe(true);
  });

  it('names what is still outstanding', () => {
    expect(outstandingScopes([gas], ['GAS', 'ELECTRIC', 'water'])).toEqual(['ELECTRIC', 'WATER']);
  });

  it('needs nothing when the screening found nothing', () => {
    expect(isFullyAnswered([], [])).toBe(true);
  });
});
