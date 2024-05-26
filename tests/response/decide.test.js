import { describe, expect, it } from 'vitest';
import {
  recommendResponse,
  recommendByScope,
  needsAnotherVisit,
  describeRecommendation,
} from '../../src/response/decide.js';
import { buildTicket } from '../../src/ticket/record.js';

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T07:42',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

function screening(overrides = {}) {
  return {
    number: 'B240315000420',
    workArea: { source: 'point', radiusFeet: 50 },
    districts: ['CENTRAL'],
    memberClaimed: true,
    ours: true,
    hits: [],
    conflict: false,
    critical: false,
    clearReason: 'no facilities',
    ...overrides,
  };
}

function hit(overrides = {}) {
  return {
    facilityId: 'GM-1',
    type: 'GAS',
    district: 'CENTRAL',
    metres: 2,
    feet: 6.5,
    toleranceFeet: 18,
    insideTolerance: true,
    abandoned: false,
    critical: true,
    ...overrides,
  };
}

describe('recommendResponse', () => {
  it('says a ticket outside our districts is not ours', () => {
    const result = recommendResponse(ticket(), screening({ ours: false }));
    expect(result.code).toBe('9');
    expect(result.reason).toMatch(/outside every district/);
  });

  it('sends a locator out when there is no geometry', () => {
    const result = recommendResponse(
      ticket(),
      screening({ workArea: { source: 'none', radiusFeet: null } })
    );
    expect(result.code).toBe('6');
  });

  it('clears a site with nothing near it', () => {
    expect(recommendResponse(ticket(), screening()).code).toBe('1');
  });

  it('clears a site with only abandoned plant', () => {
    const result = recommendResponse(
      ticket(),
      screening({ hits: [hit({ abandoned: true, critical: false })] })
    );
    expect(result.code).toBe('8');
  });

  it('clears a site whose facilities are all outside the tolerance zone', () => {
    const result = recommendResponse(
      ticket(),
      screening({ hits: [hit({ insideTolerance: false })] })
    );
    expect(result.code).toBe('1');
    expect(result.reason).toMatch(/none reach the work area/);
  });

  it('asks for a meet on a critical facility', () => {
    const result = recommendResponse(ticket(), screening({ hits: [hit()] }));
    expect(result.code).toBe('7');
  });

  it('marks an ordinary conflict', () => {
    const result = recommendResponse(
      ticket(),
      screening({ hits: [hit({ type: 'WATER', critical: false })] })
    );
    expect(result.code).toBe('2');
  });

  it('can be told not to ask for a meet', () => {
    const result = recommendResponse(ticket(), screening({ hits: [hit()] }), {
      meetOnCritical: false,
    });
    expect(result.code).toBe('2');
  });

  it('answers a meet request with a meet', () => {
    const result = recommendResponse(ticket({ type: 'MEET' }), screening({ hits: [hit()] }));
    expect(result.code).toBe('4');
  });

  it('does not mark for a design request', () => {
    const result = recommendResponse(
      ticket({ type: 'DESIGN' }),
      screening({ hits: [hit({ critical: false })] })
    );
    expect(result.code).toBe('1');
    expect(result.reason).toMatch(/does not call for marks/);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(recommendResponse(ticket(), screening()))).toBe(true);
  });
});

describe('recommendByScope', () => {
  it('gives one answer per facility type', () => {
    const result = recommendByScope(
      ticket(),
      screening({
        hits: [
          hit({ type: 'GAS' }),
          hit({ type: 'WATER', critical: false, insideTolerance: false }),
        ],
      })
    );
    expect(result.map((entry) => entry.scope)).toEqual(['GAS', 'WATER']);
    expect(result[0].code).toBe('7');
    expect(result[1].code).toBe('1');
  });

  it('marks one type and clears another', () => {
    const result = recommendByScope(
      ticket(),
      screening({
        hits: [
          hit({ type: 'WATER', critical: false }),
          hit({ type: 'CATV', critical: false, abandoned: true }),
        ],
      })
    );
    expect(result.find((entry) => entry.scope === 'WATER').code).toBe('2');
    expect(result.find((entry) => entry.scope === 'CATV').code).toBe('8');
  });

  it('falls back to one whole ticket answer when there is nothing to split', () => {
    expect(recommendByScope(ticket(), screening())).toHaveLength(1);
    expect(recommendByScope(ticket(), screening({ ours: false }))[0].code).toBe('9');
    expect(
      recommendByScope(ticket(), screening({ workArea: { source: 'none', radiusFeet: null } }))
    ).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('says when somebody has to go back', () => {
    expect(needsAnotherVisit({ code: '7' })).toBe(true);
    expect(needsAnotherVisit({ code: '2' })).toBe(false);
  });

  it('describes a recommendation in one line', () => {
    const result = recommendResponse(ticket(), screening());
    expect(describeRecommendation(result)).toBe(
      'ALL 1 no facilities in the work area: nothing of ours is near the work area'
    );
  });
});
