import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDamagePoint,
  rowToDamage,
  readDamageCsv,
  writeDamageCsv,
} from '../../src/io/damages.js';
import { readText } from '../../src/io/files.js';
import { FeedParseError } from '../../src/core/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');

describe('parseDamagePoint', () => {
  it('reads a pair', () => {
    expect(parseDamagePoint('35.4676 -97.5148')).toEqual({ lat: 35.4676, lon: -97.5148 });
    expect(parseDamagePoint('35.4676,-97.5148')).toEqual({ lat: 35.4676, lon: -97.5148 });
  });

  it('reads an empty column as nothing', () => {
    expect(parseDamagePoint('')).toBeNull();
    expect(parseDamagePoint(null)).toBeNull();
    expect(parseDamagePoint(undefined)).toBeNull();
  });

  it('rejects anything else', () => {
    expect(() => parseDamagePoint('by the fence')).toThrow(FeedParseError);
  });
});

describe('rowToDamage', () => {
  it('reads the operator column names', () => {
    const damage = rowToDamage({
      id: 'dmg-1',
      at: '03/19/2024 10:25',
      ticket: 'B240315000420',
      facility: 'GM-1',
      type: 'gas',
      method: 'backhoe',
      marks_present: 'Y',
      marks_accurate: 'Y',
      ticket_valid: 'Y',
      customers_out: '12',
      reported_by: 'loc-14',
    });
    expect(damage.id).toBe('DMG-1');
    expect(damage.at).toBe('2024-03-19T10:25');
    expect(damage.customersOut).toBe(12);
    expect(damage.marksAccurate).toBe(true);
  });

  it('reads the alternative column names', () => {
    const damage = rowToDamage({
      damage_id: 'dmg-2',
      occurred: '03/19/2024 10:25',
      facility_type: 'water',
      reported_by: 'loc-9',
    });
    expect(damage.id).toBe('DMG-2');
    expect(damage.facilityType).toBe('WATER');
  });

  it('turns an empty column into nothing rather than an empty string', () => {
    const damage = rowToDamage({
      id: 'dmg-3',
      at: '03/19/2024 10:25',
      ticket: '',
      facility: '  ',
      type: 'gas',
      marks_accurate: '',
      reported_by: 'loc-9',
    });
    expect(damage.ticketNumber).toBeNull();
    expect(damage.facilityId).toBeNull();
    expect(damage.marksAccurate).toBeNull();
  });

  it('rejects a row with no reporter', () => {
    expect(() => rowToDamage({ id: 'dmg-4', at: '03/19/2024 10:25', type: 'gas' })).toThrow(
      /reportedBy is required/
    );
  });
});

describe('readDamageCsv', () => {
  const text = readText(join(examples, 'damages-2024.csv'));

  it('reads the worked extract', () => {
    const { damages, failures } = readDamageCsv(text);
    expect(damages.map((damage) => damage.id)).toEqual([
      'DMG-2024-011',
      'DMG-2024-012',
      'DMG-2024-013',
    ]);
    expect(failures).toEqual([]);
  });

  it('reads the flags and the coordinates', () => {
    const [first, second] = readDamageCsv(text).damages;
    expect(first.serviceInterrupted).toBe(true);
    expect(first.point.lat).toBeCloseTo(35.4676, 6);
    expect(second.ticketNumber).toBeNull();
    expect(second.marksPresent).toBe(false);
  });

  it('names the row it could not read', () => {
    const bad = `${text}\nBAD,not a date,,,gas,,,,,,,,,,,,loc-1,`;
    try {
      readDamageCsv(bad);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details.row).toBe(5);
    }
  });

  it('collects failures when asked', () => {
    const bad = `${text}\nBAD,not a date,,,gas,,,,,,,,,,,,loc-1,`;
    const { damages, failures } = readDamageCsv(bad, { skipBad: true });
    expect(damages).toHaveLength(3);
    expect(failures).toHaveLength(1);
  });

  it('reads an empty extract as nothing', () => {
    expect(readDamageCsv('')).toEqual({ damages: [], failures: [] });
  });
});

describe('writeDamageCsv', () => {
  it('round trips through readDamageCsv', () => {
    const { damages } = readDamageCsv(readText(join(examples, 'damages-2024.csv')));
    const again = readDamageCsv(writeDamageCsv(damages)).damages;
    expect(again).toEqual(damages);
  });

  it('writes a header with no rows', () => {
    expect(writeDamageCsv([]).split('\n')[0]).toContain('id,at,ticket');
  });
});

describe('the timestamp column', () => {
  it('writes the centre format the reader expects back', () => {
    const { damages } = readDamageCsv(readText(join(examples, 'damages-2024.csv')));
    const text = writeDamageCsv(damages);
    expect(text.split('\n')[1]).toContain('03/19/2024 10:25');
  });
});
