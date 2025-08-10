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

describe('the release', () => {
  it('exports the sealing helpers a caller needs to check a journal', () => {
    for (const name of ['chain', 'chainHead', 'verifyChain', 'sealTrail']) {
      expect(toneline[name], name).toBeDefined();
    }
  });

  it('exports a reader for both feed formats', () => {
    expect(toneline.parseTicketBatch).toBeDefined();
    expect(toneline.buildTicket).toBeDefined();
  });

  it('seals an empty trail the same way every time', () => {
    const first = toneline.chainHead([]);
    expect(toneline.chainHead([])).toBe(first);
    expect(first).toMatch(/^0{64}$/);
  });

  it('verifies a chain it built itself', () => {
    const entries = [
      toneline.auditEntry({
        at: '2024-03-15T08:00',
        subject: 'B240315000420',
        action: 'screened',
        by: 'kmartel',
      }),
    ];
    expect(toneline.verifyChain(toneline.chain(entries)).sound).toBe(true);
  });

  it('runs a ticket from text to a recommendation through the public surface', () => {
    const block = [
      'TICKET NUMBER: B240315000420',
      'TRANSMISSION: NORMAL',
      'TAKEN: 03/15/2024 07:42',
      'ADDRESS: 1420 NW 23RD ST',
      'EXTENT: EAST 20 FEET',
      'GRIDS: 35.4676,-97.5164',
    ].join('\n');
    const { tickets } = toneline.parseTicketBatch(block);
    const network = toneline.buildNetwork([
      {
        id: 'GM-1',
        type: 'gas',
        path: [
          { lat: 35.4676, lon: -97.5164 },
          { lat: 35.4676, lon: -97.5144 },
        ],
      },
    ]);
    const screening = toneline.screenTicket(tickets[0], { network });
    expect(screening.conflict).toBe(true);
    expect(toneline.recommendResponse(tickets[0], screening).code).toBe('7');
  });
});
