/**
 * Contact details.
 *
 * Phone numbers arrive typed by whoever took the call and have to be dialled by
 * somebody standing in a hole, so they are reduced to digits and formatted back
 * one way. Email is only checked far enough to know it will not bounce for a
 * silly reason.
 */

const EXTENSION = /(?:\bx|\bext\.?|\bextension)\s*(\d{1,6})\s*$/i;

/** The digits in a phone number, with any extension taken off first. */
export function phoneDigits(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(EXTENSION, '');
  return text.replace(/\D/g, '');
}

/** The extension on a phone number, or null. */
export function phoneExtension(value) {
  if (value === null || value === undefined) return null;
  const match = EXTENSION.exec(String(value));
  return match ? match[1] : null;
}

/**
 * Format a phone number the way the desk prints it.
 *
 * Ten digits become `405 555 0148`. Eleven starting with a one lose the one.
 * Anything else is handed back squashed rather than mangled into a shape it is
 * not, because a wrong number printed confidently is worse than an odd one.
 */
export function formatPhone(value) {
  const digits = phoneDigits(value);
  const extension = phoneExtension(value);
  const core = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const body =
    core.length === 10
      ? `${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`
      : String(value ?? '').trim();
  return extension === null ? body : `${body} x${extension}`;
}

/** True when two numbers would reach the same telephone. */
export function samePhone(left, right) {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  if (a === '' || b === '') return false;
  return normaliseDigits(a) === normaliseDigits(b);
}

function normaliseDigits(digits) {
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/** True when the number has enough digits to dial. */
export function isDiallable(value) {
  const digits = normaliseDigits(phoneDigits(value));
  return digits.length === 10;
}

const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** True when the address is at least the right shape. */
export function isEmail(value) {
  return typeof value === 'string' && EMAIL.test(value.trim());
}

/** An email address lower cased and trimmed. */
export function normaliseEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Tidy a contact block, keeping what is usable and saying what is not.
 *
 * @returns {{name: string|null, phone: string|null, email: string|null, problems: string[]}}
 */
export function tidyContact(raw) {
  const problems = [];
  const name = typeof raw?.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : null;
  if (name === null) problems.push('no contact name was given');
  let phone = null;
  if (raw?.phone === undefined || raw?.phone === null || String(raw.phone).trim() === '') {
    problems.push('no phone number was given');
  } else if (!isDiallable(raw.phone)) {
    problems.push('the phone number does not have enough digits to dial');
  } else {
    phone = formatPhone(raw.phone);
  }
  let email = null;
  if (raw?.email !== undefined && raw?.email !== null && String(raw.email).trim() !== '') {
    if (isEmail(raw.email)) email = normaliseEmail(raw.email);
    else problems.push('the email address is not the right shape');
  }
  return { name, phone, email, problems };
}
