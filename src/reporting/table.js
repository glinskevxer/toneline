/**
 * Text tables.
 *
 * Everything this desk prints goes to a terminal, so reports render as plain
 * columns with no drawing characters. Numbers sit right, text sits left, and a
 * cell too wide for its column is cut with an ellipsis rather than wrapped,
 * because a wrapped row stops the eye reading down the column.
 */

const ELLIPSIS = '…';

/** Render a value as the text that goes in a cell. */
export function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

/** Cut a string to a width, marking that something was dropped. */
export function truncate(text, width) {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width === 1) return ELLIPSIS;
  return text.slice(0, width - 1) + ELLIPSIS;
}

/** Pad a string out to a width on the left or the right. */
export function pad(text, width, align = 'left') {
  const cut = truncate(text, width);
  const gap = width - cut.length;
  if (gap <= 0) return cut;
  return align === 'right' ? ' '.repeat(gap) + cut : cut + ' '.repeat(gap);
}

/**
 * Render rows as a plain text table.
 *
 * @param {object[]} rows the records to render
 * @param {Array<{key: string, label?: string, align?: string, width?: number}>} columns
 * @param {object} [options]
 * @param {string} [options.gap] the separator between columns
 * @param {boolean} [options.rule] draw a rule under the header
 * @returns {string} the table, with a trailing newline
 */
export function renderTable(rows, columns, options = {}) {
  const { gap = '  ', rule = true } = options;
  if (columns.length === 0) return '';
  const prepared = columns.map((column) => {
    const label = column.label ?? column.key;
    const values = rows.map((row) => cellText(row[column.key]));
    const natural = Math.max(label.length, ...values.map((value) => value.length), 0);
    return {
      ...column,
      label,
      values,
      width: column.width ?? natural,
      align: column.align ?? 'left',
    };
  });
  const lines = [];
  lines.push(
    prepared
      .map((column) => pad(column.label, column.width, column.align))
      .join(gap)
      .trimEnd()
  );
  if (rule) {
    lines.push(
      prepared
        .map((column) => '-'.repeat(column.width))
        .join(gap)
        .trimEnd()
    );
  }
  for (let i = 0; i < rows.length; i += 1) {
    lines.push(
      prepared
        .map((column) => pad(column.values[i], column.width, column.align))
        .join(gap)
        .trimEnd()
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Render a set of name and value pairs, one per line. */
export function renderPairs(pairs, options = {}) {
  const { gap = '  ' } = options;
  const entries = Array.isArray(pairs) ? pairs : Object.entries(pairs);
  if (entries.length === 0) return '';
  const width = Math.max(...entries.map(([name]) => String(name).length));
  return `${entries
    .map(([name, value]) => `${pad(String(name), width)}${gap}${cellText(value)}`)
    .join('\n')}\n`;
}

/** A heading with a rule under it. */
export function renderHeading(text) {
  return `${text}\n${'='.repeat(text.length)}\n`;
}

/** Join sections with one blank line between them. */
export function joinSections(sections) {
  return sections.filter((section) => section !== '' && section !== null).join('\n');
}
