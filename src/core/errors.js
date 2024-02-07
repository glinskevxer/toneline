/**
 * Error types shared by every layer of toneline.
 *
 * Everything thrown on purpose carries a stable `code` so the CLI can map a
 * failure onto an exit status without matching on message text, and a `details`
 * bag that reporting can render without re-parsing anything.
 */

/** Base class for every deliberate failure raised inside the library. */
export class TonelineError extends Error {
  /**
   * @param {string} code stable machine readable identifier
   * @param {string} message human readable description
   * @param {object} [details] structured context for the caller
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }

  /** Render the error as a plain object suitable for JSON output. */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/** Raised when an operator configuration file cannot be used as given. */
export class ConfigError extends TonelineError {
  constructor(message, details = {}) {
    super('CONFIG_INVALID', message, details);
  }
}

/** Raised when a one call centre transmission cannot be read. */
export class FeedParseError extends TonelineError {
  constructor(message, details = {}) {
    super('FEED_UNREADABLE', message, details);
  }
}

/** Raised when a ticket is structurally wrong or missing a required field. */
export class TicketError extends TonelineError {
  constructor(message, details = {}) {
    super('TICKET_INVALID', message, details);
  }
}

/** Raised when a lawful start or response clock cannot be computed. */
export class ScheduleError extends TonelineError {
  constructor(message, details = {}) {
    super('SCHEDULE_UNRESOLVED', message, details);
  }
}

/** True when the value is one of our own errors rather than a runtime fault. */
export function isTonelineError(value) {
  return value instanceof TonelineError;
}

/**
 * Wrap an unknown thrown value so callers always get a TonelineError.
 * Native faults keep their message but gain the INTERNAL code.
 */
export function asTonelineError(value, fallbackMessage = 'unexpected failure') {
  if (isTonelineError(value)) return value;
  if (value instanceof Error) {
    return new TonelineError('INTERNAL', value.message || fallbackMessage, {
      cause: value.name,
    });
  }
  return new TonelineError('INTERNAL', fallbackMessage, { thrown: String(value) });
}
