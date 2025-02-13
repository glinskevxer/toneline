import { describe, expect, it } from 'vitest';
import {
  series,
  change,
  average,
  slope,
  direction,
  trend,
  worstPeriod,
  trendLine,
} from '../../src/reporting/trend.js';

const RECORDS = [
  { period: '2024-01', tickets: 100, onTimeRate: 0.9 },
  { period: '2024-02', tickets: 120, onTimeRate: 0.92 },
  { period: '2024-03', tickets: 140, onTimeRate: 0.88 },
];

describe('series and the plain numbers', () => {
  it('pulls a field out into points', () => {
    expect(series(RECORDS, 'tickets')).toEqual([
      { period: '2024-01', value: 100 },
      { period: '2024-02', value: 120 },
      { period: '2024-03', value: 140 },
    ]);
  });

  it('reads a missing field as zero', () => {
    expect(series([{ period: '2024-01' }], 'tickets')[0].value).toBe(0);
  });

  it('measures the change end to end', () => {
    expect(change(series(RECORDS, 'tickets'))).toBe(40);
    expect(change([])).toBe(0);
    expect(change(series(RECORDS.slice(0, 1), 'tickets'))).toBe(0);
  });

  it('averages the series', () => {
    expect(average(series(RECORDS, 'tickets'))).toBe(120);
    expect(average([])).toBe(0);
  });
});

describe('slope and direction', () => {
  it('measures a straight rise', () => {
    expect(slope(series(RECORDS, 'tickets'))).toBe(20);
  });

  it('measures a fall', () => {
    const falling = [...RECORDS].reverse();
    expect(slope(series(falling, 'tickets'))).toBe(-20);
  });

  it('is zero with fewer than two points', () => {
    expect(slope(series(RECORDS.slice(0, 1), 'tickets'))).toBe(0);
    expect(slope([])).toBe(0);
  });

  it('is zero on a flat series', () => {
    const flat = [
      { period: '2024-01', tickets: 100 },
      { period: '2024-02', tickets: 100 },
    ];
    expect(slope(series(flat, 'tickets'))).toBe(0);
  });

  it('names the direction with a dead band', () => {
    const points = series(RECORDS, 'tickets');
    expect(direction(points)).toBe('rising');
    expect(direction(points, 25)).toBe('flat');
    expect(direction(series([...RECORDS].reverse(), 'tickets'))).toBe('falling');
  });
});

describe('trend', () => {
  it('describes a rising series', () => {
    const result = trend(RECORDS, 'tickets');
    expect(result.first).toBe(100);
    expect(result.last).toBe(140);
    expect(result.change).toBe(40);
    expect(result.direction).toBe('rising');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('knows when falling is the good news', () => {
    const damages = [
      { period: '2024-01', rate: 5 },
      { period: '2024-02', rate: 3 },
    ];
    expect(trend(damages, 'rate', { lowerIsBetter: true }).better).toBe(true);
    expect(trend(damages, 'rate').better).toBe(false);
  });

  it('has no opinion on a flat series', () => {
    const flat = [
      { period: '2024-01', rate: 5 },
      { period: '2024-02', rate: 5 },
    ];
    expect(trend(flat, 'rate').better).toBeNull();
  });

  it('trends an empty run without falling over', () => {
    const result = trend([], 'tickets');
    expect(result.periods).toBe(0);
    expect(result.first).toBeNull();
    expect(result.direction).toBe('flat');
  });
});

describe('worstPeriod and trendLine', () => {
  it('finds the worst period each way round', () => {
    const points = series(RECORDS, 'onTimeRate');
    expect(worstPeriod(points).period).toBe('2024-03');
    expect(worstPeriod(points, { lowerIsBetter: true }).period).toBe('2024-02');
    expect(worstPeriod([])).toBeNull();
  });

  it('writes a line a manager can read', () => {
    expect(trendLine(trend(RECORDS, 'tickets'))).toBe('tickets: 100 to 140, rising 20 a period');
  });

  it('writes a line for a flat series', () => {
    const flat = [
      { period: '2024-01', rate: 5 },
      { period: '2024-02', rate: 5 },
    ];
    expect(trendLine(trend(flat, 'rate'))).toBe('rate: 5 to 5, flat');
  });

  it('says so when there is nothing to trend', () => {
    expect(trendLine(trend([], 'tickets'))).toBe('tickets: nothing to trend');
  });
});
