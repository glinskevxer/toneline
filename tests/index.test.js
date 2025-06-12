import { describe, expect, it } from 'vitest';
import * as toneline from '../src/index.js';

describe('the public surface', () => {
  it('exports something from every layer', () => {
    for (const name of [
      'TonelineError',
      'Calendar',
      'buildTicket',
      'buildNetwork',
      'screenTicket',
      'responseCode',
      'assignTicket',
      'buildDamage',
      'buildInvoice',
      'buildBrief',
      'AuditTrail',
      'DeskBook',
      'loadDesk',
    ]) {
      expect(toneline[name], name).toBeDefined();
    }
  });

  it('exports the same object the deep path does', async () => {
    const { buildTicket } = await import('../src/ticket/record.js');
    expect(toneline.buildTicket).toBe(buildTicket);
  });

  it('exports nothing twice under the same name', () => {
    const names = Object.keys(toneline);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is a working library on its own', () => {
    const ticket = toneline.buildTicket({
      number: 'B240315000420',
      type: 'NORMAL',
      takenAt: '2024-03-13T09:00',
      address: '1420 NW 23RD ST',
    });
    const calendar = new toneline.Calendar();
    expect(toneline.effectiveLawfulStart(ticket, { calendar })).toBe('2024-03-15T09:00');
    expect(toneline.describeTicket(ticket)).toContain('B240315000420');
  });

  it('carries enough of a surface to be worth having', () => {
    expect(Object.keys(toneline).length).toBeGreaterThan(100);
  });
});
