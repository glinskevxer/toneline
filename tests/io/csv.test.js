import { describe, expect, it } from 'vitest';
import { parseRows, parseCsv, quoteField, writeCsv } from '../../src/io/csv.js';
import { FeedParseError } from '../../src/core/errors.js';

describe('parseRows', () => {
  it('splits plain rows', () => {
    expect(parseRows('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a trailing row without a newline', () => {
    expect(parseRows('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas and quotes', () => {
    expect(parseRows('a,b\n"one, two","he said ""hi"""')).toEqual([
      ['a', 'b'],
      ['one, two', 'he said "hi"'],
    ]);
  });

  it('handles an embedded newline inside quotes', () => {
    expect(parseRows('a\n"line one\nline two"')).toEqual([['a'], ['line one\nline two']]);
  });

  it('drops a byte order mark', () => {
    expect(parseRows('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('strips carriage returns', () => {
    expect(parseRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('honours another delimiter', () => {
    expect(parseRows('a|b\n1|2', { delimiter: '|' })).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(parseRows('')).toEqual([]);
  });

  it('rejects a non string', () => {
    expect(() => parseRows(null)).toThrow(FeedParseError);
  });

  it('rejects a delimiter that is not one character', () => {
    expect(() => parseRows('a,b', { delimiter: '||' })).toThrow(/single character/);
  });

  it('rejects text that ends inside a quoted field', () => {
    expect(() => parseRows('a\n"unterminated')).toThrow(/inside a quoted field/);
  });
});

describe('parseCsv', () => {
  const text =
    'ticket,street,footage\nB240315000420,NW 23rd St,120\nB240315000421,Robinson Ave,45\n';

  it('keys records by the header', () => {
    expect(parseCsv(text)).toEqual([
      { ticket: 'B240315000420', street: 'NW 23rd St', footage: '120' },
      { ticket: 'B240315000421', street: 'Robinson Ave', footage: '45' },
    ]);
  });

  it('trims values by default and can be told not to', () => {
    expect(parseCsv('a\n  x  ')[0].a).toBe('x');
    expect(parseCsv('a\n"  x  "', { trim: false })[0].a).toBe('  x  ');
  });

  it('skips a blank trailing line', () => {
    expect(parseCsv('a,b\n1,2\n\n')).toHaveLength(1);
  });

  it('returns nothing for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('rejects a blank or repeated column name', () => {
    expect(() => parseCsv('a,,c\n1,2,3')).toThrow(/blank column name/);
    expect(() => parseCsv('a,a\n1,2')).toThrow(/repeats a column name/);
  });

  it('rejects a row that does not match the header width', () => {
    expect(() => parseCsv('a,b\n1,2,3')).toThrow(/header width/);
  });
});

describe('quoteField', () => {
  it('leaves a plain value alone', () => {
    expect(quoteField('plain')).toBe('plain');
  });

  it('quotes a value carrying the delimiter or a quote', () => {
    expect(quoteField('one, two')).toBe('"one, two"');
    expect(quoteField('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('quotes a value with leading or trailing space', () => {
    expect(quoteField(' padded ')).toBe('" padded "');
  });

  it('renders nothing for null and undefined', () => {
    expect(quoteField(null)).toBe('');
    expect(quoteField(undefined)).toBe('');
  });
});

describe('writeCsv', () => {
  it('round trips through parseCsv', () => {
    const records = [
      { ticket: 'B240315000420', note: 'marked, clear' },
      { ticket: 'B240315000421', note: 'no conflict' },
    ];
    expect(parseCsv(writeCsv(records))).toEqual(records);
  });

  it('honours an explicit column order', () => {
    const text = writeCsv([{ b: 2, a: 1 }], { columns: ['a', 'b'] });
    expect(text.split('\n')[0]).toBe('a,b');
  });

  it('fills a column a record does not carry', () => {
    expect(writeCsv([{ a: 1 }], { columns: ['a', 'b'] })).toBe('a,b\n1,\n');
  });

  it('renders nothing when there are no columns', () => {
    expect(writeCsv([])).toBe('');
  });

  it('rejects anything that is not an array', () => {
    expect(() => writeCsv({})).toThrow(/array of records/);
  });
});
