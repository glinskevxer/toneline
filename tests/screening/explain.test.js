import { describe, expect, it } from 'vitest';
import {
  explainWorkArea,
  explainOwnership,
  explainHits,
  explainVerdict,
  explainScreening,
  explanationText,
  explanationDetail,
} from '../../src/screening/explain.js';

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
    metres: 2,
    feet: 6.56,
    toleranceFeet: 18,
    insideTolerance: true,
    abandoned: false,
    critical: true,
    ...overrides,
  };
}

describe('explainWorkArea', () => {
  it('describes each way an area can be arrived at', () => {
    expect(explainWorkArea(screening({ workArea: { source: 'drawn', radiusFeet: null } }))).toMatch(
      /drew the work area/
    );
    expect(
      explainWorkArea(screening({ workArea: { source: 'corridor', radiusFeet: 25 } }))
    ).toMatch(/corridor 25 feet either side/);
    expect(explainWorkArea(screening({ workArea: { source: 'extent', radiusFeet: 120 } }))).toMatch(
      /120 feet in the extent/
    );
    expect(explainWorkArea(screening())).toMatch(/standing 50 foot radius/);
    expect(explainWorkArea(screening({ workArea: { source: 'none', radiusFeet: null } }))).toMatch(
      /no geometry at all/
    );
  });
});

describe('explainOwnership', () => {
  it('names the districts', () => {
    expect(explainOwnership(screening())).toBe('the work area falls in CENTRAL');
    expect(explainOwnership(screening({ districts: ['CENTRAL', 'NORTH'] }))).toBe(
      'the work area falls in CENTRAL and NORTH'
    );
  });

  it('says when the ticket is not ours', () => {
    expect(explainOwnership(screening({ ours: false }))).toMatch(/outside every district/);
  });

  it('falls back to the member code', () => {
    expect(explainOwnership(screening({ districts: [] }))).toMatch(/routed the ticket/);
  });

  it('says when no districts are configured at all', () => {
    expect(explainOwnership(screening({ districts: [], memberClaimed: false }))).toMatch(
      /no districts are configured/
    );
  });
});

describe('explainHits', () => {
  it('writes one line per facility', () => {
    const lines = explainHits(
      screening({ hits: [hit(), hit({ facilityId: 'WT-1', type: 'WATER' })] })
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('GM-1 is a natural gas 6.6 feet away, inside its 18 foot tolerance zone');
  });

  it('marks a facility outside its tolerance zone', () => {
    expect(explainHits(screening({ hits: [hit({ insideTolerance: false })] }))[0]).toMatch(
      /outside its 18 foot tolerance zone/
    );
  });

  it('marks an abandoned facility', () => {
    expect(explainHits(screening({ hits: [hit({ abandoned: true })] }))[0]).toMatch(
      /an abandoned natural gas/
    );
  });

  it('writes nothing when nothing was found', () => {
    expect(explainHits(screening())).toEqual([]);
  });
});

describe('explainVerdict', () => {
  it('uses the recommendation when there is one', () => {
    expect(
      explainVerdict(screening(), { code: '2', reason: 'our facilities have been marked' })
    ).toBe('answered 2, facilities marked, because our facilities have been marked');
  });

  it('falls back to the screening', () => {
    expect(explainVerdict(screening({ conflict: true }))).toMatch(/reaches into the work area/);
    expect(explainVerdict(screening())).toBe('cleared: no facilities');
    expect(explainVerdict(screening({ clearReason: null }))).toBe('no verdict was reached');
  });
});

describe('explainScreening', () => {
  it('walks the questions in order', () => {
    const lines = explainScreening(screening({ hits: [hit()], conflict: true, clearReason: null }));
    expect(lines[0]).toBe('ticket B240315000420');
    expect(lines[1]).toMatch(/radius/);
    expect(lines[2]).toMatch(/CENTRAL/);
    expect(lines[3]).toMatch(/GM-1/);
    expect(lines[4]).toMatch(/reaches into the work area/);
  });

  it('says plainly when nothing was found', () => {
    expect(explainScreening(screening())).toContain('nothing of ours was found near the work area');
  });

  it('renders as one block of text', () => {
    const text = explanationText(screening());
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n')).toHaveLength(6);
  });
});

describe('explanationDetail', () => {
  it('counts the live facilities and gives the verdict', () => {
    const detail = explanationDetail(
      screening({ hits: [hit(), hit({ facilityId: 'WT-9', abandoned: true })], conflict: true }),
      { code: '7', reason: 'a critical facility runs through the work area' }
    );
    expect(detail).toMatch(/^1 live facilities/);
    expect(detail).toMatch(/answered 7/);
  });
});
