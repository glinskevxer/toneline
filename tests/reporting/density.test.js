import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CELL_DEGREES,
  cellKey,
  cellBounds,
  bin,
  densityMap,
  busiestCells,
  hotCells,
} from '../../src/reporting/density.js';
import { buildTicket } from '../../src/ticket/record.js';
import { buildDamage } from '../../src/damage/report.js';

const A = { lat: 35.4676, lon: -97.5164 };
const FAR = { lat: 35.5276, lon: -97.4564 };

function ticket(number, point = A) {
  return buildTicket({
    number,
    type: 'NORMAL',
    takenAt: '2024-03-15T09:00',
    address: 'somewhere',
    extent: '20 feet',
    site: { points: [point] },
  });
}

function damage(id, point = A) {
  return buildDamage({
    id,
    at: '2024-03-19T10:25',
    facilityType: 'gas',
    reportedBy: 'loc-1',
    point,
  });
}

describe('cellKey and cellBounds', () => {
  it('puts nearby points in the same cell', () => {
    expect(cellKey(A)).toBe(cellKey({ lat: A.lat + 0.001, lon: A.lon + 0.001 }));
  });

  it('puts distant points in different cells', () => {
    expect(cellKey(A)).not.toBe(cellKey(FAR));
  });

  it('honours a different cell size', () => {
    expect(cellKey(A, 1)).toBe('35:-98');
    expect(DEFAULT_CELL_DEGREES).toBe(0.01);
  });

  it('turns a key back into bounds that hold the point', () => {
    const box = cellBounds(cellKey(A));
    expect(A.lat).toBeGreaterThanOrEqual(box.south);
    expect(A.lat).toBeLessThan(box.north);
    expect(A.lon).toBeGreaterThanOrEqual(box.west);
    expect(A.lon).toBeLessThan(box.east);
  });
});

describe('bin', () => {
  it('adds the weights in each cell', () => {
    const cells = bin([{ point: A }, { point: A, weight: 3 }, { point: FAR }]);
    expect(cells.get(cellKey(A))).toBe(4);
    expect(cells.get(cellKey(FAR))).toBe(1);
  });

  it('skips a missing point', () => {
    expect(bin([{ point: null }, { point: undefined }]).size).toBe(0);
  });
});

describe('densityMap', () => {
  const tickets = [ticket('B240315000420'), ticket('B240315000421'), ticket('B240315000422', FAR)];
  const damages = [damage('d1'), damage('d2', FAR)];

  it('bins the tickets and the damages onto the same grid', () => {
    const map = densityMap({ tickets, damages });
    expect(map.cells).toHaveLength(2);
    const busy = map.cells.find((cell) => cell.tickets === 2);
    expect(busy.damages).toBe(1);
    expect(busy.ratePerThousand).toBe(500);
  });

  it('counts the tickets it could not place', () => {
    const bare = buildTicket({
      number: 'B240315000423',
      type: 'NORMAL',
      takenAt: '2024-03-15T09:00',
      address: 'no grids',
    });
    const map = densityMap({ tickets: [...tickets, bare] });
    expect(map.placed).toBe(3);
    expect(map.unplaced).toBe(1);
  });

  it('reports a cell with damages and no tickets without dividing by zero', () => {
    const map = densityMap({ tickets: [], damages: [damage('d1')] });
    expect(map.cells[0].ratePerThousand).toBe(0);
    expect(map.cells[0].damages).toBe(1);
  });

  it('reports bounds covering every cell', () => {
    const map = densityMap({ tickets, damages });
    expect(map.bounds.north).toBeGreaterThan(map.bounds.south);
    expect(densityMap({}).bounds).toBeNull();
  });

  it('honours a bigger cell', () => {
    const map = densityMap({ tickets, damages, cellDegrees: 1 });
    expect(map.cells).toHaveLength(1);
    expect(map.cells[0].tickets).toBe(3);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(densityMap({ tickets }))).toBe(true);
  });
});

describe('busiestCells and hotCells', () => {
  const map = densityMap({
    tickets: [ticket('B240315000420'), ticket('B240315000421'), ticket('B240315000422', FAR)],
    damages: [damage('d1'), damage('d2', FAR), damage('d3', FAR)],
  });

  it('ranks the busiest cells', () => {
    expect(busiestCells(map, 1)[0].tickets).toBe(2);
    expect(busiestCells(map)).toHaveLength(2);
    expect(busiestCells(map, 0)).toEqual([]);
  });

  it('finds the cells running hot', () => {
    const hot = hotCells(map, 1000);
    expect(hot).toHaveLength(1);
    expect(hot[0].ratePerThousand).toBe(2000);
  });

  it('finds nothing hot when nothing was hit', () => {
    expect(hotCells(densityMap({ tickets: [ticket('B240315000420')] }))).toEqual([]);
  });
});
