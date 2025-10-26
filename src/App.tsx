import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import IndexPage from './pages/IndexPage';
import FinancialModelSetupPage from './pages/FinancialModelSetupPage';
import UserAccountImport from './pages/UserAccountImport';
import FinancialStatementPreview from './pages/FinancialStatementPreview';
import UserAccountMappingCompletePage from './pages/UserAccountMappingCompletePage';
import GridPage from './pages/GridPage';
import { AccountManagementPage } from './pages/AccountManagementPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route
          path="/aggregatedAccountSetting"
          element={<FinancialModelSetupPage />}
        />
        <Route path="/userAccountImport" element={<UserAccountImport />} />
        <Route
          path="/financialStatementPreview"
          element={<FinancialStatementPreview />}
        />
        <Route
          path="/userAccountMappingComplete"
          element={<UserAccountMappingCompletePage />}
        />
        <Route path="/grid" element={<GridPage />} />
        <Route path="/account-management" element={<AccountManagementPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
