import { describe, expect, it } from 'vitest';
import {
  DamageError,
  EXCAVATION_METHODS,
  buildDamage,
  isReportable,
  wasUnticketed,
  describeDamage,
  sortDamages,
} from '../../src/damage/report.js';

const RAW = {
  id: 'dmg-2024-014',
  at: '2024-03-19T10:25',
  ticketNumber: 'B240315000420',
  facilityId: 'GM-1',
  facilityType: 'gas',
  point: { lat: 35.4676, lon: -97.5164 },
  excavator: 'Digwell Excavating',
  method: 'backhoe',
  depthFeet: 4,
  marksPresent: 'Y',
  marksAccurate: 'Y',
  ticketValid: 'Y',
  serviceInterrupted: 'Y',
  customersOut: 12,
  reportedBy: 'loc-14',
  narrative: 'bucket caught the service tee',
};

describe('buildDamage', () => {
  it('builds a frozen record', () => {
    const damage = buildDamage(RAW);
    expect(damage.id).toBe('DMG-2024-014');
    expect(damage.method).toBe('BACKHOE');
    expect(damage.facilityType).toBe('GAS');
    expect(Object.isFrozen(damage)).toBe(true);
  });

  it('defaults the flags and the counts', () => {
    const bare = buildDamage({
      id: 'd1',
      at: '2024-03-19T10:25',
      facilityType: 'water',
      reportedBy: 'loc-1',
    });
    expect(bare.method).toBe('OTHER');
    expect(bare.marksPresent).toBe(false);
    expect(bare.marksAccurate).toBeNull();
    expect(bare.customersOut).toBe(0);
    expect(bare.injury).toBe(false);
    expect(bare.point).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(() => buildDamage(null)).toThrow(DamageError);
  });

  it('rejects a missing id, reporter or timestamp', () => {
    expect(() => buildDamage({ ...RAW, id: '' })).toThrow(/id is required/);
    expect(() => buildDamage({ ...RAW, reportedBy: '' })).toThrow(/reportedBy is required/);
    expect(() => buildDamage({ ...RAW, at: '2024-03-19' })).toThrow(/needs a timestamp/);
  });

  it('rejects a method it does not record', () => {
    try {
      buildDamage({ ...RAW, method: 'dynamite' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.known).toEqual(EXCAVATION_METHODS);
    }
  });

  it('rejects an unknown facility type', () => {
    expect(() => buildDamage({ ...RAW, facilityType: 'air' })).toThrow(/not one this operator/);
  });

  it('refuses accurate marks where there were no marks', () => {
    expect(() => buildDamage({ ...RAW, marksPresent: 'N', marksAccurate: 'Y' })).toThrow(
      /cannot be accurate/
    );
  });

  it('allows inaccurate marks where there were none', () => {
    expect(buildDamage({ ...RAW, marksPresent: 'N', marksAccurate: 'N' }).marksAccurate).toBe(
      false
    );
  });
});

describe('isReportable', () => {
  it('reports any hit on a critical facility', () => {
    expect(isReportable(buildDamage(RAW))).toBe(true);
  });

  it('reports an injury or an ignition whatever was hit', () => {
    const water = { ...RAW, facilityType: 'water', serviceInterrupted: 'N', customersOut: 0 };
    expect(isReportable(buildDamage(water))).toBe(false);
    expect(isReportable(buildDamage({ ...water, injury: 'Y' }))).toBe(true);
    expect(isReportable(buildDamage({ ...water, ignition: 'Y' }))).toBe(true);
  });

  it('reports an outage on an ordinary facility', () => {
    const water = { ...RAW, facilityType: 'water', serviceInterrupted: 'Y', customersOut: 3 };
    expect(isReportable(buildDamage(water))).toBe(true);
  });

  it('does not report an outage with nobody off supply', () => {
    const water = { ...RAW, facilityType: 'water', serviceInterrupted: 'Y', customersOut: 0 };
    expect(isReportable(buildDamage(water))).toBe(false);
  });
});

describe('wasUnticketed', () => {
  it('is false for a hit with a valid ticket', () => {
    expect(wasUnticketed(buildDamage(RAW))).toBe(false);
  });

  it('is true with no ticket at all', () => {
    expect(wasUnticketed(buildDamage({ ...RAW, ticketNumber: null }))).toBe(true);
  });

  it('is true when the ticket was not valid', () => {
    expect(wasUnticketed(buildDamage({ ...RAW, ticketValid: 'N' }))).toBe(true);
  });
});

describe('reporting helpers', () => {
  it('describes a damage', () => {
    expect(describeDamage(buildDamage(RAW))).toBe(
      'DMG-2024-014 2024-03-19T10:25 GM-1 struck by backhoe'
    );
  });

  it('falls back to the facility type when there is no id', () => {
    expect(describeDamage(buildDamage({ ...RAW, facilityId: null }))).toContain('GAS struck by');
  });

  it('sorts oldest first', () => {
    const first = buildDamage({ ...RAW, id: 'd1', at: '2024-03-18T08:00' });
    const second = buildDamage({ ...RAW, id: 'd2' });
    expect(sortDamages([second, first]).map((d) => d.id)).toEqual(['D1', 'D2']);
  });
});
