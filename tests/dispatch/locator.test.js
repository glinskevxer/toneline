import { describe, expect, it } from 'vitest';
import {
  RosterError,
  buildLocator,
  buildRoster,
  hasSkill,
  coversDistrict,
  onShiftAt,
  qualifiedFor,
  locatorById,
} from '../../src/dispatch/locator.js';

const RAW = {
  id: 'loc-14',
  name: 'R Ochoa',
  skills: 'gas, electric',
  districts: ['central'],
  shift: { start: '06:30', end: '15:30' },
  dailyCapacity: 10,
};

describe('buildLocator', () => {
  it('builds a frozen record', () => {
    const locator = buildLocator(RAW);
    expect(locator.id).toBe('LOC-14');
    expect(locator.skills).toEqual(['GAS', 'ELECTRIC']);
    expect(locator.districts).toEqual(['CENTRAL']);
    expect(Object.isFrozen(locator)).toBe(true);
  });

  it('reads the shift as minutes of the day', () => {
    expect(buildLocator(RAW).shift).toEqual({ open: 390, close: 930 });
  });

  it('defaults the shift, the capacity and the flags', () => {
    const bare = buildLocator({ id: 'loc-2', skills: ['water'] });
    expect(bare.shift).toEqual({ open: 420, close: 1020 });
    expect(bare.dailyCapacity).toBe(12);
    expect(bare.active).toBe(true);
    expect(bare.onCall).toBe(false);
    expect(bare.name).toBe('LOC-2');
    expect(bare.districts).toEqual([]);
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildLocator(null)).toThrow(RosterError);
  });

  it('rejects a locator with no skills', () => {
    expect(() => buildLocator({ id: 'loc-3' })).toThrow(/at least one skill/);
  });

  it('rejects a skill that is not a facility type', () => {
    expect(() => buildLocator({ ...RAW, skills: ['gas', 'plumbing'] })).toThrow(
      /has to be a facility type/
    );
  });

  it('rejects a shift that ends before it starts', () => {
    expect(() => buildLocator({ ...RAW, shift: { start: '15:00', end: '06:00' } })).toThrow(
      /end after it starts/
    );
  });

  it('rejects a shift that is not an object', () => {
    expect(() => buildLocator({ ...RAW, shift: 'days' })).toThrow(/start and end/);
  });

  it('rejects a capacity below one', () => {
    expect(() => buildLocator({ ...RAW, dailyCapacity: 0 })).toThrow(/at least one ticket/);
    expect(() => buildLocator({ ...RAW, dailyCapacity: 1.5 })).toThrow(/whole number/);
  });

  it('accepts an inactive locator', () => {
    expect(buildLocator({ ...RAW, active: 'N' }).active).toBe(false);
  });
});

describe('buildRoster', () => {
  it('builds a list', () => {
    expect(buildRoster([RAW, { id: 'loc-2', skills: ['water'] }])).toHaveLength(2);
    expect(buildRoster()).toEqual([]);
  });

  it('refuses a repeated id', () => {
    expect(() => buildRoster([RAW, RAW])).toThrow(/share an id/);
  });

  it('looks a locator up in any case', () => {
    const roster = buildRoster([RAW]);
    expect(locatorById(roster, 'loc-14').name).toBe('R Ochoa');
    expect(locatorById(roster, 'loc-99')).toBeNull();
  });
});

describe('skills, districts and shifts', () => {
  const locator = buildLocator(RAW);

  it('answers the skill question', () => {
    expect(hasSkill(locator, 'gas')).toBe(true);
    expect(hasSkill(locator, 'WATER')).toBe(false);
  });

  it('answers the district question', () => {
    expect(coversDistrict(locator, 'CENTRAL')).toBe(true);
    expect(coversDistrict(locator, 'north')).toBe(false);
  });

  it('treats an empty district list as covering everywhere', () => {
    const anywhere = buildLocator({ id: 'loc-2', skills: ['gas'] });
    expect(coversDistrict(anywhere, 'anything')).toBe(true);
  });

  it('answers the shift question', () => {
    expect(onShiftAt(locator, 390)).toBe(true);
    expect(onShiftAt(locator, 929)).toBe(true);
    expect(onShiftAt(locator, 930)).toBe(false);
    expect(onShiftAt(locator, 389)).toBe(false);
  });
});

describe('qualifiedFor', () => {
  const roster = buildRoster([
    RAW,
    { id: 'loc-2', skills: ['gas'], districts: ['central'] },
    { id: 'loc-3', skills: ['gas', 'electric', 'water'] },
    { id: 'loc-4', skills: ['gas', 'electric'], districts: ['central'], active: 'N' },
  ]);

  it('needs every skill the ticket asks for', () => {
    expect(qualifiedFor(roster, ['GAS', 'ELECTRIC']).map((l) => l.id)).toEqual(['LOC-14', 'LOC-3']);
  });

  it('needs only one skill for a single type ticket', () => {
    expect(qualifiedFor(roster, ['GAS']).map((l) => l.id)).toEqual(['LOC-14', 'LOC-2', 'LOC-3']);
  });

  it('honours the district', () => {
    expect(qualifiedFor(roster, ['GAS'], 'north').map((l) => l.id)).toEqual(['LOC-3']);
  });

  it('leaves an inactive locator out', () => {
    expect(qualifiedFor(roster, ['GAS', 'ELECTRIC']).map((l) => l.id)).not.toContain('LOC-4');
  });

  it('finds everyone when nothing is asked for', () => {
    expect(qualifiedFor(roster, [])).toHaveLength(3);
  });
});
