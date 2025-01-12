import { describe, expect, it } from 'vitest';
import {
  HOLIDAY_PRESETS,
  holidayPreset,
  holidayList,
  holidayNames,
} from '../../src/time/holidays.js';
import { Calendar } from '../../src/time/calendar.js';
import { ScheduleError } from '../../src/core/errors.js';

describe('holidayPreset', () => {
  it('ships the presets it names', () => {
    expect(HOLIDAY_PRESETS).toEqual(['FEDERAL', 'UTILITY', 'NONE']);
  });

  it('gives the federal list', () => {
    expect(holidayPreset('federal')).toHaveLength(11);
    expect(holidayNames(holidayPreset('FEDERAL'))).toContain('juneteenth');
  });

  it('gives the shorter utility list', () => {
    const names = holidayNames(holidayPreset('utility'));
    expect(names).toContain('thanksgiving');
    expect(names).not.toContain('columbus day');
    expect(names).toHaveLength(7);
  });

  it('gives an empty list', () => {
    expect(holidayPreset('none')).toEqual([]);
  });

  it('hands back a copy each time', () => {
    const first = holidayPreset('utility');
    first[0].name = 'changed';
    expect(holidayPreset('utility')[0].name).toBe('new year');
  });

  it('rejects a preset it does not ship', () => {
    try {
      holidayPreset('bank');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScheduleError);
      expect(err.details.known).toEqual(HOLIDAY_PRESETS);
    }
  });
});

describe('holidayList', () => {
  it('defaults to the utility list', () => {
    expect(holidayList()).toHaveLength(7);
  });

  it('drops a day the operator works', () => {
    const names = holidayNames(holidayList({ drop: ['juneteenth'] }));
    expect(names).not.toContain('juneteenth');
    expect(names).toHaveLength(6);
  });

  it('drops by name in any case', () => {
    expect(holidayNames(holidayList({ drop: ['JUNETEENTH'] }))).not.toContain('juneteenth');
  });

  it('adds a day the operator does observe', () => {
    const rules = holidayList({
      add: [{ kind: 'fixed', month: 12, day: 24, name: 'christmas eve' }],
    });
    expect(holidayNames(rules)).toContain('christmas eve');
  });

  it('refuses to add a day that is already there', () => {
    expect(() =>
      holidayList({ add: [{ kind: 'fixed', month: 12, day: 25, name: 'Christmas' }] })
    ).toThrow(/already in the list/);
  });

  it('lets a dropped day be added back with different rules', () => {
    const rules = holidayList({
      drop: ['christmas'],
      add: [{ kind: 'fixed', month: 12, day: 25, name: 'christmas', observed: 'none' }],
    });
    expect(rules.find((rule) => rule.name === 'christmas').observed).toBe('none');
  });

  it('rejects an added rule with no name', () => {
    expect(() => holidayList({ add: [{ kind: 'fixed', month: 12, day: 24 }] })).toThrow(
      /needs a name and a rule/
    );
    expect(() => holidayList({ add: [null] })).toThrow(ScheduleError);
  });

  it('builds a calendar that skips the days', () => {
    const calendar = new Calendar({ holidays: holidayList() });
    expect(calendar.isBusinessDay('2024-07-04')).toBe(false);
    expect(calendar.isBusinessDay('2024-10-14')).toBe(true);
  });
});
