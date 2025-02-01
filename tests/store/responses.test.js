import { describe, expect, it } from 'vitest';
import { ResponseStore, buildResponseStore } from '../../src/store/responses.js';
import { buildResponse } from '../../src/response/post.js';
import { amendResponse } from '../../src/response/amend.js';

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

describe('ResponseStore', () => {
  it('counts what it holds', () => {
    const store = buildResponseStore([posting(), posting({ number: 'B240315000421' })]);
    expect(store.size).toBe(2);
    expect(new ResponseStore().size).toBe(0);
    expect(buildResponseStore().size).toBe(0);
  });

  it('accepts a loose record and an already built posting', () => {
    const store = new ResponseStore();
    const built = posting();
    expect(store.put(built)).toBe(built);
    expect(store.put({ ...built, at: '2024-03-16T10:00' }).at).toBe('2024-03-16T10:00');
    expect(store.size).toBe(2);
  });

  it('adds many at once', () => {
    expect(new ResponseStore().putAll([posting(), posting()])).toHaveLength(2);
  });

  it('finds postings by ticket in any case', () => {
    const store = buildResponseStore([posting(), posting({ number: 'B240315000421' })]);
    expect(store.forTicket('b240315000420')).toHaveLength(1);
    expect(store.forTicket('B240315000999')).toEqual([]);
  });

  it('finds postings by day', () => {
    const store = buildResponseStore([
      posting(),
      posting({ at: '2024-03-17T09:00', number: 'B240315000421' }),
    ]);
    expect(store.onDay('2024-03-16')).toHaveLength(1);
    expect(store.onDay('2024-03-18')).toEqual([]);
    expect(store.days()).toEqual(['2024-03-16', '2024-03-17']);
  });

  it('sorts what it hands back', () => {
    const store = buildResponseStore([
      posting({ at: '2024-03-16T11:00', facilityType: 'water' }),
      posting({ facilityType: 'gas' }),
    ]);
    expect(store.forTicket('B240315000420').map((entry) => entry.scope)).toEqual(['GAS', 'WATER']);
  });

  it('lists the tickets it knows about', () => {
    const store = buildResponseStore([posting(), posting({ number: 'B240315000421' })]);
    expect(store.tickets()).toEqual(['B240315000420', 'B240315000421']);
  });
});

describe('standing answers', () => {
  const original = posting();
  const fixed = amendResponse(
    original,
    { code: '7' },
    {
      at: '2024-03-16T11:00',
      by: 'kmartel',
      reason: 'critical main found',
    }
  );

  it('keeps the superseded posting but leaves it out of the standing set', () => {
    const store = buildResponseStore([original, fixed]);
    expect(store.forTicket('B240315000420')).toHaveLength(2);
    expect(store.standingFor('B240315000420')).toHaveLength(1);
  });

  it('answers with the posting that still stands', () => {
    const store = buildResponseStore([original, fixed]);
    expect(store.answerFor('B240315000420').code).toBe('7');
  });

  it('narrows the answer to one facility type', () => {
    const gas = posting({ facilityType: 'gas' });
    const water = posting({ facilityType: 'water', at: '2024-03-16T10:00' });
    const store = buildResponseStore([gas, water]);
    expect(store.answerFor('B240315000420', 'GAS').scope).toBe('GAS');
  });

  it('has no answer for a ticket nothing was posted against', () => {
    expect(buildResponseStore([]).answerFor('B240315000420')).toBeNull();
    expect(buildResponseStore([]).hasAnswered('B240315000420')).toBe(false);
    expect(buildResponseStore([original]).hasAnswered('B240315000420')).toBe(true);
  });
});

describe('views over the store', () => {
  const store = buildResponseStore([
    posting(),
    posting({ number: 'B240315000421', code: '1', marksThrough: null }),
    posting({ number: 'B240315000422', code: '1', marksThrough: null, at: '2024-03-15T09:00' }),
  ]);

  it('sorts everything oldest first', () => {
    expect(store.all().map((entry) => entry.number)).toEqual([
      'B240315000422',
      'B240315000420',
      'B240315000421',
    ]);
  });

  it('counts the codes', () => {
    expect(store.codeCounts()).toEqual({ 1: 2, 2: 1 });
  });

  it('renders itself for writing out', () => {
    expect(store.toJSON()).toHaveLength(3);
  });
});
