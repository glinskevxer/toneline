/**
 * Making up a desk.
 *
 * A city network is tens of thousands of runs and a busy month is thousands of
 * tickets, and neither can be committed to a repository. This makes both from a
 * seed, so a load test and a demonstration both work from the same shapes, and
 * the same seed always gives the same desk.
 */

import { formatTicketNumber } from '../core/ids.js';
import { addDays } from '../time/date.js';
import { formatStamp } from '../time/stamp.js';
import { destination } from '../geo/point.js';

const FACILITY_TYPES = ['GAS', 'WATER', 'ELECTRIC', 'TELECOM', 'SEWER'];
const WORK_TYPES = [
  'sewer lateral repair',
  'water tap',
  'pole replacement',
  'fence posts',
  'driveway replacement',
  'storm drain repair',
];
const TICKET_TYPES = ['NORMAL', 'NORMAL', 'NORMAL', 'SHORT', 'EMERGENCY', 'DESIGN'];

/** A small deterministic generator, so a seed always gives the same desk. */
export function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** Pick one of a list. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

/**
 * Make a grid of facility runs around a centre point.
 *
 * The runs are laid out as a street grid, which is what a city network looks
 * like from above and what makes the index worth having.
 */
export function makeFacilities(count, options = {}) {
  const { seed = 1, centre = { lat: 35.4676, lon: -97.5164 }, spacingMetres = 120 } = options;
  const random = seeded(seed);
  const facilities = [];
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / side);
    const column = i % side;
    const start = destination(
      destination(centre, row * spacingMetres, 0),
      column * spacingMetres,
      90
    );
    const along = random() < 0.5 ? 90 : 0;
    facilities.push({
      id: `F-${String(i + 1).padStart(6, '0')}`,
      type: pick(random, FACILITY_TYPES),
      member: 'CTG01',
      district: 'CENTRAL',
      path: [start, destination(start, spacingMetres, along)],
      depthFeet: Math.round((2 + random() * 6) * 10) / 10,
      abandoned: random() < 0.03,
    });
  }
  return facilities;
}

/**
 * Make tickets scattered over the same ground.
 *
 * @param {number} count how many
 * @param {object} [options]
 */
export function makeTickets(count, options = {}) {
  const {
    seed = 2,
    centre = { lat: 35.4676, lon: -97.5164 },
    spreadMetres = 2000,
    from = '2024-03-01',
    days = 20,
  } = options;
  const random = seeded(seed);
  const tickets = [];
  for (let i = 0; i < count; i += 1) {
    const taken = addDays(from, Math.floor(random() * days));
    const minute = 7 * 60 + Math.floor(random() * 600);
    const point = destination(
      destination(centre, random() * spreadMetres, 0),
      random() * spreadMetres,
      90
    );
    tickets.push({
      number: formatTicketNumber({
        centre: 'B',
        taken,
        sequence: i + 1,
      }),
      type: pick(random, TICKET_TYPES),
      takenAt: formatStamp(taken, minute),
      state: 'OK',
      county: 'OKLAHOMA',
      place: 'OKLAHOMA CITY',
      address: `${100 + Math.floor(random() * 9000)} NW ${1 + Math.floor(random() * 60)}TH ST`,
      workType: pick(random, WORK_TYPES),
      excavator: { company: 'Digwell Excavating', phone: '405-555-0148' },
      extent: `east ${20 + Math.floor(random() * 200)} feet from the driveway`,
      members: ['CTG01'],
      whiteLined: random() < 0.6,
      boring: random() < 0.2,
      depthFeet: Math.round((2 + random() * 8) * 10) / 10,
      site: { points: [point] },
    });
  }
  return tickets;
}

/** A configuration to go with a generated network. */
export function makeConfig(options = {}) {
  const {
    code = 'GEN',
    name = 'Generated Desk',
    centre = { lat: 35.4676, lon: -97.5164 },
  } = options;
  const span = 0.2;
  return {
    operator: { name, code },
    centre: { name: 'Generated One Call', prefix: 'B', cutoff: '17:00' },
    calendar: { preset: 'UTILITY' },
    hours: {
      monday: { open: '07:00', close: '17:00' },
      tuesday: { open: '07:00', close: '17:00' },
      wednesday: { open: '07:00', close: '17:00' },
      thursday: { open: '07:00', close: '17:00' },
      friday: { open: '07:00', close: '17:00' },
    },
    districts: [
      {
        code: 'CENTRAL',
        members: ['CTG01'],
        boundary: [
          { lat: centre.lat - span, lon: centre.lon - span },
          { lat: centre.lat + span, lon: centre.lon - span },
          { lat: centre.lat + span, lon: centre.lon + span },
          { lat: centre.lat - span, lon: centre.lon + span },
        ],
      },
    ],
    facilities: [],
  };
}
