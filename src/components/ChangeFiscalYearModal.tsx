import React, { useState } from 'react';
import { FiscalYearConfig } from '../types';

interface ChangeFiscalYearModalProps {
  config: FiscalYearConfig;
  setConfig: (config: FiscalYearConfig) => void;
  closeModal: () => void;
}

const ChangeFiscalYearModal: React.FC<ChangeFiscalYearModalProps> = ({
  config,
  setConfig,
  closeModal,
}) => {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);

  const handleSubmit = () => {
    const newChange = { year, newEndMonth: month };
    const otherChanges = config.changes.filter((c) => c.year !== year);
    setConfig({
      ...config,
      changes: [...otherChanges, newChange].sort((a, b) => a.year - b.year),
    });
    closeModal();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '8px',
          width: '400px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>期中で決算期を変更</h3>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            変更する年:
          </label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            {[2023, 2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            変更後の決算月:
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
          例: 2026年に6月へ変更すると、26/4-26/6が変則決算期として設定されます
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSubmit}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            設定
          </button>
          <button
            onClick={closeModal}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeFiscalYearModal;
