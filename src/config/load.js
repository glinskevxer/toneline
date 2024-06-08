/**
 * Building the desk.
 *
 * Configuration is data; this turns it into the objects the rest of the library
 * works with. Everything a calculation needs is on one context object, so no
 * module has to reach back into the raw configuration and guess a default.
 */

import { ConfigError } from '../core/errors.js';
import { Calendar } from '../time/calendar.js';
import { WorkSchedule } from '../time/workhours.js';
import { buildDistricts } from '../network/district.js';
import { buildNetwork } from '../network/network.js';
import { lifePolicy } from '../ticket/expiry.js';
import { sitePolicy } from '../ticket/site.js';
import { screenPolicy } from '../screening/screen.js';
import { clockPolicy } from '../response/clock.js';
import { assertConfig } from './schema.js';

const DEFAULT_HOURS = {
  monday: { open: '07:00', close: '17:00' },
  tuesday: { open: '07:00', close: '17:00' },
  wednesday: { open: '07:00', close: '17:00' },
  thursday: { open: '07:00', close: '17:00' },
  friday: { open: '07:00', close: '17:00' },
};

/**
 * Build the runtime desk from a configuration.
 *
 * @param {object} config the parsed configuration
 * @param {object} [options]
 * @param {object[]} [options.facilities] facility records to load into the network
 * @param {boolean} [options.failOnWarning] treat warnings as errors
 * @returns {object} a frozen desk context
 */
export function loadDesk(config, options = {}) {
  const { facilities = [], failOnWarning = false } = options;
  const { warnings } = assertConfig(config);
  if (failOnWarning && warnings.length > 0) {
    throw new ConfigError('the configuration was accepted but carries warnings', { warnings });
  }

  const calendar = new Calendar({
    name: config.operator.code,
    weekend: config.calendar?.weekend ?? ['saturday', 'sunday'],
    holidays: config.calendar?.holidays ?? [],
  });
  const schedule = new WorkSchedule({
    name: `${config.operator.code} desk`,
    calendar,
    hours: config.hours ?? DEFAULT_HOURS,
  });
  const districts = buildDistricts(config.districts ?? []);
  const network = buildNetwork(facilities);

  return Object.freeze({
    operator: Object.freeze({ ...config.operator }),
    centre: Object.freeze({ cutoff: '17:00', ...config.centre }),
    calendar,
    schedule,
    districts,
    network,
    policies: Object.freeze({
      life: lifePolicy(config.policies?.life ?? {}),
      site: sitePolicy(config.policies?.site ?? {}),
      screen: screenPolicy(config.policies?.screen ?? {}),
      clock: clockPolicy(config.policies?.clock ?? {}),
    }),
    warnings,
  });
}

/** The arguments a screening call takes, read off a desk. */
export function screeningContext(desk) {
  return {
    network: desk.network,
    districts: desk.districts,
    policy: desk.policies.screen,
    site: desk.policies.site,
  };
}

/** The arguments a scheduling call takes, read off a desk. */
export function schedulingContext(desk) {
  return {
    calendar: desk.calendar,
    schedule: desk.schedule,
    policy: desk.policies.clock,
    cutoff: desk.centre.cutoff,
  };
}

/** The arguments an expiry call takes, read off a desk. */
export function expiryContext(desk) {
  return {
    calendar: desk.calendar,
    cutoff: desk.centre.cutoff,
    policy: desk.policies.life,
  };
}

/** Add facilities to a desk that has already been built. */
export function loadFacilities(desk, records) {
  desk.network.addAll(records);
  return desk.network;
}
