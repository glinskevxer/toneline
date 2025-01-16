import { describe, expect, it } from 'vitest';
import {
  loadDesk,
  screeningContext,
  schedulingContext,
  expiryContext,
  loadFacilities,
} from '../../src/config/load.js';
import { Calendar } from '../../src/time/calendar.js';
import { WorkSchedule } from '../../src/time/workhours.js';
import { ConfigError } from '../../src/core/errors.js';
import { destination } from '../../src/geo/point.js';

const A = { lat: 35.4676, lon: -97.5164 };

const CONFIG = {
  operator: { name: 'Cross Timbers Gas', code: 'CTG' },
  centre: { prefix: 'B', cutoff: '16:00', name: 'Oklahoma One Call' },
  calendar: { holidays: [{ kind: 'fixed', month: 7, day: 4, name: 'independence day' }] },
  hours: { monday: { open: '06:30', close: '15:30' } },
  districts: [
    {
      code: 'CENTRAL',
      members: ['OKGAS01'],
      boundary: [
        { lat: 35.44, lon: -97.56 },
        { lat: 35.48, lon: -97.56 },
        { lat: 35.48, lon: -97.5 },
        { lat: 35.44, lon: -97.5 },
      ],
    },
  ],
  facilities: 'facilities.csv',
};

const FACILITIES = [
  { id: 'GM-1', type: 'gas', district: 'CENTRAL', path: [A, destination(A, 200, 90)] },
];

describe('loadDesk', () => {
  it('builds every runtime object', () => {
    const desk = loadDesk(CONFIG, { facilities: FACILITIES });
    expect(desk.calendar).toBeInstanceOf(Calendar);
    expect(desk.schedule).toBeInstanceOf(WorkSchedule);
    expect(desk.districts).toHaveLength(1);
    expect(desk.network.size).toBe(1);
    expect(Object.isFrozen(desk)).toBe(true);
  });

  it('carries the calendar through', () => {
    const desk = loadDesk(CONFIG);
    expect(desk.calendar.isBusinessDay('2024-07-04')).toBe(false);
    expect(desk.calendar.name).toBe('CTG');
  });

  it('carries the working hours through', () => {
    const desk = loadDesk(CONFIG);
    expect(desk.schedule.windowOn('2024-03-18')).toEqual({ open: 390, close: 930 });
    expect(desk.schedule.windowOn('2024-03-19')).toBeNull();
  });

  it('falls back to a weekday desk when no hours were given', () => {
    const { hours, ...withoutHours } = CONFIG;
    const desk = loadDesk(withoutHours);
    expect(desk.schedule.windowOn('2024-03-19')).toEqual({ open: 420, close: 1020 });
  });

  it('defaults the centre cutoff without losing the rest', () => {
    const desk = loadDesk({ ...CONFIG, centre: { prefix: 'B', name: 'Oklahoma One Call' } });
    expect(desk.centre.cutoff).toBe('17:00');
    expect(desk.centre.name).toBe('Oklahoma One Call');
    expect(loadDesk(CONFIG).centre.cutoff).toBe('16:00');
  });

  it('builds the policies with their defaults', () => {
    const desk = loadDesk(CONFIG);
    expect(desk.policies.life.defaultLifeDays).toBe(21);
    expect(desk.policies.site.pointRadiusFeet).toBe(50);
    expect(desk.policies.screen.noticeMarginFeet).toBe(25);
    expect(desk.policies.clock.capAtLawfulStart).toBe(true);
  });

  it('takes policy overrides from the configuration', () => {
    const desk = loadDesk({
      ...CONFIG,
      policies: { life: { defaultLifeDays: 14 }, site: { pointRadiusFeet: 80 } },
    });
    expect(desk.policies.life.defaultLifeDays).toBe(14);
    expect(desk.policies.site.pointRadiusFeet).toBe(80);
  });

  it('refuses a configuration that will not do', () => {
    expect(() => loadDesk({ operator: {}, centre: {}, districts: [] })).toThrow(ConfigError);
  });

  it('keeps the warnings on the desk', () => {
    const desk = loadDesk({ ...CONFIG, districts: [] });
    expect(desk.warnings.length).toBeGreaterThan(0);
  });

  it('can be told to refuse a warning as well', () => {
    expect(() => loadDesk({ ...CONFIG, districts: [] }, { failOnWarning: true })).toThrow(
      /carries warnings/
    );
    expect(() => loadDesk(CONFIG, { failOnWarning: true })).not.toThrow();
  });
});

describe('context helpers', () => {
  const desk = loadDesk(CONFIG, { facilities: FACILITIES });

  it('gathers what a screening needs', () => {
    const context = screeningContext(desk);
    expect(context.network).toBe(desk.network);
    expect(context.districts).toBe(desk.districts);
    expect(context.policy.noticeMarginFeet).toBe(25);
  });

  it('gathers what a schedule needs', () => {
    const context = schedulingContext(desk);
    expect(context.calendar).toBe(desk.calendar);
    expect(context.schedule).toBe(desk.schedule);
    expect(context.cutoff).toBe('16:00');
  });

  it('gathers what an expiry needs', () => {
    expect(expiryContext(desk).policy.defaultLifeDays).toBe(21);
  });
});

describe('loadFacilities', () => {
  it('adds to a desk that is already built', () => {
    const desk = loadDesk(CONFIG);
    expect(desk.network.size).toBe(0);
    loadFacilities(desk, FACILITIES);
    expect(desk.network.size).toBe(1);
  });
});

describe('holiday presets in a configuration', () => {
  it('expands a preset', () => {
    const desk = loadDesk({ ...CONFIG, calendar: { preset: 'UTILITY' } });
    expect(desk.calendar.isBusinessDay('2024-07-04')).toBe(false);
    expect(desk.calendar.isBusinessDay('2024-10-14')).toBe(true);
  });

  it('honours the operator additions and omissions', () => {
    const desk = loadDesk({
      ...CONFIG,
      calendar: {
        preset: 'UTILITY',
        add: [{ kind: 'fixed', month: 12, day: 24, name: 'christmas eve' }],
        drop: ['juneteenth'],
      },
    });
    expect(desk.calendar.isBusinessDay('2024-12-24')).toBe(false);
    expect(desk.calendar.isBusinessDay('2024-06-19')).toBe(true);
  });

  it('lets an explicit list win', () => {
    const desk = loadDesk({
      ...CONFIG,
      calendar: { holidays: [{ kind: 'fixed', month: 3, day: 1, name: 'founders day' }] },
    });
    expect(desk.calendar.isBusinessDay('2024-03-01')).toBe(false);
    expect(desk.calendar.isBusinessDay('2024-07-04')).toBe(true);
  });

  it('falls back to weekends only', () => {
    const desk = loadDesk({ ...CONFIG, calendar: { weekend: ['sunday'] } });
    expect(desk.calendar.isBusinessDay('2024-07-04')).toBe(true);
    expect(desk.calendar.isBusinessDay('2024-03-16')).toBe(true);
  });
});
