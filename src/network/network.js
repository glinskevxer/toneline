/**
 * The facility network.
 *
 * Screening runs against every facility the operator owns, which on a city
 * system is tens of thousands of runs, so the network keeps a coarse grid index
 * and only measures real distances against the runs whose cells the dig site
 * touches. The grid is deliberately simple: a fixed cell size in degrees, and
 * a run is listed in every cell its padded bounds overlap.
 */

import { FacilityError, buildFacility, facilityBounds, toleranceMetresOf } from './facility.js';
import { boundsOf, boundsOverlap, boundsUnion, expandBounds } from '../geo/bbox.js';
import { ringBounds, ringContains, ringIntersectsPolyline } from '../geo/polygon.js';
import { pointToPolyline } from '../geo/segment.js';

const DEFAULT_CELL_DEGREES = 0.005;

/** An index of facility runs with a coarse grid over the top. */
export class FacilityNetwork {
  /**
   * @param {object} [options]
   * @param {number} [options.cellDegrees] grid cell size in degrees
   */
  constructor(options = {}) {
    const { cellDegrees = DEFAULT_CELL_DEGREES } = options;
    if (typeof cellDegrees !== 'number' || !(cellDegrees > 0)) {
      throw new FacilityError('the grid cell size must be a positive number', { cellDegrees });
    }
    this.cellDegrees = cellDegrees;
    this.facilities = new Map();
    this.cells = new Map();
    // Bounds are asked for on every screening and never change once a run is
    // in, so they are worked out at the door rather than per query. The padded
    // box is kept as well, because removal has to visit the same cells the add
    // wrote to and recomputing it there would have to agree exactly.
    this.boxes = new Map();
    this.paddedBoxes = new Map();
  }

  /** How many runs the network holds. */
  get size() {
    return this.facilities.size;
  }

  /** Add one facility, building it first when handed a loose record. */
  add(raw) {
    const facility = raw && raw.path && Object.isFrozen(raw) ? raw : buildFacility(raw);
    if (this.facilities.has(facility.id)) {
      throw new FacilityError('the network already carries that facility id', { id: facility.id });
    }
    this.facilities.set(facility.id, facility);
    this.boxes.set(facility.id, boundsOf(facility.path));
    const padded = facilityBounds(facility);
    this.paddedBoxes.set(facility.id, padded);
    for (const key of this.cellKeys(padded)) {
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(facility.id);
      else this.cells.set(key, [facility.id]);
    }
    return facility;
  }

