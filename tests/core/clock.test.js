import { describe, expect, it } from 'vitest';
import {
  ClockError,
  stampFromDate,
  systemClock,
  fixedClock,
  steppingClock,
  readClock,
} from '../../src/core/clock.js';
import { isStamp } from '../../src/time/stamp.js';

describe('stampFromDate', () => {
  it('rounds down to the minute', () => {
    expect(stampFromDate(new Date(2024, 2, 15, 7, 42, 31))).toBe('2024-03-15T07:42');
  });

  it('pads the parts', () => {
    expect(stampFromDate(new Date(2024, 0, 5, 9, 5))).toBe('2024-01-05T09:05');
  });

  it('rejects anything that is not a real date', () => {
    expect(() => stampFromDate('2024-03-15')).toThrow(ClockError);
    expect(() => stampFromDate(new Date('nonsense'))).toThrow(/real date/);
  });
});

describe('systemClock', () => {
  it('reads a well formed timestamp', () => {
    expect(isStamp(systemClock().now())).toBe(true);
  });
});

describe('fixedClock', () => {
  it('stays where it was put', () => {
    const clock = fixedClock('2024-03-15T07:42');
    expect(clock.now()).toBe('2024-03-15T07:42');
    expect(clock.now()).toBe('2024-03-15T07:42');
  });

  it('rejects a date it cannot read', () => {
    expect(() => fixedClock('yesterday')).toThrow();
  });
});

describe('steppingClock', () => {
  it('starts where it was put', () => {
    expect(steppingClock('2024-03-15T07:42').now()).toBe('2024-03-15T07:42');
  });

  it('steps a minute on each read by default', () => {
    const clock = steppingClock('2024-03-15T07:42');
    expect([clock.now(), clock.now(), clock.now()]).toEqual([
      '2024-03-15T07:42',
      '2024-03-15T07:43',
      '2024-03-15T07:44',
    ]);
  });

  it('steps by the amount it was given', () => {
    const clock = steppingClock('2024-03-15T07:00', 30);
    clock.now();
    expect(clock.now()).toBe('2024-03-15T07:30');
  });

  it('crosses midnight', () => {
    const clock = steppingClock('2024-03-15T23:50', 15);
    clock.now();
    expect(clock.now()).toBe('2024-03-16T00:05');
  });

  it('can be told to stand still', () => {
    const clock = steppingClock('2024-03-15T07:42', 0);
    expect([clock.now(), clock.now()]).toEqual(['2024-03-15T07:42', '2024-03-15T07:42']);
  });

  it('rejects a step that is not whole minutes', () => {
    expect(() => steppingClock('2024-03-15T07:42', -1)).toThrow(ClockError);
    expect(() => steppingClock('2024-03-15T07:42', 1.5)).toThrow(/whole number of minutes/);
  });
});

describe('readClock', () => {
  it('reads any clock', () => {
    expect(readClock(fixedClock('2024-03-15T07:42'))).toBe('2024-03-15T07:42');
  });

  it('rejects anything that is not one', () => {
    expect(() => readClock(null)).toThrow(/not a clock/);
    expect(() => readClock({ now: 'soon' })).toThrow(ClockError);
  });
});
