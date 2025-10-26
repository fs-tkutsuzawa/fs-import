// Dynamic text sanitizer for labels fetched from DB (GA/UA names).
// Heuristics only: no fixed dictionary.

// Basic Japanese character detection
export function looksJapanese(s: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf\uff66-\uff9f]/.test(s);
}

function normalizeAndClean(input: string): string {
  let s = input ?? '';
  try {
    s = s.normalize('NFC');
  } catch {}
  // Remove replacement chars and control chars (except tab/newline/cr)
  s = s
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Collapse long sequences of question marks or weird glyphs
  s = s.replace(/\?{2,}/g, '?');
  return s;
}

function tooManyUnknowns(s: string): boolean {
  if (!s) return true;
  const unknowns = (s.match(/[?�]/g) || []).length; // common mojibake marks
  return unknowns > Math.max(2, Math.floor(s.length * 0.2));
}

function startCaseFromCode(code?: string): string {
  if (!code) return '';
  return code
    .split(/[\-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Public API: produce a sanitized display label.
// - Prefer a cleaned original if it appears valid.
// - If the cleaned label still looks broken (no Japanese and many unknowns),
//   fall back to a readable label derived from the provided code.
export function sanitizeLabel(
  original: string | null | undefined,
  codeHint?: string
): string {
  const cleaned = normalizeAndClean(original || '');
  const looksOk =
    cleaned && (looksJapanese(cleaned) || !tooManyUnknowns(cleaned));
  if (looksOk) return cleaned;
  const fromCode = startCaseFromCode(codeHint);
  return fromCode || cleaned;
}
