type ExtractedPeriodType = 'Yearly' | 'Monthly' | 'Event';
type ExtractedAfType = 'Actual' | 'Forecast';

export interface ExtractedTimelineEntry {
  period_label: string;
  period_type: ExtractedPeriodType;
  af_type: ExtractedAfType;
  period_val: string | null;
  display_order: number;
}

type LegacyImportDf = {
  periods?: string[];
};

const normalizeLabel = (label: string): string => {
  const trimmed = label.trim();
  if (/^FY\d{4}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const yearMatch = trimmed.match(/(\d{4})/);
  if (yearMatch) {
    return `FY${yearMatch[1]}`;
  }

  return trimmed;
};

const isEolToken = (label: string): boolean => {
  return label.trim().toUpperCase() === 'EOL';
};

const toIsoDate = (date: Date) => {
  return date.toISOString().slice(0, 10);
};

const normalizePeriodVal = (rawLabel: string): string | null => {
  const trimmed = rawLabel.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^FY\d{4}$/i.test(trimmed)) {
    const year = Number(trimmed.replace(/[^0-9]/g, ''));
    if (Number.isFinite(year)) {
      return `${year}-12-31`;
    }
  }

  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-12-31`;
  }

  const matchYearMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (matchYearMonth) {
    const year = Number(matchYearMonth[1]);
    const month = Number(matchYearMonth[2]);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      month >= 1 &&
      month <= 12
    ) {
      const lastDay = new Date(Date.UTC(year, month, 0));
      return toIsoDate(lastDay);
    }
  }

  return null;
};

export const extractTimelineFromImportDf = (
  df: LegacyImportDf
): ExtractedTimelineEntry[] => {
  const periods = Array.isArray(df.periods) ? df.periods : [];

  const entries: ExtractedTimelineEntry[] = [];
  let order = 1;

  for (const rawLabel of periods) {
    if (!rawLabel || isEolToken(rawLabel)) {
      continue;
    }

    entries.push({
      period_label: normalizeLabel(rawLabel),
      period_type: 'Yearly',
      af_type: 'Actual',
      period_val: normalizePeriodVal(rawLabel),
      display_order: order,
    });
    order += 1;
  }

  return entries;
};
