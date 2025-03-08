import { describe, expect, it } from 'vitest';
import {
  seeded,
  pick,
  makeFacilities,
  makeTickets,
  makeConfig,
} from '../../src/testing/generate.js';
import { buildNetwork } from '../../src/network/network.js';
import { buildTicket } from '../../src/ticket/record.js';
import { loadDesk } from '../../src/config/load.js';
import { validateConfig } from '../../src/config/schema.js';

describe('seeded', () => {
  it('gives the same run for the same seed', () => {
    const a = seeded(7);
    const b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('gives a different run for a different seed', () => {
    expect(seeded(7)()).not.toBe(seeded(8)());
  });

  it('stays inside the unit interval', () => {
    const random = seeded(3);
    for (let i = 0; i < 100; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('copes with a seed of zero', () => {
    expect(typeof seeded(0)()).toBe('number');
  });
});

describe('pick', () => {
  it('always picks from the list', () => {
    const random = seeded(5);
    for (let i = 0; i < 50; i += 1) {
      expect(['a', 'b', 'c']).toContain(pick(random, ['a', 'b', 'c']));
    }
  });
});

describe('makeFacilities', () => {
  it('makes what it was asked for', () => {
    const facilities = makeFacilities(50);
    expect(facilities).toHaveLength(50);
    expect(new Set(facilities.map((facility) => facility.id)).size).toBe(50);
  });

  it('makes records the network accepts', () => {
    const network = buildNetwork(makeFacilities(40));
    expect(network.size).toBe(40);
    expect(network.bounds()).not.toBeNull();
  });

  it('lays them out as a grid rather than on top of each other', () => {
    const network = buildNetwork(makeFacilities(64));
    const box = network.bounds();
    expect(box.north - box.south).toBeGreaterThan(0.005);
    expect(box.east - box.west).toBeGreaterThan(0.005);
  });

  it('repeats for the same seed', () => {
    expect(makeFacilities(10, { seed: 4 })).toEqual(makeFacilities(10, { seed: 4 }));
  });
});

describe('makeTickets', () => {
  it('makes records the ticket builder accepts', () => {
    const tickets = makeTickets(30).map(buildTicket);
    expect(tickets).toHaveLength(30);
    expect(new Set(tickets.map((ticket) => ticket.number)).size).toBe(30);
  });

  it('spreads them over the days it was given', () => {
    const days = new Set(makeTickets(60, { days: 5 }).map((ticket) => ticket.takenAt.slice(0, 10)));
    expect(days.size).toBeGreaterThan(1);
    expect(days.size).toBeLessThanOrEqual(5);
  });

  it('gives every ticket geometry and an extent', () => {
    for (const ticket of makeTickets(20)) {
      expect(ticket.site.points).toHaveLength(1);
      expect(ticket.extent).toMatch(/\d+ feet/);
    }
  });

  it('repeats for the same seed', () => {
    expect(makeTickets(10, { seed: 9 })).toEqual(makeTickets(10, { seed: 9 }));
  });
});

describe('makeConfig', () => {
  it('makes a configuration that validates', () => {
    expect(validateConfig(makeConfig()).errors).toEqual([]);
  });

  it('makes a desk that loads with the generated plant', () => {
    const desk = loadDesk(makeConfig(), { facilities: makeFacilities(25) });
    expect(desk.network.size).toBe(25);
    expect(desk.districts).toHaveLength(1);
  });

  it('covers the ground the tickets are made on', () => {
    const desk = loadDesk(makeConfig(), { facilities: makeFacilities(25) });
    const box = desk.districts[0].boundary;
    expect(box).toHaveLength(5);
  });
});
