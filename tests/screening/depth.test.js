import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEPTH_POLICY,
  depthPolicy,
  compareDepth,
  withDepth,
  depthConflicts,
  clearsOnDepth,
} from '../../src/screening/depth.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildFacility } from '../../src/network/facility.js';

const A = { lat: 35.4676, lon: -97.5164 };
const B = { lat: 35.4676, lon: -97.5144 };

function ticket(overrides = {}) {
  return buildTicket({
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: '1420 NW 23RD ST',
    ...overrides,
  });
}

function facility(depthFeet) {
  return buildFacility({ id: 'GM-1', type: 'gas', path: [A, B], depthFeet });
}

function hit(overrides = {}) {
  return { facilityId: 'GM-1', insideTolerance: true, abandoned: false, ...overrides };
}

describe('depthPolicy', () => {
  it('ships defaults and merges', () => {
    expect(DEFAULT_DEPTH_POLICY.assumeDigFeet).toBe(5);
    expect(depthPolicy({ assumeDigFeet: 8 }).digToleranceFeet).toBe(1);
  });
});

describe('compareDepth on an open cut', () => {
  it('clears a shallow cut over a deep main', () => {
    const result = compareDepth({ digFeet: 2, boring: false, facilityFeet: 8 });
    expect(result.verdict).toBe('clear');
    expect(result.reason).toBe('the cut stays above the facility');
  });

  it('finds a conflict when the cut reaches the main', () => {
    expect(compareDepth({ digFeet: 6, boring: false, facilityFeet: 8 }).verdict).toBe('conflict');
  });

  it('errs towards a conflict inside the tolerances', () => {
    expect(compareDepth({ digFeet: 4, boring: false, facilityFeet: 7 }).verdict).toBe('conflict');
    expect(compareDepth({ digFeet: 3, boring: false, facilityFeet: 7 }).verdict).toBe('clear');
  });

  it('assumes a depth when the ticket gives none and says so', () => {
    const result = compareDepth({ digFeet: null, boring: false, facilityFeet: 9 });
    expect(result.verdict).toBe('clear');
    expect(result.reason).toMatch(/no depth was given/);
    expect(compareDepth({ digFeet: null, boring: false, facilityFeet: 6 }).verdict).toBe(
      'conflict'
    );
  });

  it('cannot judge a facility with no recorded depth', () => {
    const result = compareDepth({ digFeet: 2, boring: false, facilityFeet: null });
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/no recorded depth/);
  });
});

describe('compareDepth on a bore', () => {
  it('clears a bore well under the main', () => {
    const result = compareDepth({ digFeet: 12, boring: true, facilityFeet: 4 });
    expect(result.verdict).toBe('clear');
    expect(result.reason).toBe('the bore passes below the facility');
  });

  it('clears a bore well over a deep main', () => {
    expect(compareDepth({ digFeet: 3, boring: true, facilityFeet: 12 }).reason).toBe(
      'the bore passes above the facility'
    );
  });

  it('finds a conflict when the bore runs at the same depth', () => {
    expect(compareDepth({ digFeet: 5, boring: true, facilityFeet: 4 }).verdict).toBe('conflict');
  });

  it('honours a wider separation rule', () => {
    const policy = depthPolicy({ clearBoreSeparationFeet: 10 });
    expect(compareDepth({ digFeet: 16, boring: true, facilityFeet: 4, policy }).verdict).toBe(
      'clear'
    );
    expect(compareDepth({ digFeet: 10, boring: true, facilityFeet: 4, policy }).verdict).toBe(
      'conflict'
    );
  });
});

describe('withDepth', () => {
  it('adds the verdict to a hit without dropping it', () => {
    const result = withDepth(hit(), ticket({ depthFeet: 2 }), facility(9));
    expect(result.facilityId).toBe('GM-1');
    expect(result.depthVerdict).toBe('clear');
    expect(result.depthReason).toBeDefined();
  });

  it('reads the boring flag off the ticket', () => {
    const bore = ticket({ boring: true, depthFeet: 14 });
    expect(withDepth(hit(), bore, facility(4)).depthVerdict).toBe('clear');
    expect(withDepth(hit(), ticket({ depthFeet: 14 }), facility(4)).depthVerdict).toBe('conflict');
  });

  it('passes a policy through', () => {
    const policy = depthPolicy({ facilityToleranceFeet: 6 });
    expect(withDepth(hit(), ticket({ depthFeet: 2 }), facility(9), { policy }).depthVerdict).toBe(
      'conflict'
    );
  });
});

describe('depthConflicts and clearsOnDepth', () => {
  it('keeps the hits that are genuinely in the way', () => {
    const hits = [
      hit({ facilityId: 'GM-1', depthVerdict: 'conflict' }),
      hit({ facilityId: 'WT-1', depthVerdict: 'clear' }),
      hit({ facilityId: 'EL-1', depthVerdict: 'unknown' }),
      hit({ facilityId: 'CV-9', depthVerdict: 'conflict', abandoned: true }),
      hit({ facilityId: 'GM-2', depthVerdict: 'conflict', insideTolerance: false }),
    ];
    expect(depthConflicts(hits).map((entry) => entry.facilityId)).toEqual(['GM-1', 'EL-1']);
  });

  it('says when everything in the zone clears on depth', () => {
    expect(clearsOnDepth([hit({ depthVerdict: 'clear' })])).toBe(true);
    expect(clearsOnDepth([hit({ depthVerdict: 'clear' }), hit({ depthVerdict: 'conflict' })])).toBe(
      false
    );
  });

  it('says nothing about a screening with nothing in the zone', () => {
    expect(clearsOnDepth([])).toBe(false);
    expect(clearsOnDepth([hit({ insideTolerance: false, depthVerdict: 'clear' })])).toBe(false);
  });
});
