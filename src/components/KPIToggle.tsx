import React from 'react';
import { getApiUrl } from '../config/api';

interface KPIToggleProps {
  accountId: number;
  isKPI: boolean;
  onToggle?: (newValue: boolean) => void;
}

/**
 * UAD-007-X: Component to toggle isKPI flag for user accounts
 * This allows marking accounts as KPI in the settings UI
 */
export const KPIToggle: React.FC<KPIToggleProps> = ({
  accountId,
  isKPI,
  onToggle,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleToggle = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        getApiUrl(`/api/user-accounts/${accountId}`),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_kpi: !isKPI,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update KPI status');
      }

      if (onToggle) {
        onToggle(!isKPI);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error toggling KPI status:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${isKPI ? 'bg-blue-600' : 'bg-gray-200'}
          ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        title={isKPI ? 'KPI科目' : '通常科目'}
        data-testid={`kpi-toggle-${accountId}`}
        aria-label={`KPI toggle for account ${accountId}`}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${isKPI ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
      {error && (
        <span className="text-xs text-red-600" title={error}>
          !
        </span>
      )}
    </div>
  );
};
