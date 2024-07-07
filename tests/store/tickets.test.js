import { describe, expect, it } from 'vitest';
import { TicketStore } from '../../src/store/tickets.js';
import { buildTicket } from '../../src/ticket/record.js';
import { TicketError } from '../../src/core/errors.js';

function raw(overrides = {}) {
  return {
    number: 'B240315000420',
    type: 'NORMAL',
    takenAt: '2024-03-15T07:42',
    address: '1420 NW 23RD ST',
    place: 'Oklahoma City',
    ...overrides,
  };
}

describe('TicketStore', () => {
  it('counts excavations and versions apart', () => {
    const store = new TicketStore([
      raw(),
      raw({ number: 'B240315000420-01', type: 'UPDATE' }),
      raw({ number: 'B240315000421' }),
    ]);
    expect(store.size).toBe(2);
    expect(store.versionCount).toBe(3);
  });

  it('starts empty', () => {
    expect(new TicketStore().size).toBe(0);
    expect(new TicketStore().current()).toEqual([]);
  });

  it('accepts an already built ticket', () => {
    const store = new TicketStore();
    const ticket = buildTicket(raw());
    expect(store.put(ticket)).toBe(ticket);
  });

  it('replaces a version that arrives twice', () => {
    const store = new TicketStore([raw()]);
    store.put(raw({ remarks: 'gate code 4412' }));
    expect(store.versionCount).toBe(1);
    expect(store.latest('B240315000420').remarks).toBe('gate code 4412');
  });

  it('keeps revisions in order however they arrive', () => {
    const store = new TicketStore([
      raw({ number: 'B240315000420-02', type: 'UPDATE' }),
      raw(),
      raw({ number: 'B240315000420-01', type: 'UPDATE' }),
    ]);
    expect(store.history('B240315000420').map((t) => t.revision)).toEqual([0, 1, 2]);
    expect(store.latest('B240315000420').revision).toBe(2);
  });

  it('finds an excavation from any of its revision numbers', () => {
    const store = new TicketStore([raw(), raw({ number: 'B240315000420-01', type: 'UPDATE' })]);
    expect(store.latest('B240315000420-01').revision).toBe(1);
    expect(store.has('b240315000420-99')).toBe(true);
    expect(store.has('B240315000999')).toBe(false);
  });

  it('gets one exact version', () => {
    const store = new TicketStore([raw(), raw({ number: 'B240315000420-01', type: 'UPDATE' })]);
    expect(store.get('B240315000420').revision).toBe(0);
    expect(store.get('B240315000420-01').revision).toBe(1);
    expect(store.get('B240315000420-05')).toBeNull();
  });

  it('has nothing to say about an excavation it does not hold', () => {
    const store = new TicketStore();
    expect(store.history('B240315000420')).toEqual([]);
    expect(store.latest('B240315000420')).toBeNull();
  });

  it('lists the current version of every excavation', () => {
    const store = new TicketStore([
      raw({ number: 'B240315000421' }),
      raw(),
      raw({ number: 'B240315000420-01', type: 'UPDATE' }),
    ]);
    expect(store.current().map((t) => t.number)).toEqual(['B240315000420-01', 'B240315000421']);
  });

  it('filters by status and by the day the call was taken', () => {
    const store = new TicketStore([
      raw(),
      raw({ number: 'B240316000422', takenAt: '2024-03-16T09:00', status: 'SCREENED' }),
    ]);
    expect(store.byStatus('screened').map((t) => t.number)).toEqual(['B240316000422']);
    expect(store.byStatus('RECEIVED')).toHaveLength(1);
    expect(store.takenOn('2024-03-16')).toHaveLength(1);
    expect(store.takenOn('2024-03-17')).toEqual([]);
  });

  it('finds other tickets at the same place', () => {
    const store = new TicketStore([
      raw(),
      raw({ number: 'B240316000422', address: '1420 northwest 23 street' }),
      raw({ number: 'B240316000423', address: '99 Robinson Ave' }),
    ]);
    expect(store.atSameSite('B240315000420').map((t) => t.number)).toEqual(['B240316000422']);
    expect(store.atSameSite('B240316000423')).toEqual([]);
  });

  it('refuses to look up a site for a ticket it does not hold', () => {
    expect(() => new TicketStore().atSameSite('B240315000420')).toThrow(TicketError);
  });

  it('orders by when the call was taken', () => {
    const store = new TicketStore([
      raw({ number: 'B240316000422', takenAt: '2024-03-16T09:00' }),
      raw(),
    ]);
    expect(store.inTakenOrder().map((t) => t.number)).toEqual(['B240315000420', 'B240316000422']);
  });

  it('writes every version out in a stable order', () => {
    const store = new TicketStore([
      raw({ number: 'B240315000421' }),
      raw({ number: 'B240315000420-01', type: 'UPDATE' }),
      raw(),
    ]);
    expect(store.toJSON().map((t) => t.number)).toEqual([
      'B240315000420',
      'B240315000420-01',
      'B240315000421',
    ]);
  });

  it('adds many at once', () => {
    const store = new TicketStore();
    expect(store.putAll([raw(), raw({ number: 'B240315000421' })])).toHaveLength(2);
  });
});
