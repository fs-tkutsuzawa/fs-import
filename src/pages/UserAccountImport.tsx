import React, { useState, useMemo, useCallback, Fragment, useRef } from 'react';
import '../assets/UserAccountImport.css';
import { useFinancialAccounts } from '../hooks/useFinancialAccounts';
import { getApiUrl } from '../config/api';
// Import FinancialStatementPreviewInternal from the separate file
import { FinancialStatementPreviewInternal } from './FinancialStatementPreview';
import { BackToTopButton } from '../components';

// --- Type Definitions ---
interface ImportedItem {
  id: string;
  name: string;
  type?: 'Account' | 'KPI';
}

interface FileUploadData {
  rows: Array<{
    type: string;
    label: string;
    values: number[];
  }>;
  periods: string[];
}

interface UserAccountPayload {
  ua_name: string;
  ua_code?: string;
  fs_type: string;
  is_credit?: boolean;
  is_kpi: boolean;
  parent_ga_id: string;
  parent_ua_id?: number | null;
  parent_ua_code?: string;
}

const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
};

const cleanCell = (cell: string): string => cell.replace(/^\s+|\s+$/g, '');

const parseNumericCell = (cell: string): number => {
  const normalized = cleanCell(cell).replace(/"/g, '').replace(/,/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseCsvContent = (
  content: string
): {
  importedItems: ImportedItem[];
  rows: FileUploadData['rows'];
  periods: string[];
} => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    throw new Error('CSVファイルにデータがありません');
  }

  const periods: string[] = [];
  const rows: FileUploadData['rows'] = [];
  const importedItems: ImportedItem[] = [];

  lines.forEach((line, lineIndex) => {
    if (lineIndex === 0) {
      const headers = splitCsvLine(line).map((col) =>
        cleanCell(col).replace(/"/g, '')
      );
      if (headers.length > 2) {
        periods.push(...headers.slice(2).map((h) => h.replace(/"/g, '')));
      }
      return;
    }

    if (line.startsWith('EOF')) return;

    const columns = splitCsvLine(line);
    const type = cleanCell(columns[0]);
    const label = cleanCell(columns[1]).replace(/"/g, '');

    if (!type || !label || (type !== 'Account' && type !== 'KPI')) {
      return;
    }

    const rawValues =
      periods.length > 0
        ? periods.map((_, idx) => columns[idx + 2] ?? '')
        : columns.slice(2);
    const values = rawValues.map((raw) => parseNumericCell(raw));

    importedItems.push({
      id: `imp-${importedItems.length + 1}`,
      name: label,
      type: type as 'Account' | 'KPI',
    });

    rows.push({
      type,
      label,
      values,
    });
  });

  if (!importedItems.length) {
    throw new Error('CSVファイルから有効なデータが見つかりませんでした');
  }

  return { importedItems, rows, periods };
};

// --- Components ---

const getSuffix = (account: any) => {
  if (account.isCalculated) return '（自動計算）';
  if (account.id === 'cash_and_deposits' || account.id === 'opening_cash')
    return '（参照）';
  if (account.account_type === 'aggregate') return '（子科目合計）';
  return '';
};

const ConfirmationModal = ({ isOpen, message, onConfirm, onCancel }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h3 className="text-lg font-semibold mb-4">確認</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            変更する
          </button>
        </div>
      </div>
    </div>
  );
};

const FileUploadModal = ({
  isOpen,
  onClose,
  onFileUpload,
}: {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (data: ImportedItem[], originalData: FileUploadData) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    setError('');
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (fileExtension === 'csv' || file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const { importedItems, rows, periods } = parseCsvContent(content);

          const fileUploadData: FileUploadData = {
            rows,
            periods:
              periods.length > 0 ? periods : ['Period1', 'Period2', 'Period3'],
          };

          onFileUpload(importedItems, fileUploadData);
          onClose();
        } catch (err) {
          setError(
            'CSVファイルの解析に失敗しました: ' + (err as Error).message
          );
        }
      };

      reader.onerror = () => {
        setError('ファイルの読み込みに失敗しました');
      };

      reader.readAsText(file, 'utf-8');
    } else if (fileExtension === 'json' || file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const jsonData: FileUploadData = JSON.parse(content);

          // Validate JSON structure
          if (!jsonData.rows || !Array.isArray(jsonData.rows)) {
            throw new Error('Invalid JSON structure: rows array is required');
          }

          // Extract labels and convert to ImportedItem format
          const importedItems: ImportedItem[] = jsonData.rows.map(
            (row, index) => ({
              id: `imp-${index + 1}`,
              name: row.label,
              type: row.type as 'Account' | 'KPI',
            })
          );

          onFileUpload(importedItems, jsonData);
          onClose();
        } catch (err) {
          setError(
            'JSONファイルの解析に失敗しました: ' + (err as Error).message
          );
        }
      };

      reader.onerror = () => {
        setError('ファイルの読み込みに失敗しました');
      };

      reader.readAsText(file);
    } else {
      setError('JSONまたはCSVファイルを選択してください');
      return;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">
          JSONファイルをアップロード
        </h3>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600">
            クリックまたはドラッグ＆ドロップでファイルを選択
          </p>
          <p className="text-xs text-gray-500 mt-1">
            JSONまたはCSV形式のファイルに対応
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="mt-6 bg-gray-50 p-4 rounded-md">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            対応ファイル形式:
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs font-semibold text-gray-600 mb-1">
                CSV形式:
              </h5>
              <pre className="text-xs text-gray-600 overflow-x-auto">
                {`Account,売上高,...
Account,売上原価,...
KPI,商品数量,...`}
              </pre>
            </div>
            <div>
              <h5 className="text-xs font-semibold text-gray-600 mb-1">
                JSON形式:
              </h5>
              <pre className="text-xs text-gray-600 overflow-x-auto">
                {`{
  "rows": [{
    "type": "Account",
    "label": "売上高"
  }]
}`}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

const AccountTree = ({
  aggregatedAccounts,
  importedData,
  mappings,
  onMappingChange,
  draggedItem,
  setDraggedItem,
}: any) => {
  const [hoveredTargetId, setHoveredTargetId] = useState(null);

  const handleDropAction = (e: any, targetId: any, actionType: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem || draggedItem.id === targetId) return;
    onMappingChange(draggedItem.id, { type: actionType, parentId: targetId });
    setHoveredTargetId(null);
  };

  const AccountNode = ({ accountId, level, isAggregated }: any) => {
    const account = isAggregated
      ? aggregatedAccounts.find((a: any) => a.id === accountId)
      : importedData.find((i: any) => i.id === accountId);

    if (!account) return null;

    const isDropTarget = hoveredTargetId === account.id;
    const canBeParentAsChild = isAggregated
      ? account.mapping_type === 'sum_of_children'
      : true;
    const canBeParentAsMapTo =
      isAggregated &&
      (account.mapping_type === 'calculated' ||
        account.mapping_type === 'reference');
    const isDraggable = !isAggregated;

    const parentId = mappings[accountId]?.parentId;
    const parentIsAggregated = parentId
      ? aggregatedAccounts.some((acc: any) => acc.id === parentId)
      : false;
    const canInsertBetween = !isAggregated && parentIsAggregated;

    const children = Object.entries(mappings)
      .filter(
        ([_, map]: any) => map.type === 'childOf' && map.parentId === account.id
      )
      .map(([childId, _]) => childId);

    const mappedToThis = !isAggregated
      ? null
      : Object.entries(mappings).find(
          ([_, map]: any) => map.type === 'mapTo' && map.parentId === account.id
        );
    const mappedItemName = mappedToThis
      ? importedData.find((d: any) => d.id === mappedToThis[0])?.name
      : null;

    let nodeClasses = 'p-2 rounded-md transition-all relative my-1 group ';
    if (isAggregated) {
      if (
        account.isCalculated ||
        account.id === 'cash_and_deposits' ||
        account.id === 'opening_cash'
      ) {
        nodeClasses += mappedToThis
          ? 'bg-blue-200 border border-blue-400'
          : 'bg-blue-50 border-blue-200';
      } else if (account.account_type === 'aggregate') {
        nodeClasses += 'bg-green-50 border border-green-200';
      } else {
        nodeClasses += 'bg-gray-100';
      }
    } else {
      nodeClasses += 'bg-gray-100 border border-gray-300';
    }
    if (draggedItem && draggedItem.id === account.id) {
      nodeClasses += ' opacity-50';
    }

    return (
      <Fragment>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setHoveredTargetId(account.id);
          }}
          onDragEnter={(e) => {
            e.stopPropagation();
            setHoveredTargetId(account.id);
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (
              e.relatedTarget instanceof Node &&
              e.currentTarget.contains(e.relatedTarget)
            )
              return;
            setHoveredTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!draggedItem || draggedItem.id === account.id) return;
            let defaultAction = 'childOf';
            if (
              isAggregated &&
              (account.isCalculated ||
                account.id === 'cash_and_deposits' ||
                account.id === 'opening_cash')
            ) {
              defaultAction = 'mapTo';
            }
            onMappingChange(draggedItem.id, {
              type: defaultAction,
              parentId: account.id,
            });
            setHoveredTargetId(null);
          }}
          draggable={isDraggable}
          onDragStart={(e) => {
            if (isDraggable) {
              e.dataTransfer.effectAllowed = 'move';
              setDraggedItem(account);
              e.stopPropagation();
            }
          }}
          onDragEnd={(e) => {
            if (isDraggable) {
              setDraggedItem(null);
            }
            e.stopPropagation();
          }}
          className={nodeClasses}
          style={{ marginLeft: `${level * 1.5}rem` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center min-w-0">
              {isDraggable && (
                <span className="cursor-grab mr-2 text-gray-400 group-hover:text-gray-600">
                  ⠿
                </span>
              )}
              <span className="font-semibold truncate">
                {isAggregated ? account.account_name : account.name}
              </span>
              {!isAggregated && account.type === 'KPI' && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                  KPI
                </span>
              )}
              {isAggregated && (
                <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                  {getSuffix(account)}
                </span>
              )}
            </div>
            {isDraggable && (
              <button
                onClick={() =>
                  onMappingChange(account.id, {
                    type: 'ignore',
                    parentId: null,
                  })
                }
                className="p-1 rounded-full hover:bg-red-200 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                aria-label="マッピング解除"
                title="マッピング解除"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>

          {mappedToThis && (
            <div className="text-xs text-blue-800 pl-2 mt-1">
              <span className="font-bold">紐付け済み:</span> {mappedItemName}
            </div>
          )}

          {isDropTarget && draggedItem && draggedItem.id !== account.id && (
            <div
              className={`absolute top-0 left-0 w-full h-full bg-blue-500 bg-opacity-70 rounded-md flex items-center justify-center gap-2 z-10 flex-wrap p-2`}
            >
              {canBeParentAsMapTo && (
                <button
                  onDrop={(e) => handleDropAction(e, account.id, 'mapTo')}
                  className="px-3 py-1 bg-white text-blue-700 font-semibold rounded shadow-lg hover:bg-blue-100 text-xs"
                >
                  紐づける
                </button>
              )}
              {canBeParentAsChild && (
                <button
                  onDrop={(e) => handleDropAction(e, account.id, 'childOf')}
                  className="px-3 py-1 bg-white text-blue-700 font-semibold rounded shadow-lg hover:bg-blue-100 text-xs"
                >
                  子科目として追加
                </button>
              )}
              {!isAggregated && (
                <button
                  onDrop={(e) => handleDropAction(e, account.id, 'insertAbove')}
                  className="px-3 py-1 bg-white text-blue-700 font-semibold rounded shadow-lg hover:bg-blue-100 text-xs"
                >
                  兄弟科目として追加
                </button>
              )}
              {canInsertBetween && (
                <button
                  onDrop={(e) =>
                    handleDropAction(e, account.id, 'insertBetween')
                  }
                  className="px-3 py-1 bg-white text-blue-700 font-semibold rounded shadow-lg hover:bg-blue-100 text-xs"
                >
                  一階層上に追加
                </button>
              )}
            </div>
          )}
        </div>
        {children.map((childId: any) => (
          <AccountNode
            key={childId}
            accountId={childId}
            level={level + 1}
            isAggregated={false}
          />
        ))}
      </Fragment>
    );
  };

  const fsTypes = {
    PL: '損益計算書 (PL)',
    BS: '貸借対照表 (BS)',
    CF: 'キャッシュフロー計算書 (CF)',
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
        集約科目
      </h2>
      <div className="scrollable-area">
        {Object.entries(fsTypes).map(([type, name]) => (
          <div key={type} className="mb-6">
            <h3 className="font-bold text-lg mb-2 text-gray-700 sticky top-0 bg-white py-1 z-20">
              {name}
            </h3>
            {aggregatedAccounts
              .filter((acc: any) => acc.fs_type === type)
              .sort((a: any, b: any) => a.order - b.order)
              .map((acc: any) => (
                <AccountNode
                  key={acc.id}
                  accountId={acc.id}
                  level={0}
                  isAggregated={true}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const ImportedAccountList = ({
  importedData,
  mappings,
  setDraggedItem,
  draggedItem,
  onFileUpload,
}: any) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string>('');

  const unmappedAccounts = useMemo(() => {
    const mappedIds = new Set(
      Object.keys(mappings).filter((id) => mappings[id].type !== 'ignore')
    );
    return importedData.filter((item: any) => !mappedIds.has(item.id));
  }, [mappings, importedData]);

  const handleFileSelect = (file: File) => {
    setError('');

    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (fileExtension === 'csv' || file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const { importedItems, rows, periods } = parseCsvContent(content);

          const fileUploadData: FileUploadData = {
            rows,
            periods:
              periods.length > 0 ? periods : ['Period1', 'Period2', 'Period3'],
          };

          onFileUpload(importedItems, fileUploadData);
          setError('');
        } catch (err) {
          setError(
            'CSVファイルの解析に失敗しました: ' + (err as Error).message
          );
        }
      };

      reader.onerror = () => {
        setError('ファイルの読み込みに失敗しました');
      };

      reader.readAsText(file, 'utf-8');
    } else if (fileExtension === 'json' || file.type === 'application/json') {
      // Handle JSON file
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const jsonData: FileUploadData = JSON.parse(content);

          // Validate JSON structure
          if (!jsonData.rows || !Array.isArray(jsonData.rows)) {
            throw new Error('Invalid JSON structure: rows array is required');
          }

          // Extract labels and convert to ImportedItem format
          const importedItems: ImportedItem[] = jsonData.rows.map(
            (row, index) => ({
              id: `imp-${index + 1}`,
              name: row.label,
              type: row.type as 'Account' | 'KPI',
            })
          );

          onFileUpload(importedItems, jsonData);
          setError('');
        } catch (err) {
          setError(
            'JSONファイルの解析に失敗しました: ' + (err as Error).message
          );
        }
      };

      reader.onerror = () => {
        setError('ファイルの読み込みに失敗しました');
      };

      reader.readAsText(file);
    } else {
      setError('JSONまたはCSVファイルを選択してください');
      return;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <div className="imported-list-container">
      <div className="bg-white p-4 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
          インポートされた科目
        </h2>
        <div className="scrollable-area">
          {importedData.length === 0 ? (
            <>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-600">
                  クリックまたはドラッグ＆ドロップでファイルを選択
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  JSONまたはCSV形式のファイルに対応
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="mt-4 bg-gray-50 p-3 rounded-md">
                <h4 className="text-xs font-semibold text-gray-700 mb-1">
                  対応ファイル形式:
                </h4>
                <div className="text-xs text-gray-600">
                  <p className="mb-1">• CSV: Account/KPI, 科目名, ...</p>
                  <p className="mb-1">
                    • JSON:{' '}
                    <span className="font-mono">
                      {'{"rows": [{"type": "Account", "label": "売上高"}]}'}
                    </span>
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {unmappedAccounts.length > 0 ? (
                unmappedAccounts.map((item: any) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedItem(item);
                    }}
                    onDragEnd={() => setDraggedItem(null)}
                    className={`p-2 my-1 bg-gray-200 text-gray-800 rounded-md cursor-grab active:cursor-grabbing ${
                      draggedItem && draggedItem.id === item.id
                        ? 'opacity-50'
                        : ''
                    } flex items-center justify-between`}
                  >
                    <span>{item.name}</span>
                    {item.type === 'KPI' && (
                      <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                        KPI
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">
                  全ての科目がマッピングされました。
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Removed duplicate FinancialStatementPreview component - now using from FinancialStatementPreview.tsx
// The component is now imported as FinancialStatementPreviewPage

const UserAccountImport = () => {
  const {
    accounts: aggregatedAccountsData,
    loading,
    error,
  } = useFinancialAccounts();
  const [view, setView] = useState('mapping');
  const [finalizedAccounts, setFinalizedAccounts] = useState(null);
  const [importedData, setImportedData] = useState<ImportedItem[]>([]);
  const [, setUploadedFileData] = useState<FileUploadData | null>(null); // Store the raw uploaded data for import_df table
  const [fileUploadModalOpen, setFileUploadModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialMappings = useMemo(() => {
    const mappings: any = {};
    importedData.forEach((item) => {
      mappings[item.id] = { type: 'ignore', parentId: null };
    });
    return mappings;
  }, [importedData]);

  const [mappings, setMappings] = useState(initialMappings);
  const [confirmation, setConfirmation] = useState<any>({
    isOpen: false,
    message: '',
    onConfirm: null,
  });
  const [draggedItem, setDraggedItem] = useState(null);

  // Function to handle file upload and save to import_df table
  const handleFileUpload = async (
    items: ImportedItem[],
    fileData: FileUploadData
  ) => {
    console.log('handleFileUpload invoked with', fileData); // ← 追加
    setImportedData(items);
    setUploadedFileData(fileData);

    // Save to import_df table
    // Using modelId = 1 as default, you may want to get this from context or props
    const modelId = 1;

    try {
      console.log('Saving import data payload', JSON.stringify(fileData));
      const response = await fetch(getApiUrl(`/api/import-data/${modelId}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fileData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save import data: ${response.status}`);
      }

      await response.json();
    } catch (error) {
      console.error('Error saving import data to database:', error);
      // Still continue with the UI flow even if save fails
      alert(
        '警告: データのデータベース保存に失敗しましたが、マッピングは続行できます。'
      );
    }
  };

  // Update mappings when importedData changes
  React.useEffect(() => {
    if (importedData.length > 0) {
      const newMappings: any = {};
      importedData.forEach((item) => {
        newMappings[item.id] = { type: 'ignore', parentId: null };
      });
      setMappings(newMappings);
    }
  }, [importedData]);

  const handleMappingChange = useCallback(
    (itemId: any, newMapping: any) => {
      if (newMapping.type === 'insertAbove') {
        const targetId = newMapping.parentId;
        const targetItemMapping = mappings[targetId];
        if (!targetItemMapping || !targetItemMapping.parentId) {
          console.warn('Cannot insert above a top-level item.');
          return;
        }
        const newParentIdForDraggedItem = targetItemMapping.parentId;

        setMappings((prev: any) => ({
          ...prev,
          [itemId]: { type: 'childOf', parentId: newParentIdForDraggedItem },
        }));
        return;
      }

      if (newMapping.type === 'insertBetween') {
        const targetId = newMapping.parentId;
        const targetItemMapping = mappings[targetId];
        if (!targetItemMapping || !targetItemMapping.parentId) return;

        const originalParentId = targetItemMapping.parentId;
        const isParentAggregated = aggregatedAccountsData.some(
          (acc) => acc.id === originalParentId
        );
        if (!isParentAggregated) return;

        setMappings((prev: any) => {
          const newState: any = { ...prev };
          const siblingsToMove = Object.keys(prev).filter(
            (id) => prev[id].parentId === originalParentId
          );

          newState[itemId] = { type: 'childOf', parentId: originalParentId };
          siblingsToMove.forEach((siblingId) => {
            newState[siblingId] = { ...prev[siblingId], parentId: itemId };
          });

          return newState;
        });
        return;
      }

      if (newMapping.type === 'mapTo') {
        const currentMapping = Object.entries(mappings).find(
          ([_, map]: any) =>
            map.type === 'mapTo' && map.parentId === newMapping.parentId
        );
        if (currentMapping && currentMapping[0] !== itemId) {
          const currentItemName = importedData.find(
            (d) => d.id === currentMapping[0]
          )?.name;
          const newItemName = importedData.find((d) => d.id === itemId)?.name;
          const targetAccountName = aggregatedAccountsData.find(
            (d) => d.id === newMapping.parentId
          )?.account_name;
          setConfirmation({
            isOpen: true,
            message: `「${targetAccountName}」には既に「${currentItemName}」が紐づいています。「${newItemName}」に変更しますか？`,
            onConfirm: () => {
              setMappings((prev: any) => ({
                ...prev,
                [currentMapping[0]]: { type: 'ignore', parentId: null },
                [itemId]: newMapping,
              }));
              setConfirmation({ isOpen: false, message: '', onConfirm: null });
            },
          });
          return;
        }
      }
      setMappings((prev: any) => ({ ...prev, [itemId]: newMapping }));
    },
    [mappings, aggregatedAccountsData, importedData]
  );

  const buildUserAccountsPayload = useCallback(() => {
    const userAccounts: UserAccountPayload[] = [];
    const processedIds = new Set<string>();

    // First pass: Process items that have GA as parent (no parent_ua_id)
    Object.entries(mappings).forEach(([itemId, mapping]: any) => {
      if (mapping.type === 'ignore' || processedIds.has(itemId)) return;

      const item = importedData.find((i) => i.id === itemId);
      if (!item) return;

      const aggregatedParent = aggregatedAccountsData.find(
        (acc: any) => acc.id === mapping.parentId
      );

      if (mapping.type === 'mapTo' && aggregatedParent) {
        userAccounts.push({
          ua_name: item.name,
          ua_code: itemId,
          fs_type: aggregatedParent.fs_type,
          is_kpi: item.type === 'KPI',
          parent_ga_id: aggregatedParent.id,
          parent_ua_id: null,
        });
        processedIds.add(itemId);
      } else if (mapping.type === 'childOf') {
        // Check if parent is aggregated (GA)
        const parentIsAggregated = aggregatedAccountsData.some(
          (acc: any) => acc.id === mapping.parentId
        );

        if (parentIsAggregated) {
          const parentAgg = aggregatedAccountsData.find(
            (acc: any) => acc.id === mapping.parentId
          );
          if (parentAgg) {
            userAccounts.push({
              ua_name: item.name,
              ua_code: itemId,
              fs_type: parentAgg.fs_type,
              is_kpi: item.type === 'KPI',
              parent_ga_id: parentAgg.id,
              parent_ua_id: null,
            });
            processedIds.add(itemId);
          }
        }
      }
    });

    // Second pass: Process items that have UA as parent (with parent_ua_id)
    // Send parent_ua_code so the server can resolve parent_ua_id after creation
    Object.entries(mappings).forEach(([itemId, mapping]: any) => {
      if (mapping.type === 'ignore' || processedIds.has(itemId)) return;

      const item = importedData.find((i) => i.id === itemId);
      if (!item) return;

      if (mapping.type === 'childOf') {
        // Parent is another imported item (UA)
        const parentItem = importedData.find((i) => i.id === mapping.parentId);
        const parentMapping = mappings[mapping.parentId];

        if (parentItem && parentMapping) {
          // Find the root GA by traversing up the parent chain
          const findRootGA = (startParentId: string) => {
            let currentParentId: string | null = startParentId;
            let currentParentMapping = mappings[itemId];

            while (currentParentId) {
              const parentIdToCheck = currentParentId;
              const ga = aggregatedAccountsData.find(
                (acc) => acc.id === parentIdToCheck
              );
              if (ga) {
                return ga;
              }

              // If not a GA, check if it's another UA and continue traversing
              currentParentMapping = mappings[currentParentId];
              if (currentParentMapping) {
                currentParentId = currentParentMapping.parentId;
              } else {
                currentParentId = null;
              }
            }
            return null;
          };

          const rootGA = findRootGA(parentMapping.parentId);

          if (rootGA) {
            // Send parent_ua_code so the server can resolve the parent_ua_id
            userAccounts.push({
              ua_name: item.name,
              ua_code: itemId,
              fs_type: rootGA.fs_type,
              is_kpi: item.type === 'KPI',
              parent_ga_id: rootGA.id,
              parent_ua_code: mapping.parentId, // Parent UA's code for server-side resolution
            });
            processedIds.add(itemId);
          }
        }
      }
    });

    return userAccounts;
  }, [mappings, importedData, aggregatedAccountsData]);

  const handleFinalize = async () => {
    if (importedData.length === 0) {
      alert('データをアップロードしてください');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build user accounts payload
      const userAccountsPayload = buildUserAccountsPayload();

      if (userAccountsPayload.length === 0) {
        alert('マッピングされた科目がありません');
        setIsSubmitting(false);
        return;
      }

      // Send to API
      const response = await fetch(getApiUrl('/api/user-accounts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accounts: userAccountsPayload }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      await response.json();

      // Build finalized structure for preview
      const finalStructure: any = { PL: [], BS: [], CF: [] };
      const nodeMap = new Map();
      aggregatedAccountsData.forEach((acc) =>
        nodeMap.set(acc.id, { ...acc, children: [] })
      );
      importedData.forEach((item) =>
        nodeMap.set(item.id, {
          id: item.id,
          account_name: item.name,
          mapping_type: 'child',
          children: [],
          order: 999,
        })
      );

      Object.entries(mappings).forEach(([childId, mapping]: any) => {
        if (mapping.type === 'childOf' && mapping.parentId) {
          const parentNode = nodeMap.get(mapping.parentId);
          const childNode = nodeMap.get(childId);
          if (parentNode && childNode) {
            parentNode.children.push(childNode);
          }
        }
      });

      Object.entries(mappings).forEach(([childId, mapping]: any) => {
        if (mapping.type === 'mapTo' && mapping.parentId) {
          const parentNode = nodeMap.get(mapping.parentId);
          const childNode = nodeMap.get(childId);
          const mappedItem = importedData.find((imp) => imp.id === childId);

          // 参照型GAの場合は名前を変更
          if (
            parentNode &&
            mappedItem &&
            parentNode.mapping_type === 'reference'
          ) {
            parentNode.account_name = mappedItem.name;
          }

          // 自動計算GAの場合は子要素として追加
          if (
            parentNode &&
            childNode &&
            parentNode.mapping_type === 'calculated'
          ) {
            parentNode.children.push(childNode);
          }

          if (parentNode) parentNode.isMapped = true;
        }
      });

      let finalAccounts = aggregatedAccountsData.map((acc) =>
        nodeMap.get(acc.id)
      );
      finalAccounts = finalAccounts.filter((acc: any) => {
        if (
          acc.mapping_type === 'calculated' ||
          acc.mapping_type === 'reference'
        )
          return true;
        if (acc.mapping_type === 'sum_of_children' && acc.children.length > 0)
          return true;
        return false;
      });

      ['PL', 'BS', 'CF'].forEach((fsType) => {
        finalStructure[fsType] = finalAccounts
          .filter((acc: any) => acc.fs_type === fsType)
          .sort((a: any, b: any) => a.order - b.order);
      });

      setFinalizedAccounts(finalStructure);
      setView('preview');
    } catch (error) {
      console.error('Error saving user accounts:', error);
      alert('データの保存に失敗しました: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view === 'preview') {
    const handleConfirm = () => {
      // Store finalizedAccounts in localStorage for UserAccountMappingCompletePage
      localStorage.setItem(
        'finalizedAccounts',
        JSON.stringify(finalizedAccounts)
      );
      // Navigate to UserAccountMappingCompletePage
      window.location.href = '/userAccountMappingComplete';
    };
    return (
      <FinancialStatementPreviewInternal
        finalizedAccounts={finalizedAccounts}
        onBack={() => setView('mapping')}
        onConfirm={handleConfirm}
        showConfirmButton={true}
      />
    );
  }

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  }

  return (
    <div className="bg-gray-100 p-4 sm:p-8">
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        message={confirmation.message}
        onConfirm={confirmation.onConfirm}
        onCancel={() =>
          setConfirmation({ isOpen: false, message: '', onConfirm: null })
        }
      />
      <FileUploadModal
        isOpen={fileUploadModalOpen}
        onClose={() => setFileUploadModalOpen(false)}
        onFileUpload={handleFileUpload}
      />

      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            勘定科目マッピング
          </h1>
          <p className="text-gray-600 mt-2">
            {importedData.length > 0
              ? '左のリストから科目をドラッグし、右の集約科目にドロップして紐づけます。'
              : '左のエリアにJSONファイルをアップロードして科目データをインポートしてください。'}
          </p>
        </div>
        <div className="flex gap-3">
          <BackToTopButton />
          <button
            onClick={handleFinalize}
            disabled={isSubmitting || importedData.length === 0}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '保存中...' : 'マッピングを完了'}
          </button>
        </div>
      </header>

      <div className="main-container">
        <ImportedAccountList
          importedData={importedData}
          mappings={mappings}
          setDraggedItem={setDraggedItem}
          draggedItem={draggedItem}
          onFileUpload={handleFileUpload}
        />
        <AccountTree
          aggregatedAccounts={aggregatedAccountsData}
          importedData={importedData}
          mappings={mappings}
          onMappingChange={handleMappingChange}
          draggedItem={draggedItem}
          setDraggedItem={setDraggedItem}
        />
      </div>
    </div>
  );
};

export default UserAccountImport;
