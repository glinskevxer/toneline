/**
 * The public surface.
 *
 * Everything a caller needs to run a locate desk without reaching into the
 * layout of the source tree. The internals are free to move; this list is the
 * promise. Anything not here is not promised, and the command line uses the
 * deep paths on purpose so it stays honest about which of the two it is.
 */

export {
  TonelineError,
  ConfigError,
  FeedParseError,
  TicketError,
  ScheduleError,
  isTonelineError,
  asTonelineError,
} from './core/errors.js';
export { FieldError } from './core/fields.js';
export { fixedClock, systemClock, steppingClock } from './core/clock.js';
export {
  parseTicketNumber,
  formatTicketNumber,
  baseTicketNumber,
  sameExcavation,
  nextRevision,
} from './core/ids.js';

export { Calendar } from './time/calendar.js';
export { WorkSchedule } from './time/workhours.js';
export { holidayList, holidayPreset, HOLIDAY_PRESETS } from './time/holidays.js';
export { parseCentreDate, parseCentreStamp, formatCentreStamp } from './time/formats.js';

export { buildTicket, describeTicket, needsMarking, siteKey } from './ticket/record.js';
export { parseTicket, parseTicketBatch } from './ticket/parse.js';
export { effectiveLawfulStart, lawfulStartFrom, mayDigAt } from './ticket/lawfulStart.js';
export { effectiveExpiry, isExpiredOn, lifePolicy, renewalWindow } from './ticket/expiry.js';
export { workAreaFor, sitePolicy } from './ticket/site.js';
export { orderQueue, scoreTicket } from './ticket/priority.js';
export { findDuplicates, groupDuplicates } from './ticket/duplicate.js';
export { familyOf, workingTicket } from './ticket/relate.js';
export { checkTicket, checkTickets } from './ticket/validate.js';
export { search, findOne } from './ticket/search.js';

export { buildFacility, toleranceFeetOf } from './network/facility.js';
export { FacilityNetwork, buildNetwork } from './network/network.js';
export { buildDistricts, districtsForRing } from './network/district.js';
export { applyChange, buildChange, ticketsAffected } from './network/changes.js';
export { checkNetwork, networkProfile } from './network/quality.js';

export { screenTicket, screenBatch, screenPolicy } from './screening/screen.js';
export { explainScreening, explanationText } from './screening/explain.js';
export { rescreenTicket, rescreenBatch } from './screening/rescreen.js';
export { coverageReport } from './screening/coverage.js';

export { responseCode, RESPONSE_CODES } from './response/codes.js';
export { buildResponse, latestResponse } from './response/post.js';
export { recommendResponse, recommendByScope } from './response/decide.js';
export { responseDueAt, isOnTime, clockPolicy } from './response/clock.js';
export { evaluateCompliance, complianceSummary } from './response/compliance.js';
export { amendResponse, effectiveResponses } from './response/amend.js';
export { answerTicket, answerBatch } from './response/session.js';
export { remindersDue } from './response/reminder.js';
export { renderBatch, parseAcknowledgement } from './response/transmit.js';

export { buildRoster, qualifiedFor } from './dispatch/locator.js';
export { assignTicket, assignBatch } from './dispatch/assign.js';
export { planRoute, routeSummary } from './dispatch/route.js';
export { assessEscalation, escalations } from './dispatch/escalation.js';
export { reassign, coverFor } from './dispatch/reassign.js';
export { planDay, whoIsFree } from './dispatch/capacity.js';
export { buildTimeEntry, daySummary } from './dispatch/timesheet.js';

export { buildDamage, isReportable } from './damage/report.js';
export { classifyDamage, causeCounts } from './damage/rootCause.js';
export { buildCostSheet, buildClaim } from './damage/cost.js';
export { buildInvestigation, investigationStatus } from './damage/investigation.js';
export { damageSummary, damageRate } from './damage/stats.js';
export { buildDamageRegister, writeDamageRegisterCsv } from './damage/register.js';
export { noticesFor } from './damage/notice.js';

export { buildRates, priceTicket } from './billing/rates.js';
export { buildInvoice, invoiceByType } from './billing/invoice.js';
export { buildCreditNote, creditTerms } from './billing/credits.js';
export { reconcile, readStatement } from './billing/statement.js';
export { closePeriod, billingPeriodFor } from './billing/period.js';

export { ageTickets, bucketCounts, openTickets } from './reporting/aging.js';
export { deskIndicators } from './reporting/kpi.js';
export { buildRegister, writeRegisterCsv } from './reporting/register.js';
export { buildBrief, briefHeadline } from './reporting/brief.js';
export { monthlyPack, packLines } from './reporting/monthly.js';
export { trend, trendLine } from './reporting/trend.js';
export { densityMap, hotCells } from './reporting/density.js';
export { renderTable, renderPairs } from './reporting/table.js';

export { AuditTrail, auditEntry } from './audit/trail.js';
export { ticketStory, actorActivity } from './audit/report.js';
export { chain, chainHead, verifyChain, sealTrail } from './audit/chain.js';

export { TicketStore } from './store/tickets.js';
export { ResponseStore } from './store/responses.js';
export { DeskBook, openBook } from './store/book.js';
export { openBookFile, saveBookFile } from './store/file.js';

export { validateConfig, assertConfig } from './config/schema.js';
export { loadDesk, screeningContext, schedulingContext, expiryContext } from './config/load.js';
export { definePolicy } from './config/policies.js';
