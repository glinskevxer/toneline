import { describe, expect, it } from 'vitest';
import {
  RELATIONS,
  relationOf,
  familyOf,
  families,
  workingTicket,
  isCancelled,
  withSecondNotice,
} from '../../src/ticket/relate.js';
import { buildTicket } from '../../src/ticket/record.js';

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

const ORIGINAL = ticket();
const UPDATE = ticket({ number: 'B240315000420-01', type: 'UPDATE', takenAt: '2024-03-20T09:00' });
const SECOND = ticket({ number: 'B240315000420-02', type: 'SECOND', takenAt: '2024-03-21T09:00' });
const CANCEL = ticket({ number: 'B240315000420-03', type: 'CANCEL', takenAt: '2024-03-22T09:00' });
const OTHER = ticket({ number: 'B240315000421' });

describe('relationOf', () => {
  it('lists the relations it knows', () => {
    expect(RELATIONS).toContain('second notice');
    expect(RELATIONS).toHaveLength(6);
  });

  it('names each kind', () => {
    expect(relationOf(ORIGINAL)).toBe('original');
    expect(relationOf(UPDATE)).toBe('update');
    expect(relationOf(SECOND)).toBe('second notice');
    expect(relationOf(CANCEL)).toBe('cancellation');
    expect(relationOf(ticket({ type: 'DAMAGE' }))).toBe('damage notification');
  });

  it('treats a revision of an ordinary ticket as an update', () => {
    expect(relationOf(ticket({ number: 'B240315000420-01' }))).toBe('update');
  });
});

describe('familyOf', () => {
  const held = [OTHER, UPDATE, ORIGINAL, SECOND];

  it('gathers only the family asked for, oldest first', () => {
    const family = familyOf(held, 'B240315000420-02');
    expect(family.members).toEqual(['B240315000420', 'B240315000420-01', 'B240315000420-02']);
  });

  it('names the original and the current', () => {
    const family = familyOf(held, 'B240315000420');
    expect(family.original).toBe('B240315000420');
    expect(family.current).toBe('B240315000420-02');
  });

  it('counts the updates and flags the rest', () => {
    const family = familyOf(held, 'B240315000420');
    expect(family.updates).toBe(1);
    expect(family.hasSecondNotice).toBe(true);
    expect(family.hasDamage).toBe(false);
    expect(family.cancelled).toBe(false);
  });

  it('marks a cancelled family', () => {
    expect(familyOf([...held, CANCEL], 'B240315000420').cancelled).toBe(true);
  });

  it('gathers an empty family for a base it does not hold', () => {
    const family = familyOf(held, 'B240315000999');
    expect(family.members).toEqual([]);
    expect(family.original).toBeNull();
    expect(family.current).toBeNull();
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(familyOf(held, 'B240315000420'))).toBe(true);
  });
});

describe('families', () => {
  it('groups everything by base number', () => {
    const grouped = families([OTHER, UPDATE, ORIGINAL]);
    expect(grouped.map((family) => family.base)).toEqual(['B240315000420', 'B240315000421']);
  });

  it('groups nothing from nothing', () => {
    expect(families([])).toEqual([]);
  });
});

describe('workingTicket', () => {
  it('takes the latest transmission', () => {
    expect(workingTicket([ORIGINAL, UPDATE], 'B240315000420').number).toBe('B240315000420-01');
  });

  it('lets a cancellation end the family', () => {
    const later = ticket({
      number: 'B240315000420-04',
      type: 'UPDATE',
      takenAt: '2024-03-23T09:00',
    });
    expect(workingTicket([ORIGINAL, UPDATE, CANCEL, later], 'B240315000420').number).toBe(
      'B240315000420-03'
    );
  });

  it('has nothing to work on for an unknown family', () => {
    expect(workingTicket([ORIGINAL], 'B240315000999')).toBeNull();
  });

  it('answers the cancelled question', () => {
    expect(isCancelled([ORIGINAL, UPDATE], 'B240315000420')).toBe(false);
    expect(isCancelled([ORIGINAL, CANCEL], 'B240315000420')).toBe(true);
    expect(isCancelled([ORIGINAL], 'B240315000999')).toBe(false);
  });
});

describe('withSecondNotice', () => {
  it('finds the families the desk was late on', () => {
    const found = withSecondNotice([ORIGINAL, UPDATE, SECOND, OTHER]);
    expect(found.map((family) => family.base)).toEqual(['B240315000420']);
  });

  it('finds nothing when nobody chased', () => {
    expect(withSecondNotice([ORIGINAL, OTHER])).toEqual([]);
  });
});
