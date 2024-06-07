import { describe, expect, it } from 'vitest';
import {
  validateConfig,
  assertConfig,
  isKnownFacilityType,
  isConfigDate,
} from '../../src/config/schema.js';
import { ConfigError } from '../../src/core/errors.js';

const GOOD = {
  operator: { name: 'Cross Timbers Gas', code: 'CTG' },
  centre: { prefix: 'B', cutoff: '17:00', name: 'Oklahoma One Call' },
  calendar: {
    weekend: ['saturday', 'sunday'],
    holidays: [{ kind: 'fixed', month: 7, day: 4, name: 'independence day' }],
  },
  hours: { monday: { open: '07:00', close: '17:00' } },
  districts: [
    {
      code: 'CENTRAL',
      members: ['OKGAS01'],
      boundary: [
        { lat: 35.44, lon: -97.56 },
        { lat: 35.48, lon: -97.56 },
        { lat: 35.48, lon: -97.5 },
      ],
    },
  ],
  facilities: 'facilities.csv',
  policies: { life: { defaultLifeDays: 21 } },
};

describe('validateConfig', () => {
  it('passes a good configuration with no warnings', () => {
    expect(validateConfig(GOOD)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects anything that is not an object', () => {
    expect(validateConfig(null).errors).toEqual(['configuration must be an object']);
    expect(validateConfig([]).errors).toHaveLength(1);
  });

  it('collects every problem rather than stopping at the first', () => {
    const { errors } = validateConfig({ operator: {}, centre: {}, districts: [] });
    expect(errors).toContain('operator.name is required');
    expect(errors).toContain('operator.code is required');
    expect(errors).toContain('centre.prefix is required');
  });

  it('checks the centre prefix and cutoff', () => {
    expect(validateConfig({ ...GOOD, centre: { prefix: 'LONGER' } }).errors).toContain(
      'centre.prefix must be one to three letters'
    );
    expect(validateConfig({ ...GOOD, centre: { prefix: 'B', cutoff: '5pm' } }).errors).toContain(
      'centre.cutoff must be a time in HH:MM form'
    );
    expect(validateConfig({ ...GOOD, centre: { prefix: 'B' } }).warnings).toContain(
      'centre.cutoff is missing, so 17:00 will be used'
    );
  });

  it('checks the calendar', () => {
    expect(validateConfig({ ...GOOD, calendar: 'weekdays' }).errors).toContain(
      'calendar must be an object'
    );
    expect(validateConfig({ ...GOOD, calendar: { weekend: 'sat' } }).errors).toContain(
      'calendar.weekend must be a list of weekdays'
    );
    expect(validateConfig({ ...GOOD, calendar: { holidays: {} } }).errors).toContain(
      'calendar.holidays must be a list of rules'
    );
    const { calendar, ...withoutCalendar } = GOOD;
    expect(validateConfig(withoutCalendar).warnings[0]).toMatch(/no calendar was given/);
  });

  it('checks each holiday rule', () => {
    const bad = {
      ...GOOD,
      calendar: { holidays: [{ kind: 'easter' }, { kind: 'fixed', month: 7 }] },
    };
    const { errors } = validateConfig(bad);
    expect(errors).toContain('calendar.holidays[0] has an unknown kind');
    expect(errors).toContain('calendar.holidays[0] needs a name');
    expect(errors).toContain('calendar.holidays[1] needs a whole month and day');
  });

  it('checks an nth weekday rule', () => {
    const bad = { ...GOOD, calendar: { holidays: [{ kind: 'nth-weekday', name: 'x' }] } };
    const { errors } = validateConfig(bad);
    expect(errors).toContain('calendar.holidays[0] needs a whole nth');
    expect(errors).toContain('calendar.holidays[0] needs a weekday');
  });

  it('warns about an empty holiday list', () => {
    expect(validateConfig({ ...GOOD, calendar: { holidays: [] } }).warnings[0]).toMatch(
      /only weekends/
    );
  });

  it('checks the working hours', () => {
    expect(
      validateConfig({ ...GOOD, hours: { funday: { open: '07:00', close: '17:00' } } }).errors[0]
    ).toMatch(/not a weekday/);
    expect(
      validateConfig({ ...GOOD, hours: { monday: { open: '7am', close: '17:00' } } }).errors
    ).toContain('hours.monday.open must be a time in HH:MM form');
    expect(validateConfig({ ...GOOD, hours: { monday: 'all day' } }).errors[0]).toMatch(
      /open and close/
    );
    const { hours, ...withoutHours } = GOOD;
    expect(validateConfig(withoutHours).warnings[0]).toMatch(/no working hours/);
  });

  it('checks the districts', () => {
    expect(validateConfig({ ...GOOD, districts: 'central' }).errors).toContain(
      'districts must be a list'
    );
    expect(validateConfig({ ...GOOD, districts: [] }).warnings[0]).toMatch(/no districts/);
    const repeated = validateConfig({ ...GOOD, districts: [GOOD.districts[0], GOOD.districts[0]] });
    expect(repeated.errors).toContain('districts[1].code repeats CENTRAL');
  });

  it('checks a district boundary and its members', () => {
    const short = { ...GOOD.districts[0], boundary: [{ lat: 1, lon: 1 }] };
    expect(validateConfig({ ...GOOD, districts: [short] }).errors[0]).toMatch(/three points/);
    const noMembers = { ...GOOD.districts[0], members: [] };
    expect(validateConfig({ ...GOOD, districts: [noMembers] }).warnings[0]).toMatch(/no member/);
    expect(validateConfig({ ...GOOD, districts: [null] }).errors).toContain(
      'districts[0] must be an object'
    );
  });

  it('checks the policy names', () => {
    expect(validateConfig({ ...GOOD, policies: { weather: {} } }).errors[0]).toMatch(
      /not a policy this desk reads/
    );
    expect(validateConfig({ ...GOOD, policies: { life: 21 } }).errors).toContain(
      'policies.life must be an object'
    );
    expect(validateConfig({ ...GOOD, policies: 'none' }).errors).toContain(
      'policies must be an object'
    );
  });

  it('warns when no facilities were named', () => {
    const { facilities, ...withoutFacilities } = GOOD;
    expect(validateConfig(withoutFacilities).warnings[0]).toMatch(/screen as clear/);
    expect(validateConfig({ ...GOOD, facilities: [] }).warnings).toEqual([]);
  });
});

describe('assertConfig', () => {
  it('hands back the warnings when the configuration will do', () => {
    expect(assertConfig(GOOD)).toEqual({ warnings: [] });
  });

  it('throws with every problem', () => {
    try {
      assertConfig({ operator: {}, centre: {}, districts: [] });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.details.errors.length).toBeGreaterThan(2);
    }
  });
});

describe('small helpers', () => {
  it('knows the facility types', () => {
    expect(isKnownFacilityType('gas')).toBe(true);
    expect(isKnownFacilityType('air')).toBe(false);
  });

  it('checks a configuration date', () => {
    expect(isConfigDate('2024-03-15')).toBe(true);
    expect(isConfigDate('03/15/2024')).toBe(false);
    expect(isConfigDate(20240315)).toBe(false);
  });
});
