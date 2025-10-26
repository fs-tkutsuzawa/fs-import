import React, { useState, useMemo, useCallback } from 'react';
import DataGrid from './DataGrid';
import ChangeFiscalYearModal from './ChangeFiscalYearModal';
import TabBar from './TabBar';
import { FiscalYearConfig, TabStructure, TabItem, Row } from '../types';
import { createRow, generateColumns, accountsByTab } from '../utils/dataUtils';

const FinancialModel: React.FC = () => {
  const [companyName] = useState('株式会社サンプル企業');
  const [modelName] = useState('財務予測モデル');
  const [modelVersion] = useState('v3.0');

  const [fiscalYearConfig, setFiscalYearConfig] = useState<FiscalYearConfig>({
    startYear: 2023,
    initialEndMonth: 3,
    changes: [{ year: 2026, newEndMonth: 6 }],
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  const [tabStructure, setTabStructure] = useState<TabStructure>({
    settings: [
      { id: 'settings', title: '基本設定' },
      { id: 'params', title: 'パラメータ設定' },
    ],
    deal: [
      { id: 'tx', title: 'トランザクション' },
      { id: 'valuation', title: 'バリュエーション' },
      { id: 'lbo', title: 'LBO' },
    ],
    sheet: [
      { id: 'pl', title: 'PL' },
      { id: 'bs', title: 'BS' },
      { id: 'cf', title: 'CF' },
      { id: 'ppe', title: 'PP&E' },
      { id: 'financing', title: 'Financing' },
      { id: 'wc', title: 'Working Capital' },
    ],
  });

  const [activeTabId, setActiveTabId] = useState('pl');
  const [draggedTab, setDraggedTab] = useState<{
    id: string;
    title: string;
    group: string;
  } | null>(null);

  const [rowsByTab, setRowsByTab] = useState<{ [key: string]: Row[] }>(() => {
    const initial: { [key: string]: Row[] } = {};
    Object.keys(accountsByTab).forEach((tabId) => {
      initial[tabId] = accountsByTab[tabId].map((name) => createRow(name));
    });
    return initial;
  });

  const toggleMonthView = useCallback((year: number) => {
    setExpandedYears((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  }, []);

  const columns = useMemo(
    () => generateColumns(fiscalYearConfig, expandedYears, toggleMonthView),
    [fiscalYearConfig, expandedYears, toggleMonthView]
  );

  const handleCellChange = useCallback(
    (rowId: string, colKey: string, value: string) => {
      setRowsByTab((prev) => {
        const newRows = { ...prev };
        newRows[activeTabId] = newRows[activeTabId].map((row) => {
          if (row.id === rowId) {
            return {
              ...row,
              [colKey]: isNaN(parseFloat(value)) ? value : Number(value),
            };
          }
          return row;
        });
        return newRows;
      });
    },
    [activeTabId]
  );

  const handleDragStart = (e: React.DragEvent, tab: TabItem, group: string) => {
    setDraggedTab({ ...tab, group });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (
    e: React.DragEvent,
    targetTab: TabItem,
    group: string
  ) => {
    e.preventDefault();
    if (
      !draggedTab ||
      draggedTab.group !== group ||
      draggedTab.id === targetTab.id
    )
      return;

    setTabStructure((prev) => {
      const newStructure = { ...prev };
      const groupTabs = newStructure[group as keyof TabStructure];
      const newTabs = [...groupTabs];
      const draggedIndex = newTabs.findIndex((t) => t.id === draggedTab.id);
      const targetIndex = newTabs.findIndex((t) => t.id === targetTab.id);

      const [removed] = newTabs.splice(draggedIndex, 1);
      newTabs.splice(targetIndex, 0, removed);

      (newStructure[group as keyof TabStructure] as TabItem[]) = newTabs;
      return newStructure;
    });
    setDraggedTab(null);
  };

  const displayRows = useMemo(() => {
    const currentRows = rowsByTab[activeTabId] || [];
    if (!currentRows.length) return [];

    if (activeTabId === 'pl') {
      const processedRows: Row[] = [];
      const salesRow = currentRows.find((r) => r.accountName === '売上高');
      if (!salesRow) return currentRows;

      currentRows.forEach((row) => {
        processedRows.push(row);
        if (
          ['売上総利益', '営業利益', '経常利益', '当期純利益'].includes(
            row.accountName
          )
        ) {
          const ratioRow: Row = {
            id: `${row.id}-ratio`,
            accountName: '対売上高',
            isRatio: true,
            isCalculated: true,
          };
          Object.keys(row).forEach((key) => {
            if (key !== 'id' && key !== 'accountName') {
              const salesValue = salesRow[key] || 0;
              const profitValue = row[key] || 0;
              ratioRow[key] = salesValue !== 0 ? profitValue / salesValue : 0;
            }
          });
          processedRows.push(ratioRow);
        }
      });
      return processedRows;
    }

    if (activeTabId === 'bs') {
      const newRows = [...currentRows];
      const assets = newRows.find((r) => r.accountName === '資産合計');
      const liab = newRows.find((r) => r.accountName === '負債合計');
      const netAssets = newRows.find((r) => r.accountName === '純資産合計');
      const totalLiabNetAssets = newRows.find(
        (r) => r.accountName === '負債・純資産合計'
      );
      const balanceCheck = newRows.find(
        (r) => r.accountName === 'バランスチェック'
      );

      if (assets && liab && netAssets && totalLiabNetAssets && balanceCheck) {
        Object.keys(assets).forEach((key) => {
          if (key !== 'id' && key !== 'accountName') {
            const totalLNA = (liab[key] || 0) + (netAssets[key] || 0);
            totalLiabNetAssets[key] = totalLNA;
            balanceCheck[key] = (assets[key] || 0) - totalLNA;
          }
        });
        totalLiabNetAssets.isCalculated = true;
        balanceCheck.isCalculated = true;
      }
      return newRows;
    }

    return currentRows;
  }, [rowsByTab, activeTabId]);

  const activeTabContent = useMemo(() => {
    const hasContent = ['pl', 'bs', 'cf', 'ppe', 'financing', 'wc'].includes(
      activeTabId
    );
    if (hasContent) {
      return (
        <DataGrid
          columns={columns}
          rows={displayRows}
          expandedYears={expandedYears}
          toggleMonthView={toggleMonthView}
          onCellChange={handleCellChange}
        />
      );
    }
    const allTabs = [
      ...tabStructure.settings,
      ...tabStructure.deal,
      ...tabStructure.sheet,
    ];
    const activeTab = allTabs.find((t) => t.id === activeTabId);
    return (
      <div
        style={{
          padding: '40px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '4px',
          textAlign: 'center',
          color: '#6b7280',
        }}
      >
        <h3>{activeTab?.title}</h3>
        <p>このセクションは準備中です</p>
      </div>
    );
  }, [
    activeTabId,
    columns,
    displayRows,
    expandedYears,
    toggleMonthView,
    handleCellChange,
    tabStructure,
  ]);

  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f9fafb',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', color: '#111827' }}>
            {companyName}
          </h2>
          <p style={{ margin: '5px 0 0', color: '#6b7280' }}>
            {modelName} ({modelVersion})
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span>
            決算月: {fiscalYearConfig.initialEndMonth}月
            {fiscalYearConfig.changes.length > 0 &&
              ` → ${fiscalYearConfig.changes[fiscalYearConfig.changes.length - 1].newEndMonth}月`}
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            期中で決算期を変更
          </button>
        </div>
      </div>

      {isModalOpen && (
        <ChangeFiscalYearModal
          config={fiscalYearConfig}
          setConfig={setFiscalYearConfig}
          closeModal={() => setIsModalOpen(false)}
        />
      )}

      {/* Tab Container */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px 8px 0 0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          marginBottom: '1px',
        }}
      >
        <TabBar
          tabs={tabStructure.settings}
          group="settings"
          title="設定"
          activeTabId={activeTabId}
          onTabClick={setActiveTabId}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
        <TabBar
          tabs={tabStructure.deal}
          group="deal"
          title="ディール"
          activeTabId={activeTabId}
          onTabClick={setActiveTabId}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
        <TabBar
          tabs={tabStructure.sheet}
          group="sheet"
          title="シート"
          activeTabId={activeTabId}
          onTabClick={setActiveTabId}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      </div>

      {/* Content */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}
      >
        {activeTabContent}
      </div>
    </div>
  );
};

export default FinancialModel;
