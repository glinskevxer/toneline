import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDesk, readFeed } from '../../src/cli/context.js';
import { screeningContext, schedulingContext } from '../../src/config/load.js';
import { screenTicket } from '../../src/screening/screen.js';
import { answerBatch } from '../../src/response/session.js';
import { buildRoster } from '../../src/dispatch/locator.js';
import { assignBatch } from '../../src/dispatch/assign.js';
import { evaluateBatch, complianceSummary } from '../../src/response/compliance.js';
import { buildInvoice } from '../../src/billing/invoice.js';
import { buildCreditNote } from '../../src/billing/credits.js';
import { buildBrief } from '../../src/reporting/brief.js';
import { buildRegister } from '../../src/reporting/register.js';
import { DeskBook } from '../../src/store/book.js';
import { deskIndicators } from '../../src/reporting/kpi.js';
import { responseDueAt } from '../../src/response/clock.js';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', '..', 'examples');
const desk = openDesk(join(examples, 'cross-timbers.json')).desk;
const tickets = readFeed(join(examples, 'march-2024.feed')).tickets;

const roster = buildRoster([
  { id: 'loc-14', skills: ['gas', 'water'], districts: ['central'], dailyCapacity: 6 },
  { id: 'loc-22', skills: ['gas', 'water', 'electric'], dailyCapacity: 6 },
]);

const AT = '2024-03-19T08:00';

function runDay() {
  const context = screeningContext(desk);
  const screenings = tickets.map((ticket) => screenTicket(ticket, context));
  const pairs = tickets.map((ticket, index) => ({ ticket, screening: screenings[index] }));
  const dispatched = assignBatch(pairs, { roster, at: AT, by: 'dispatch' });
  const session = answerBatch(tickets, { desk, at: AT, by: 'loc-14' });
  const compliance = evaluateBatch(
    tickets.map((ticket, index) => ({
      ticket,
      responses: session.postings,
      screening: screenings[index],
    })),
    { at: '2024-03-20T08:00', ...schedulingContext(desk) }
  );
  return { screenings, dispatched, session, compliance };
}

describe('a day on the desk', () => {
  const day = runDay();

  it('screens every ticket in the feed', () => {
    expect(day.screenings).toHaveLength(4);
    expect(day.screenings.filter((screening) => screening.ours)).toHaveLength(3);
  });

  it('hands the work out to qualified locators', () => {
    const placed = day.dispatched.results.filter((entry) => entry.assignment !== null);
    expect(placed.length).toBeGreaterThan(0);
    for (const entry of placed) {
      expect(['LOC-14', 'LOC-22']).toContain(entry.assignment.locatorId);
    }
  });

  it('does not hand out the ticket that is not ours', () => {
    const yukon = day.dispatched.results.find((entry) => entry.number === 'B240318000703');
    expect(yukon.assignment).toBeNull();
    expect(yukon.error).toMatch(/not ours to work/);
  });

  it('answers every ticket it screened', () => {
    expect(day.session.postings.length).toBeGreaterThanOrEqual(4);
    expect(day.session.held).toEqual([]);
  });

  it('measures compliance against the deadlines it worked out', () => {
    const summary = complianceSummary(day.compliance);
    expect(summary.tickets).toBe(4);
    expect(summary.answered).toBe(4);
    expect(summary.onTime + summary.late).toBe(4);
  });

  it('agrees with the clock about the emergency deadline', () => {
    const urgent = tickets.find((ticket) => ticket.type === 'EMERGENCY');
    const record = day.compliance.find((entry) => entry.number === urgent.number);
    expect(record.dueAt).toBe(responseDueAt(urgent, schedulingContext(desk)));
    expect(record.status).toBe('late');
  });
});

describe('what the day produces', () => {
  const day = runDay();

  it('bills the month the postings landed in', () => {
    const invoice = buildInvoice({
      period: '2024-03',
      tickets,
      responses: day.session.postings,
      rates: undefined,
    });
    expect(invoice.lines).toHaveLength(4);
    expect(invoice.total).toBeGreaterThan(0);
  });

  it('credits back the tickets that ran late', () => {
    const invoice = buildInvoice({ period: '2024-03', tickets, responses: day.session.postings });
    const note = buildCreditNote(invoice, day.compliance);
    expect(note.lines.length).toBeGreaterThan(0);
    expect(note.payable).toBeLessThan(invoice.total);
  });

  it('draws a brief that names the open work', () => {
    const brief = buildBrief({
      desk,
      tickets,
      at: AT,
      assignments: day.dispatched.assignments,
      responses: day.session.postings,
    });
    expect(brief.open).toBe(4);
    expect(brief.unassigned).toBe(1);
  });

  it('builds a register carrying the answers', () => {
    const rows = buildRegister(tickets, {
      responses: day.session.postings,
      calendar: desk.calendar,
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.responseCode !== null)).toBe(true);
  });

  it('reports the indicators the manager is judged on', () => {
    const kpi = deskIndicators({ period: '2024-03', tickets, compliance: day.compliance });
    expect(kpi.tickets).toBe(4);
    expect(kpi.emergencies).toBe(1);
    expect(kpi.onTimeRate).toBeGreaterThan(0);
    expect(kpi.meanTurnaroundMinutes).toBeGreaterThan(0);
  });
});

describe('writing the day down', () => {
  const day = runDay();

  it('goes into the book and comes back out again', () => {
    const book = new DeskBook();
    for (const ticket of tickets) book.addTicket(ticket);
    for (const posting of day.session.postings) book.addResponse(posting);
    for (const assignment of day.dispatched.assignments) book.addAssignment(assignment);
    book.note({ at: AT, subject: tickets[0].number, action: 'screened', by: 'kmartel' });

    const counts = book.counts();
    expect(counts.excavations).toBe(4);
    expect(counts.responses).toBe(day.session.postings.length);

    const again = new DeskBook(book.toJournal());
    expect(again.counts()).toEqual(counts);
    expect(again.fileFor(tickets[0].number).responses.length).toBeGreaterThan(0);
  });

  it('keeps the standing answer through the round trip', () => {
    const book = new DeskBook();
    for (const ticket of tickets) book.addTicket(ticket);
    for (const posting of day.session.postings) book.addResponse(posting);
    const before = book.responses.answerFor(tickets[0].number);
    const after = new DeskBook(book.toJournal()).responses.answerFor(tickets[0].number);
    expect(after.code).toBe(before.code);
    expect(after.at).toBe(before.at);
  });
});
