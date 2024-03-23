import { describe, expect, it } from 'vitest';
import {
  splitTransmissions,
  parseTransmission,
  scanLabels,
  field,
  requiredField,
  listField,
  flagField,
} from '../../src/io/transmission.js';
import { FeedParseError } from '../../src/core/errors.js';

const BLOCK = [
  'TICKET NUMBER: B240315000420',
  'TRANSMISSION: NORMAL',
  'TAKEN: 03/15/2024 07:42',
  'STATE: OK  COUNTY: OKLAHOMA  PLACE: OKLAHOMA CITY',
  'ADDRESS: 1420 NW 23RD ST',
  'EXTENT: THE NORTH SIDE OF THE STREET FROM THE',
  '  DRIVEWAY EAST 120 FEET',
  'BORING: Y  WHITE LINED: N',
  'MEMBERS: OKGAS01 OKELEC02 CITYWTR',
].join('\n');

describe('splitTransmissions', () => {
  it('splits on a rule of equals signs', () => {
    const batch = ['TICKET NUMBER: A1', '=======', 'TICKET NUMBER: A2', '======='].join('\n');
    expect(splitTransmissions(batch)).toHaveLength(2);
  });

  it('keeps a trailing block with no rule after it', () => {
    expect(splitTransmissions('TICKET NUMBER: A1\n====\nTICKET NUMBER: A2')).toHaveLength(2);
  });

  it('drops empty stretches between rules', () => {
    expect(splitTransmissions('====\n\n\n====\nTICKET NUMBER: A1')).toHaveLength(1);
  });

  it('returns nothing for empty text', () => {
    expect(splitTransmissions('')).toEqual([]);
  });

  it('rejects a non string', () => {
    expect(() => splitTransmissions(null)).toThrow(FeedParseError);
  });
});

describe('parseTransmission', () => {
  const parsed = parseTransmission(BLOCK);

  it('reads one pair per line', () => {
    expect(parsed.fields['TICKET NUMBER']).toBe('B240315000420');
    expect(parsed.fields.TRANSMISSION).toBe('NORMAL');
  });

  it('reads several pairs on one line', () => {
    expect(parsed.fields.STATE).toBe('OK');
    expect(parsed.fields.COUNTY).toBe('OKLAHOMA');
    expect(parsed.fields.PLACE).toBe('OKLAHOMA CITY');
  });

  it('joins a continuation line onto the value above it', () => {
    expect(parsed.fields.EXTENT).toBe(
      'THE NORTH SIDE OF THE STREET FROM THE DRIVEWAY EAST 120 FEET'
    );
  });

  it('keeps a value carrying a colon', () => {
    expect(parsed.fields.TAKEN).toBe('03/15/2024 07:42');
  });

  it('records the labels in the order they appeared', () => {
    expect(parsed.labels[0]).toBe('TICKET NUMBER');
    expect(parsed.labels).toContain('MEMBERS');
  });

  it('joins a repeated label rather than losing the first', () => {
    const twice = parseTransmission('REMARKS: CALL FIRST\nREMARKS: GATE CODE 4412');
    expect(twice.fields.REMARKS).toBe('CALL FIRST GATE CODE 4412');
    expect(twice.labels).toHaveLength(1);
  });

  it('rejects a block that opens with a continuation', () => {
    expect(() => parseTransmission('   dangling text\nADDRESS: X')).toThrow(/starts with a contin/);
  });

  it('rejects a block with no fields at all', () => {
    expect(() => parseTransmission('\n\n')).toThrow(/no fields at all/);
  });

  it('rejects a non string', () => {
    expect(() => parseTransmission(undefined)).toThrow(/must be a string/);
  });

  it('appends an unlabelled line to the field above it', () => {
    const parsedTail = parseTransmission('ADDRESS: 1420 NW 23RD ST\nsuite 200');
    expect(parsedTail.fields.ADDRESS).toBe('1420 NW 23RD ST suite 200');
  });
});

describe('field readers', () => {
  const parsed = parseTransmission(BLOCK);

  it('reads a field with a fallback', () => {
    expect(field(parsed, 'ADDRESS')).toBe('1420 NW 23RD ST');
    expect(field(parsed, 'INTERSECTION')).toBeNull();
    expect(field(parsed, 'INTERSECTION', 'none')).toBe('none');
  });

  it('demands a required field', () => {
    expect(requiredField(parsed, 'TICKET NUMBER')).toBe('B240315000420');
    expect(() => requiredField(parsed, 'WORK TYPE')).toThrow(/missing a required field/);
  });

  it('reads a list field', () => {
    expect(listField(parsed, 'MEMBERS')).toEqual(['OKGAS01', 'OKELEC02', 'CITYWTR']);
    expect(listField(parsed, 'GRIDS')).toEqual([]);
  });

  it('reads a yes or no flag', () => {
    expect(flagField(parsed, 'BORING')).toBe(true);
    expect(flagField(parsed, 'WHITE LINED')).toBe(false);
    expect(flagField(parsed, 'BLASTING')).toBe(false);
    expect(flagField(parsed, 'BLASTING', true)).toBe(true);
  });

  it('rejects a flag that is neither', () => {
    const odd = parseTransmission('BORING: MAYBE');
    expect(() => flagField(odd, 'BORING')).toThrow(/neither yes nor no/);
  });
});

describe('scanLabels', () => {
  it('keeps a two word label together', () => {
    const marks = scanLabels('TICKET NUMBER: B240315000420');
    expect(marks).toHaveLength(1);
    expect(marks[0].label).toBe('TICKET NUMBER');
  });

  it('needs two spaces before a second label on the same line', () => {
    expect(scanLabels('STATE: OK COUNTY: OKLAHOMA')).toHaveLength(1);
    expect(scanLabels('STATE: OK  COUNTY: OKLAHOMA')).toHaveLength(2);
  });

  it('ignores a clock time inside a value', () => {
    expect(scanLabels('TAKEN: 03/15/2024 07:42')).toHaveLength(1);
  });

  it('finds a label on an indented line', () => {
    const marks = scanLabels('  CONTACT: R MASSEY  PHONE: 405-555-0148');
    expect(marks.map((mark) => mark.label)).toEqual(['CONTACT', 'PHONE']);
  });
});
