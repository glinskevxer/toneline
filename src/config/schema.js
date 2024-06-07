/**
 * Operator configuration.
 *
 * One file describes the desk: who the operator is, which centre it takes
 * tickets from, what the working week looks like, the districts it serves and
 * the policies every calculation reads. Validation returns problems rather than
 * throwing on the first one, so an operator setting the desk up sees the whole
 * list at once.
 */

import { ConfigError } from '../core/errors.js';
import { isBlank } from '../core/fields.js';
import { isDate } from '../time/date.js';
import { FACILITY_TYPE_CODES } from '../ticket/types.js';

const CLOCK = /^\d{1,2}:\d{2}$/;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Check a configuration object.
 *
 * @param {object} config the parsed configuration
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { errors: ['configuration must be an object'], warnings };
  }

  checkOperator(config.operator, errors);
  checkCentre(config.centre, errors, warnings);
  checkCalendar(config.calendar, errors, warnings);
  checkHours(config.hours, errors, warnings);
  checkDistricts(config.districts, errors, warnings);
  checkPolicies(config.policies, errors);

  if (isBlank(config.facilities) && !Array.isArray(config.facilities)) {
    warnings.push('no facilities were named, so every ticket will screen as clear');
  }
  return { errors, warnings };
}

function checkOperator(operator, errors) {
  if (!operator || typeof operator !== 'object') {
    errors.push('operator is required');
    return;
  }
  if (isBlank(operator.name)) errors.push('operator.name is required');
  if (isBlank(operator.code)) errors.push('operator.code is required');
}

function checkCentre(centre, errors, warnings) {
  if (!centre || typeof centre !== 'object') {
    errors.push('centre is required');
    return;
  }
  if (isBlank(centre.prefix)) {
    errors.push('centre.prefix is required');
  } else if (!/^[A-Za-z]{1,3}$/.test(String(centre.prefix))) {
    errors.push('centre.prefix must be one to three letters');
  }
  if (!isBlank(centre.cutoff) && !CLOCK.test(String(centre.cutoff))) {
    errors.push('centre.cutoff must be a time in HH:MM form');
  }
  if (isBlank(centre.cutoff)) warnings.push('centre.cutoff is missing, so 17:00 will be used');
}

function checkCalendar(calendar, errors, warnings) {
  if (calendar === undefined) {
    warnings.push('no calendar was given, so weekends only will be treated as non working');
    return;
  }
  if (typeof calendar !== 'object' || calendar === null) {
    errors.push('calendar must be an object');
    return;
  }
  if (calendar.weekend !== undefined && !Array.isArray(calendar.weekend)) {
    errors.push('calendar.weekend must be a list of weekdays');
  }
  if (calendar.holidays !== undefined) {
    if (!Array.isArray(calendar.holidays)) {
      errors.push('calendar.holidays must be a list of rules');
    } else {
      calendar.holidays.forEach((rule, index) => checkHoliday(rule, index, errors));
      if (calendar.holidays.length === 0) {
        warnings.push('the holiday list is empty, so only weekends will be skipped');
      }
    }
  }
}

function checkHoliday(rule, index, errors) {
  const where = `calendar.holidays[${index}]`;
  if (!rule || typeof rule !== 'object') {
    errors.push(`${where} must be an object`);
    return;
  }
  if (rule.kind === 'fixed') {
    if (!Number.isInteger(rule.month) || !Number.isInteger(rule.day)) {
      errors.push(`${where} needs a whole month and day`);
    }
  } else if (rule.kind === 'nth-weekday') {
    if (!Number.isInteger(rule.nth)) errors.push(`${where} needs a whole nth`);
    if (isBlank(rule.weekday)) errors.push(`${where} needs a weekday`);
  } else {
    errors.push(`${where} has an unknown kind`);
  }
  if (isBlank(rule.name)) errors.push(`${where} needs a name`);
}

function checkHours(hours, errors, warnings) {
  if (hours === undefined) {
    warnings.push('no working hours were given, so a weekday desk from 07:00 to 17:00 is assumed');
    return;
  }
  if (typeof hours !== 'object' || hours === null) {
    errors.push('hours must be an object keyed by weekday');
    return;
  }
  for (const [day, window] of Object.entries(hours)) {
    if (!WEEKDAYS.includes(String(day).toLowerCase())) {
      errors.push(`hours has an entry for ${day}, which is not a weekday`);
      continue;
    }
    if (!window || typeof window !== 'object') {
      errors.push(`hours.${day} must be an object with open and close`);
      continue;
    }
    for (const side of ['open', 'close']) {
      if (!CLOCK.test(String(window[side] ?? ''))) {
        errors.push(`hours.${day}.${side} must be a time in HH:MM form`);
      }
    }
  }
}

function checkDistricts(districts, errors, warnings) {
  if (!Array.isArray(districts)) {
    errors.push('districts must be a list');
    return;
  }
  if (districts.length === 0) {
    warnings.push('no districts were given, so every ticket will be treated as ours');
  }
  const seen = new Set();
  districts.forEach((district, index) => {
    const where = `districts[${index}]`;
    if (!district || typeof district !== 'object') {
      errors.push(`${where} must be an object`);
      return;
    }
    if (isBlank(district.code)) {
      errors.push(`${where}.code is required`);
    } else {
      const code = String(district.code).toUpperCase();
      if (seen.has(code)) errors.push(`${where}.code repeats ${code}`);
      seen.add(code);
    }
    const boundary = district.boundary ?? district.ring;
    if (!Array.isArray(boundary) || boundary.length < 3) {
      errors.push(`${where} needs a boundary of at least three points`);
    }
    if (!Array.isArray(district.members) || district.members.length === 0) {
      warnings.push(`${where} has no member codes, so the centre cannot route tickets to it`);
    }
  });
}

function checkPolicies(policies, errors) {
  if (policies === undefined) return;
  if (typeof policies !== 'object' || policies === null) {
    errors.push('policies must be an object');
    return;
  }
  for (const [name, values] of Object.entries(policies)) {
    if (!['life', 'site', 'screen', 'clock', 'billing'].includes(name)) {
      errors.push(`policies.${name} is not a policy this desk reads`);
      continue;
    }
    if (typeof values !== 'object' || values === null) {
      errors.push(`policies.${name} must be an object`);
    }
  }
}

/** Check a configuration and throw with every problem when it will not do. */
export function assertConfig(config) {
  const { errors, warnings } = validateConfig(config);
  if (errors.length > 0) {
    throw new ConfigError('the configuration cannot be used', { errors, warnings });
  }
  return { warnings };
}

/** True when a facility type code is one the operator may carry. */
export function isKnownFacilityType(code) {
  return FACILITY_TYPE_CODES.includes(String(code ?? '').toUpperCase());
}

/** A quick sanity check on a date field somewhere in a configuration. */
export function isConfigDate(value) {
  return typeof value === 'string' && isDate(value);
}
