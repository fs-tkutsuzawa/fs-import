export interface Column {
  key: string;
  name: string;
  info?: string;
  year?: number;
  isIrregular?: boolean;
  isAnnual?: boolean;
  isExpandable?: boolean;
  parentYear?: number;
  width?: number;
  frozen?: boolean;
  headerRenderer?: string | ((props: { column: Column }) => React.ReactElement);
}

export interface Row {
  id: string;
  accountName: string;
  isCalculated?: boolean;
  isRatio?: boolean;
  [key: string]: any;
}

export interface FiscalYearConfig {
  startYear: number;
  initialEndMonth: number;
  changes: Array<{
    year: number;
    newEndMonth: number;
  }>;
}

export interface TabItem {
  id: string;
  title: string;
}

export interface TabStructure {
  settings: TabItem[];
  deal: TabItem[];
  sheet: TabItem[];
}
