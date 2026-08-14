// TSV/CSV export utility — generates a Blob and triggers download in the browser.

/**
 * Convert an array of row objects into TSV (tab-separated values) text.
 * - Header row from the first row's keys (or explicit `columns` order).
 * - Values are stringified, with tabs/newlines/tabs escaped.
 */
export function toTsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: (keyof T)[],
): string {
  if (rows.length === 0) return ''
  const cols = columns ?? (Object.keys(rows[0]) as (keyof T)[])
  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  }
  const header = cols.map((c) => escape(String(c))).join('\t')
  const body = rows
    .map((r) => cols.map((c) => escape(r[c])).join('\t'))
    .join('\n')
  return `${header}\n${body}`
}

/**
 * Convert an array of row objects into CSV text (RFC 4180 compliant quoting).
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: (keyof T)[],
): string {
  if (rows.length === 0) return ''
  const cols = columns ?? (Object.keys(rows[0]) as (keyof T)[])
  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    // Quote if contains comma, quote, or newline
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = cols.map((c) => escape(String(c))).join(',')
  const body = rows
    .map((r) => cols.map((c) => escape(r[c])).join(','))
    .join('\n')
  return `${header}\n${body}`
}

/**
 * Trigger a browser download of text content with the given filename.
 * Safe to call from client-side event handlers.
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  if (typeof window === 'undefined') return
  // Prepend BOM for Excel-friendly UTF-8 (TSV/CSV with CJK characters)
  const blob = new Blob(['\uFEFF' + content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay to ensure download started
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Convenience: build TSV from rows and download as `.tsv` file. */
export function downloadTsv<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  columns?: (keyof T)[],
): void {
  downloadTextFile(toTsv(rows, columns), filename, 'text/tab-separated-values;charset=utf-8')
}

/** Convenience: build CSV from rows and download as `.csv` file. */
export function downloadCsv<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  columns?: (keyof T)[],
): void {
  downloadTextFile(toCsv(rows, columns), filename, 'text/csv;charset=utf-8')
}
