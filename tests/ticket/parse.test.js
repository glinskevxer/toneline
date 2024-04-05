import { describe, expect, it } from 'vitest';
import {
  parseGrids,
  transmissionToRecord,
  parseTicket,
  parseTicketBatch,
} from '../../src/ticket/parse.js';
import { parseTransmission } from '../../src/io/transmission.js';
import { FeedParseError } from '../../src/core/errors.js';

const BLOCK = [
  'TICKET NUMBER: B240315000420',
  'TRANSMISSION: NORMAL',
  'TAKEN: 03/15/2024 07:42',
  'LAWFUL START: 03/19/2024 07:42',
  'EXPIRES: 04/08/2024',
  'STATE: OK  COUNTY: OKLAHOMA  PLACE: OKLAHOMA CITY',
  'ADDRESS: 1420 NW 23RD ST',
  'INTERSECTION: N WALKER AVE',
  'WORK TYPE: SEWER LATERAL REPAIR',
  'DONE FOR: CITY OF OKLAHOMA CITY',
  'EXCAVATOR: DIGWELL EXCAVATING',
  '  CONTACT: R MASSEY  PHONE: 405-555-0148',
  '  EMAIL: rm@digwell.example',
  'EXTENT: THE NORTH SIDE OF THE STREET FROM THE',
  '  DRIVEWAY EAST 120 FEET',
  'BORING: Y  BLASTING: N  DEPTH: 6 FT',
  'WHITE LINED: Y',
  'MEMBERS: OKGAS01 OKELEC02 CITYWTR',
  'GRIDS: 35.4676,-97.5164 35.4680,-97.5150',
  'REMARKS: CALL BEFORE ARRIVAL',
].join('\n');

describe('parseGrids', () => {
  it('reads a run of coordinate pairs', () => {
    expect(parseGrids('35.4676,-97.5164 35.4680,-97.5150')).toEqual([
      { lat: 35.4676, lon: -97.5164 },
      { lat: 35.468, lon: -97.515 },
    ]);
  });

  it('accepts a semicolon between the numbers', () => {
    expect(parseGrids('35.4676;-97.5164')).toHaveLength(1);
  });

  it('returns nothing for an empty field', () => {
    expect(parseGrids(null)).toEqual([]);
    expect(parseGrids('  ')).toEqual([]);
  });

  it('rejects a token that is not a pair', () => {
    expect(() => parseGrids('35.4676')).toThrow(FeedParseError);
    expect(() => parseGrids('north,west')).toThrow(/latitude and longitude/);
  });
});

describe('transmissionToRecord', () => {
  const record = transmissionToRecord(parseTransmission(BLOCK));

  it('maps the plain labels', () => {
    expect(record.number).toBe('B240315000420');
    expect(record.type).toBe('NORMAL');
    expect(record.place).toBe('OKLAHOMA CITY');
    expect(record.workType).toBe('SEWER LATERAL REPAIR');
  });

  it('converts the centre timestamps', () => {
    expect(record.takenAt).toBe('2024-03-15T07:42');
    expect(record.lawfulStartAt).toBe('2024-03-19T07:42');
    expect(record.expiresOn).toBe('2024-04-08');
  });

  it('gathers the excavator block', () => {
    expect(record.excavator).toEqual({
      company: 'DIGWELL EXCAVATING',
      contact: 'R MASSEY',
      phone: '405-555-0148',
      email: 'rm@digwell.example',
    });
  });

  it('joins the continued extent', () => {
    expect(record.extent).toMatch(/DRIVEWAY EAST 120 FEET$/);
  });

  it('reads the flags and the depth', () => {
    expect(record.boring).toBe(true);
    expect(record.blasting).toBe(false);
    expect(record.whiteLined).toBe(true);
    expect(record.depthFeet).toBe(6);
  });

  it('reads a depth given in inches', () => {
    const inches = transmissionToRecord(
      parseTransmission(
        'TICKET NUMBER: B240315000420\nTRANSMISSION: NORMAL\nTAKEN: 03/15/2024 07:42\nADDRESS: X\nDEPTH: 30 INCHES'
      )
    );
    expect(inches.depthFeet).toBeCloseTo(2.5, 6);
  });

  it('rejects a depth with no number in it', () => {
    expect(() =>
      transmissionToRecord(
        parseTransmission(
          'TICKET NUMBER: B1\nTRANSMISSION: NORMAL\nTAKEN: 03/15/2024\nDEPTH: SHALLOW'
        )
      )
    ).toThrow(/depth does not carry a number/);
  });

  it('carries the drawn site through', () => {
    expect(record.site.points).toHaveLength(2);
  });

  it('leaves the site null when no grids were sent', () => {
    const bare = transmissionToRecord(
      parseTransmission('TICKET NUMBER: B1\nTRANSMISSION: NORMAL\nTAKEN: 03/15/2024\nADDRESS: X')
    );
    expect(bare.site).toBeNull();
    expect(bare.excavator).toBeUndefined();
  });

  it('demands the fields a ticket cannot do without', () => {
    expect(() => transmissionToRecord(parseTransmission('TRANSMISSION: NORMAL'))).toThrow(
      /missing a required field/
    );
  });
});

describe('parseTicket', () => {
  it('builds a ticket straight from a block', () => {
    const ticket = parseTicket(BLOCK);
    expect(ticket.number).toBe('B240315000420');
    expect(ticket.members).toEqual(['OKGAS01', 'OKELEC02', 'CITYWTR']);
    expect(Object.isFrozen(ticket)).toBe(true);
  });
});

describe('parseTicketBatch', () => {
  const batch = [BLOCK, '=========', BLOCK.replace('000420', '000421')].join('\n');

  it('reads every block', () => {
    const result = parseTicketBatch(batch);
    expect(result.tickets).toHaveLength(2);
    expect(result.failures).toEqual([]);
  });

  it('throws on a bad block by default', () => {
    expect(() => parseTicketBatch(`${batch}\n====\nTRANSMISSION: NORMAL`)).toThrow(FeedParseError);
  });

  it('collects failures when asked to', () => {
    const result = parseTicketBatch(`${batch}\n====\nTRANSMISSION: NORMAL`, { skipBad: true });
    expect(result.tickets).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].block).toBe(3);
  });

  it('reads an empty file as nothing', () => {
    expect(parseTicketBatch('')).toEqual({ tickets: [], failures: [] });
  });
});
