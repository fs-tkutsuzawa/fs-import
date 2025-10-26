import React, { useState, CSSProperties } from 'react';
import { Column, Row } from '../types';

interface DataGridProps {
  columns: Column[];
  rows: Row[];
  expandedYears: Set<number>;
  toggleMonthView: (year: number) => void;
  onCellChange?: (rowId: string, colKey: string, value: string) => void;
}

const DataGrid: React.FC<DataGridProps> = ({
  columns,
  rows,
  expandedYears,
  toggleMonthView,
  onCellChange,
}) => {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>('');

  const handleCellClick = (row: Row, colKey: string, value: any) => {
    if (row.isCalculated) return;
    setEditingCell(`${row.id}-${colKey}`);
    setTempValue(value || '');
  };

  const handleCellBlur = (rowId: string, colKey: string) => {
    if (onCellChange) {
      onCellChange(rowId, colKey, tempValue);
    }
    setEditingCell(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowId: string,
    colKey: string
  ) => {
    if (e.key === 'Enter') {
      handleCellBlur(rowId, colKey);
    }
  };

  const getCellStyle = (
    col: Column,
    row: Row,
    rowIndex: number
  ): CSSProperties => {
    const style: CSSProperties = {
      padding: '6px 8px',
      borderRight: '1px solid #e5e7eb',
      backgroundColor: col.frozen
        ? 'white'
        : col.parentYear
          ? '#fef3c733'
          : rowIndex % 2 === 0
            ? 'white'
            : '#fafafa',
      position: col.frozen ? 'sticky' : 'relative',
      left: col.frozen ? 0 : 'auto',
      zIndex: col.frozen ? 5 : 1,
      textAlign: col.frozen ? 'left' : 'right',
      cursor: !col.frozen && !row.isCalculated ? 'pointer' : 'default',
      color: '#111827',
    };

    if (row.accountName === 'バランスチェック' && row[col.key] !== 0) {
      style.color = '#ef4444';
      style.fontWeight = 'bold';
    }
    if (row.isRatio) {
      style.color = '#6b7280';
    }
    if (
      row.accountName.startsWith('【') ||
      row.accountName.includes('合計') ||
      row.accountName.includes('利益')
    ) {
      style.fontWeight = 'bold';
    }

    return style;
  };

  const getHeaderStyle = (col: Column): CSSProperties => ({
    padding: '8px',
    borderRight: '1px solid #e5e7eb',
    borderBottom: '2px solid #d1d5db',
    backgroundColor: col.isIrregular
      ? '#fef2f2'
      : col.parentYear
        ? '#fef3c7'
        : col.isAnnual && col.year && col.year <= 2026
          ? '#eff6ff'
          : col.isAnnual
            ? '#f0fdf4'
            : '#f9fafb',
    minWidth: col.width || 100,
    position: col.frozen ? 'sticky' : 'relative',
    left: col.frozen ? 0 : 'auto',
    zIndex: col.frozen ? 10 : 1,
    textAlign: col.frozen ? 'left' : 'center',
  });

  return (
    <div
      style={{
        overflowX: 'auto',
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
      }}
    >
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={getHeaderStyle(col)}>
                {col.headerRenderer === 'expandable' ? (
                  <div>
                    <div>{col.name}</div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#6b7280',
                        fontWeight: 'normal',
                      }}
                    >
                      {col.info}
                    </div>
                    <button
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        marginTop: '4px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMonthView(col.year!);
                      }}
                    >
                      {expandedYears.has(col.year!)
                        ? '月次を閉じる'
                        : '月次を開く'}
                    </button>
                  </div>
                ) : typeof col.headerRenderer === 'function' ? (
                  col.headerRenderer({ column: col })
                ) : (
                  <div>
                    <div>{col.name}</div>
                    {col.info && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#6b7280',
                          fontWeight: 'normal',
                        }}
                      >
                        {col.info}
                      </div>
                    )}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              style={{
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: row.isRatio ? '#f9fafb' : 'transparent',
              }}
            >
              {columns.map((col) => {
                const cellKey = `${row.id}-${col.key}`;
                const isEditing = editingCell === cellKey;
                const value = row[col.key];

                return (
                  <td
                    key={col.key}
                    style={getCellStyle(col, row, rowIndex)}
                    onClick={() =>
                      !col.frozen && handleCellClick(row, col.key, value)
                    }
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onBlur={() => handleCellBlur(row.id, col.key)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, col.key)}
                        style={{
                          width: '100%',
                          padding: '2px',
                          border: '1px solid #3b82f6',
                          outline: 'none',
                          backgroundColor: 'white',
                        }}
                        autoFocus
                      />
                    ) : (
                      <span>
                        {row.isRatio && typeof value === 'number'
                          ? `${(value * 100).toFixed(1)}%`
                          : typeof value === 'number'
                            ? value.toLocaleString()
                            : value || ''}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataGrid;