  /**
   * Take a facility out of the network and out of every grid cell it sits in.
   *
   * @returns {object|null} the facility that was removed, or null
   */
  remove(id) {
    const wanted = String(id ?? '').toUpperCase();
    const held = this.facilities.get(wanted) ?? null;
    if (held === null) return null;
    this.facilities.delete(wanted);
    const padded = this.paddedBoxes.get(wanted) ?? facilityBounds(held);
    this.boxes.delete(wanted);
    this.paddedBoxes.delete(wanted);
    for (const key of this.cellKeys(padded)) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      const kept = bucket.filter((entry) => entry !== wanted);
      if (kept.length === 0) this.cells.delete(key);
      else this.cells.set(key, kept);
    }
    return held;
  }

  /** Swap a facility for a new version of itself, keeping the index right. */
  replace(facility) {
    const built =
      facility && facility.path && Object.isFrozen(facility) ? facility : buildFacility(facility);
    this.remove(built.id);
    return this.add(built);
  }

  /** Add many facilities at once. */
  addAll(records) {
    return records.map((record) => this.add(record));
  }

  /** One facility by id, or null. */
  get(id) {
    return this.facilities.get(String(id ?? '').toUpperCase()) ?? null;
  }

  /** Every facility, in the order they were added. */
  all() {
    return [...this.facilities.values()];
  }

  /** Every facility of one type. */
  byType(type) {
    const wanted = String(type ?? '').toUpperCase();
    return this.all().filter((facility) => facility.type === wanted);
  }

  /** Every facility in one district. */
  byDistrict(district) {
    const wanted = String(district ?? '').toUpperCase();
    return this.all().filter((facility) => (facility.district ?? '').toUpperCase() === wanted);
  }

  /** The bounds of one run, worked out when it was added. */
  boundsOfFacility(id) {
    return this.boxes.get(String(id ?? '').toUpperCase()) ?? null;
  }

  /** Bounds covering the whole network, or null when it is empty. */
  bounds() {
    let box = null;
    for (const own of this.boxes.values()) {
      box = box === null ? own : boundsUnion(box, own);
    }
    return box;
  }

  /** The grid keys a bounds box touches. */
  cellKeys(box) {
    const keys = [];
    const southCell = Math.floor(box.south / this.cellDegrees);
    const northCell = Math.floor(box.north / this.cellDegrees);
    const westCell = Math.floor(box.west / this.cellDegrees);
    const eastCell = Math.floor(box.east / this.cellDegrees);
    for (let lat = southCell; lat <= northCell; lat += 1) {
      for (let lon = westCell; lon <= eastCell; lon += 1) {
        keys.push(`${lat}:${lon}`);
      }
    }
    return keys;
  }

  /**
   * How the index is sitting.
   *
   * A grid is only worth having while the average cell holds a handful of runs.
   * These are the numbers to look at when a network grows and screening slows
   * down, because the fix is the cell size and nothing else.
   */
  stats() {
    const occupancies = [...this.cells.values()].map((bucket) => bucket.length);
    const total = occupancies.reduce((sum, count) => sum + count, 0);
    return {
      facilities: this.facilities.size,
      cells: this.cells.size,
      entries: total,
      averagePerCell: this.cells.size === 0 ? 0 : total / this.cells.size,
      worstCell: occupancies.length === 0 ? 0 : Math.max(...occupancies),
      cellDegrees: this.cellDegrees,
    };
  }

  /** Candidate facilities whose cells a bounds box touches. */
  candidates(box) {
    const seen = new Set();
    const found = [];
    for (const key of this.cellKeys(box)) {
      for (const id of this.cells.get(key) ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        found.push(this.facilities.get(id));
      }
    }
    return found;
  }

  /** Facilities whose own bounds overlap the box. */
  within(box) {
    return this.candidates(box).filter((facility) =>
      boundsOverlap(this.boxes.get(facility.id), box)
    );
  }

  /**
   * Facilities within a distance of a point, nearest first.
   *
   * @returns {Array<{facility: object, metres: number}>}
   */
  near(value, metres) {
    if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0) {
      throw new FacilityError('a search radius must be at or above zero', { metres });
    }
    const box = expandBounds(boundsOf([value]), metres);
    const hits = [];
    for (const facility of this.candidates(box)) {
      const { metres: distance } = pointToPolyline(value, facility.path);
      if (distance <= metres) hits.push({ facility, metres: distance });
    }
    return hits.sort(
      (left, right) =>
        left.metres - right.metres || left.facility.id.localeCompare(right.facility.id)
    );
  }

  /** Facilities whose tolerance zone reaches into a ring. */
  intersecting(ring, extraMetres = 0) {
    const box = expandBounds(ringBounds(ring), extraMetres + 60);
    const hits = [];
    for (const facility of this.candidates(box)) {
      const reach = toleranceMetresOf(facility) + extraMetres;
      if (ringIntersectsPolyline(ring, facility.path)) {
        hits.push({ facility, metres: 0 });
        continue;
      }
      let best = Number.POSITIVE_INFINITY;
      for (const vertex of facility.path) {
        if (ringContains(ring, vertex)) {
          best = 0;
          break;
        }
      }
      if (best === 0) {
        hits.push({ facility, metres: 0 });
        continue;
      }
      const closest = closestApproach(ring, facility);
      if (closest <= reach) hits.push({ facility, metres: closest });
    }
    return hits.sort(
      (left, right) =>
        left.metres - right.metres || left.facility.id.localeCompare(right.facility.id)
    );
  }
}

function closestApproach(ring, facility) {
  let best = Number.POSITIVE_INFINITY;
  for (const vertex of ring) {
    const { metres } = pointToPolyline(vertex, facility.path);
    if (metres < best) best = metres;
  }
  return best;
}

/** Build a network straight from a list of loose records. */
export function buildNetwork(records, options = {}) {
  const network = new FacilityNetwork(options);
  network.addAll(records ?? []);
  return network;
}
