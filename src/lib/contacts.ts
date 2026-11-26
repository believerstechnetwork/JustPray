/* Reading a list of people from a spreadsheet: an Excel file (read with read-excel-file, loaded
   only when an organiser imports) or a CSV. Pure functions, so they are easy to test. */

export interface Contact {
  name: string;
  email: string;
}

export interface ParsedList {
  contacts: Contact[];
  /** Rows with no usable email address. */
  invalid: number;
  /** The same email more than once in the file; kept once. */
  duplicates: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Turn sheet rows (the first may be headings) into people. Finds the email column by its heading
 *  ("Email", "E-mail address") or, without headings, by its contents; the name comes from a
 *  "Name"/"Full name" column, or "First name" + "Last name". */
export function rowsToContacts(rows: unknown[][]): ParsedList {
  const table = rows.map((r) => r.map(cell)).filter((r) => r.some((c) => c !== ''));
  if (!table.length) return { contacts: [], invalid: 0, duplicates: 0 };

  const head = (table[0] ?? []).map((h) => h.toLowerCase());
  // A heading is a label, never an address: "email@example.com" in a first row of data is not
  // the heading "Email".
  const find = (re: RegExp): number => head.findIndex((h) => re.test(h) && !EMAIL_RE.test(h));
  let emailCol = find(/e-?mail/);
  const hasHeadings = emailCol >= 0;
  if (!hasHeadings) {
    // No headings: the email column is the one whose cells look most like email addresses.
    const width = Math.max(...table.map((r) => r.length));
    let best = -1;
    let bestHits = 0;
    for (let c = 0; c < width; c++) {
      const hits = table.filter((r) => EMAIL_RE.test(r[c] ?? '')).length;
      if (hits > bestHits) [best, bestHits] = [c, hits];
    }
    emailCol = best;
  }
  if (emailCol < 0) return { contacts: [], invalid: table.length, duplicates: 0 };

  const fullCol = hasHeadings ? find(/^(full\s*)?name$|^name\b|full name/) : -1;
  const firstCol = hasHeadings ? find(/first\s*name|given/) : -1;
  const lastCol = hasHeadings ? find(/last\s*name|surname|family/) : -1;
  // Without headings, the name is the first other column with text that is not an email.
  const guessName = (r: string[]): string =>
    r.find((c, i) => i !== emailCol && c && !EMAIL_RE.test(c)) ?? '';

  const seen = new Set<string>();
  const contacts: Contact[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const r of hasHeadings ? table.slice(1) : table) {
    const email = (r[emailCol] ?? '').toLowerCase().replace(/^mailto:/, '');
    if (!EMAIL_RE.test(email) || email.length > 254) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    let name = '';
    if (fullCol >= 0) name = r[fullCol] ?? '';
    else if (firstCol >= 0 || lastCol >= 0)
      name = [r[firstCol] ?? '', r[lastCol] ?? ''].filter(Boolean).join(' ');
    else if (!hasHeadings) name = guessName(r);
    contacts.push({ name: name.replace(/\s+/g, ' ').slice(0, 120), email });
  }
  return { contacts, invalid, duplicates };
}

/** Split CSV text into rows, handling quoted cells, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  // Drop the byte-order mark some spreadsheet apps put at the start of a CSV.
  const src = text.replace(/^\uFEFF/, '');
  // Semicolons separate cells in some regions' spreadsheet exports. Count each in the first
  // record, outside quotes, so a quoted "Obi, Ada" does not decide it.
  let commas = 0;
  let semis = 0;
  for (let i = 0, q = false; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') q = !q;
    else if (!q && (ch === '\n' || ch === '\r')) break;
    else if (!q && ch === ',') commas++;
    else if (!q && ch === ';') semis++;
  }
  const sep = semis > commas ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** Read a chosen file: .xlsx with read-excel-file (loaded on demand), .csv as text. */
export async function readContactsFile(file: File): Promise<ParsedList> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv')
    return rowsToContacts(parseCsv(await file.text()));
  const { readSheet } = await import('read-excel-file/browser');
  return rowsToContacts((await readSheet(file)) as unknown[][]);
}
