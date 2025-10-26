import { Row, Column, FiscalYearConfig } from '../types';

export const createRow = (accountName: string): Row => {
  const row: Row = {
    id: `row-${Math.random().toString(36).substr(2, 9)}`,
    accountName,
  };

  // Generate sample data for quarters
  for (let year = 2024; year <= 2028; year++) {
    row[`${year}/3`] = Math.floor(Math.random() * 100000 + 50000);
    row[`${year}/6`] = Math.floor(Math.random() * 100000 + 50000);
  }

  // Generate sample data for months
  for (let year = 2023; year <= 2026; year++) {
    for (let month = 1; month <= 12; month++) {
      row[`${year}-${month}`] = Math.floor(Math.random() * 10000 + 1000);
    }
    row[`${year}-adj`] = Math.floor(Math.random() * 5000 - 2500);
  }

  // Irregular period
  row['2026/6-irregular'] = Math.floor(Math.random() * 30000 + 10000);

  return row;
};

export const generateColumns = (
  fiscalYearConfig: FiscalYearConfig,
  expandedYears: Set<number>,
  toggleMonthView: (year: number) => void
): Column[] => {
  const { startYear, initialEndMonth, changes } = fiscalYearConfig;
  const columns: Column[] = [];
  let currentEndMonth = initialEndMonth;

  for (let year = startYear; year <= startYear + 5; year++) {
    const change = changes.find((c) => c.year === year);

    if (change && change.newEndMonth !== currentEndMonth) {
      // Handle irregular period
      const irregularStartMonth = (currentEndMonth % 12) + 1;
      const irregularEndMonth = change.newEndMonth;
      const monthCount =
        irregularEndMonth >= irregularStartMonth
          ? irregularEndMonth - irregularStartMonth + 1
          : 12 - irregularStartMonth + 1 + irregularEndMonth;

      columns.push({
        key: `${year}/${change.newEndMonth}-irregular`,
        name: `${year}/${change.newEndMonth}`,
        info: `変則 (${monthCount}ヶ月)`,
        year,
        isIrregular: true,
        width: 120,
      });
      currentEndMonth = change.newEndMonth;
    } else {
      // Regular fiscal year
      const yearLabel = currentEndMonth <= 3 ? year + 1 : year;
      const isExpandable = yearLabel <= 2026;

      columns.push({
        key: `${yearLabel}/${currentEndMonth}`,
        name: `${yearLabel}/${currentEndMonth}`,
        info: yearLabel <= 2026 ? '実績' : '計画',
        year: yearLabel,
        isAnnual: true,
        isExpandable,
        width: 150,
        headerRenderer: isExpandable ? 'expandable' : undefined,
      });

      // Add monthly columns if expanded
      if (isExpandable && expandedYears.has(yearLabel)) {
        const monthNames = [
          '4月',
          '5月',
          '6月',
          '7月',
          '8月',
          '9月',
          '10月',
          '11月',
          '12月',
          '1月',
          '2月',
          '3月',
        ];
        const monthColumns = monthNames.map((monthName, idx) => {
          const monthNum = ((idx + 3) % 12) + 1;
          return {
            key: `${year}-${monthNum}`,
            name: monthName,
            info: '月次',
            parentYear: yearLabel,
            width: 80,
          };
        });
        monthColumns.push({
          key: `${year}-adj`,
          name: '決算調整',
          info: '調整',
          parentYear: yearLabel,
          width: 90,
        });
        columns.push(...monthColumns);
      }
    }
  }

  return [
    { key: 'accountName', name: '勘定科目', width: 200, frozen: true },
    ...columns,
  ];
};

export const accountsByTab: { [key: string]: string[] } = {
  pl: [
    '売上高',
    '売上原価',
    '売上総利益',
    '販売費及び一般管理費',
    '営業利益',
    '営業外収益',
    '営業外費用',
    '経常利益',
    '特別利益',
    '特別損失',
    '税引前利益',
    '法人税等',
    '当期純利益',
  ],
  bs: [
    '【流動資産】',
    '　現金及び預金',
    '　受取手形及び売掛金',
    '　棚卸資産',
    '【固定資産】',
    '　有形固定資産',
    '　　建物及び構築物',
    '　　機械装置',
    '　無形固定資産',
    '資産合計',
    '【流動負債】',
    '　買掛金',
    '【固定負債】',
    '　長期借入金',
    '負債合計',
    '【純資産】',
    '　資本金',
    '　利益剰余金',
    '純資産合計',
    '負債・純資産合計',
    'バランスチェック',
  ],
  cf: [
    '営業活動によるCF',
    '　税引前利益',
    '　減価償却費',
    '　売上債権の増減',
    '投資活動によるCF',
    '　設備投資',
    '財務活動によるCF',
    '　借入金の増減',
    '期首現預金残高',
    '現金及び現金同等物の増減',
    '期末現金残高',
  ],
  ppe: [
    '建物・構築物',
    '機械装置',
    '車両運搬具',
    '工具器具備品',
    '土地',
    '建設仮勘定',
    '合計',
  ],
  financing: ['短期借入金', '長期借入金', '社債', '資本金', '合計'],
  wc: ['売掛金', '在庫', '買掛金', '運転資本', '合計'],
};
