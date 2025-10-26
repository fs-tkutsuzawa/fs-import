import React from 'react';
import { useNavigate } from 'react-router-dom';

export const BackToTopButton: React.FC = () => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/')}
      className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
    >
      Top画面へ戻る
    </button>
  );
};
