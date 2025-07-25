import { describe, expect, it } from 'vitest';
import { rowToTicket, readTicketCsv, writeTicketCsv } from '../../src/io/tickets.js';
import { FeedParseError } from '../../src/core/errors.js';
import { parseTicketBatch } from '../../src/ticket/parse.js';
import { readText } from '../../src/io/files.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');

const CSV = [
  'ticket,transmission,taken,place,address,work_type,excavator,phone,extent,members,grids',
  'B240315000420,NORMAL,03/15/2024 07:42,OKLAHOMA CITY,1420 NW 23RD ST,sewer repair,Digwell,405-555-0148,east 120 feet,CTG01 CTG02,"35.4676,-97.5150"',
  'B240316000421,EMERGENCY,03/16/2024 22:40,OKLAHOMA CITY,2200 N WALKER AVE,water main break,Sooner,405-555-0177,intersection,CTG01,',
].join('\n');

describe('rowToTicket', () => {
  it('reads the export columns', () => {
    const ticket = rowToTicket({
      ticket: 'B240315000420',
      transmission: 'NORMAL',
      taken: '03/15/2024 07:42',
      address: '1420 NW 23RD ST',
    });
    expect(ticket.number).toBe('B240315000420');
    expect(ticket.takenAt).toBe('2024-03-15T07:42');
  });

  it('reads the alternative column names', () => {
    const ticket = rowToTicket({
      ticket_number: 'B240315000420',
      ticket_type: 'NORMAL',
      taken_at: '03/15/2024 07:42',
      cross_street: 'N WALKER AVE',
    });
    expect(ticket.intersection).toBe('N WALKER AVE');
  });

  it('gathers the excavator block', () => {
    const ticket = rowToTicket({
      ticket: 'B240315000420',
      transmission: 'NORMAL',
      taken: '03/15/2024 07:42',
      address: 'x',
      excavator: 'Digwell',
      phone: '405-555-0148',
    });
    expect(ticket.excavator.company).toBe('Digwell');
    expect(ticket.excavator.phone).toBe('405 555 0148');
  });

  it('leaves the excavator null when the column is empty', () => {
    const ticket = rowToTicket({
      ticket: 'B240315000420',
      transmission: 'NORMAL',
      taken: '03/15/2024 07:42',
      address: 'x',
      excavator: '  ',
    });
    expect(ticket.excavator).toBeNull();
  });

  it('reads the optional dates when they are there', () => {
    const ticket = rowToTicket({
      ticket: 'B240315000420',
      transmission: 'NORMAL',
      taken: '03/15/2024 07:42',
      address: 'x',
      lawful_start: '03/19/2024 07:42',
      expires: '04/08/2024',
    });
    expect(ticket.lawfulStartAt).toBe('2024-03-19T07:42');
    expect(ticket.expiresOn).toBe('2024-04-08');
  });

  it('rejects a row with no number or no take time', () => {
    expect(() => rowToTicket({ transmission: 'NORMAL' })).toThrow(/no ticket number/);
    expect(() => rowToTicket({ ticket: 'B240315000420' })).toThrow(/no take time/);
  });
});

describe('readTicketCsv', () => {
  it('reads a whole export', () => {
    const { tickets, failures } = readTicketCsv(CSV);
    expect(tickets.map((ticket) => ticket.number)).toEqual(['B240315000420', 'B240316000421']);
    expect(tickets[0].members).toEqual(['CTG01', 'CTG02']);
    expect(tickets[0].site.points).toHaveLength(1);
    expect(tickets[1].site).toBeNull();
    expect(failures).toEqual([]);
  });

  it('names the row it could not read', () => {
    const bad = `${CSV}\nBAD,NORMAL,not a date,,,,,,,,`;
    try {
      readTicketCsv(bad);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FeedParseError);
      expect(err.details.row).toBe(4);
    }
  });

  it('collects failures when asked', () => {
    const bad = `${CSV}\nBAD,NORMAL,not a date,,,,,,,,`;
    const { tickets, failures } = readTicketCsv(bad, { skipBad: true });
    expect(tickets).toHaveLength(2);
    expect(failures).toHaveLength(1);
  });

  it('reads an empty export as nothing', () => {
    expect(readTicketCsv('')).toEqual({ tickets: [], failures: [] });
  });
});

describe('writeTicketCsv', () => {
  it('round trips the export', () => {
    const { tickets } = readTicketCsv(CSV);
    expect(readTicketCsv(writeTicketCsv(tickets)).tickets).toEqual(tickets);
  });

  it('round trips the worked feed through csv and back', () => {
    const { tickets } = parseTicketBatch(readText(join(examples, 'march-2024.feed')));
    const again = readTicketCsv(writeTicketCsv(tickets)).tickets;
    expect(again.map((ticket) => ticket.number)).toEqual(tickets.map((ticket) => ticket.number));
    expect(again[0].extent).toBe(tickets[0].extent);
    expect(again[0].site.points).toHaveLength(2);
  });

  it('writes a header with no rows', () => {
    expect(writeTicketCsv([]).split('\n')[0]).toContain('ticket,transmission,taken');
  });
});

describe('the timestamp columns', () => {
  it('writes the centre format the reader expects back', () => {
    const { tickets } = readTicketCsv(CSV);
    const text = writeTicketCsv(tickets);
    expect(text.split('\n')[1]).toContain('03/15/2024 07:42');
  });

  it('leaves an empty lawful start empty', () => {
    const { tickets } = readTicketCsv(CSV);
    expect(writeTicketCsv(tickets).split('\n')[1]).toContain(',,');
  });
});
