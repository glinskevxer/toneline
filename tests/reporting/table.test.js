import { describe, expect, it } from 'vitest';
import {
  cellText,
  truncate,
  pad,
  renderTable,
  renderPairs,
  renderHeading,
  joinSections,
} from '../../src/reporting/table.js';

describe('cellText', () => {
  it('renders nothing for nothing', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
  });

  it('renders a flag as a word', () => {
    expect(cellText(true)).toBe('yes');
    expect(cellText(false)).toBe('no');
  });

  it('keeps a whole number whole and fixes a fraction to two places', () => {
    expect(cellText(12)).toBe('12');
    expect(cellText(12.5)).toBe('12.50');
    expect(cellText(12.345)).toBe('12.35');
  });

  it('renders anything else as text', () => {
    expect(cellText('B1')).toBe('B1');
  });
});

describe('truncate', () => {
  it('leaves a short value alone', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('cuts a long value and marks it', () => {
    expect(truncate('abcdefgh', 5)).toBe('abcd…');
  });

  it('handles the narrow cases', () => {
    expect(truncate('abc', 1)).toBe('…');
    expect(truncate('abc', 0)).toBe('');
  });
});

describe('pad', () => {
  it('pads left aligned by default', () => {
    expect(pad('ab', 5)).toBe('ab   ');
  });

  it('pads right aligned when asked', () => {
    expect(pad('ab', 5, 'right')).toBe('   ab');
  });

  it('does not pad past the width', () => {
    expect(pad('abcdef', 4)).toBe('abc…');
  });
});

describe('renderTable', () => {
  const rows = [
    { number: 'B240315000420', type: 'NORMAL', minutes: 120 },
    { number: 'B240315000421', type: 'EMERGENCY', minutes: 15 },
  ];
  const columns = [
    { key: 'number', label: 'ticket' },
    { key: 'type' },
    { key: 'minutes', label: 'mins', align: 'right' },
  ];

  it('lays the columns out with a rule', () => {
    expect(renderTable(rows, columns)).toBe(
      [
        'ticket         type       mins',
        '-------------  ---------  ----',
        'B240315000420  NORMAL      120',
        'B240315000421  EMERGENCY    15',
        '',
      ].join('\n')
    );
  });

  it('can leave the rule off', () => {
    const text = renderTable(rows, columns, { rule: false });
    expect(text.split('\n')[1]).toContain('B240315000420');
  });

  it('honours a fixed column width', () => {
    const text = renderTable(rows, [{ key: 'number', label: 'ticket', width: 6 }]);
    expect(text.split('\n')[2]).toBe('B2403…');
  });

  it('honours a different gap', () => {
    const text = renderTable(rows, columns, { gap: ' | ' });
    expect(text.split('\n')[0]).toContain(' | ');
  });

  it('renders a header only table for no rows', () => {
    expect(renderTable([], columns).split('\n')[0]).toBe('ticket  type  mins');
  });

  it('renders nothing without columns', () => {
    expect(renderTable(rows, [])).toBe('');
  });

  it('leaves a blank cell for a missing key', () => {
    const text = renderTable([{ number: 'B1' }], [{ key: 'number' }, { key: 'missing' }]);
    expect(text.split('\n')[2]).toBe('B1');
  });
});

describe('renderPairs', () => {
  it('lines the names up', () => {
    expect(renderPairs({ tickets: 42, 'on time': 0.98 })).toBe(
      ['tickets  42', 'on time  0.98', ''].join('\n')
    );
  });

  it('takes an array of pairs too', () => {
    expect(renderPairs([['a', 1]])).toBe('a  1\n');
  });

  it('renders nothing for nothing', () => {
    expect(renderPairs({})).toBe('');
    expect(renderPairs([])).toBe('');
  });
});

describe('renderHeading and joinSections', () => {
  it('rules a heading', () => {
    expect(renderHeading('open work')).toBe('open work\n=========\n');
  });

  it('joins sections with a blank line', () => {
    expect(joinSections(['a\n', 'b\n'])).toBe('a\n\nb\n');
  });

  it('drops empty sections', () => {
    expect(joinSections(['a\n', '', null, 'b\n'])).toBe('a\n\nb\n');
  });
});
