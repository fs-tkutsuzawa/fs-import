import React from 'react';
import { Link } from 'react-router-dom';
import '../assets/IndexPage.css';

const IndexPage: React.FC = () => {
  const menuItems = [
    {
      path: '/aggregatedAccountSetting',
      title: '集約科目設定',
      description: '勘定科目の集約ルールを設定',
      icon: '📊',
    },
    {
      path: '/userAccountImport',
      title: '勘定科目マッピング',
      description: 'ユーザー独自の勘定科目を管理',
      icon: '👤',
    },
    {
      path: '/financialStatementPreview',
      title: '財務諸表プレビュー',
      description: '作成した財務諸表を確認',
      icon: '📈',
    },
    {
      path: '/grid',
      title: 'グリッドページ',
      description: 'グリッドコンポーネントのサンプル',
      icon: '📝',
    },
  ];

  return (
    <div className="index-container">
      <header className="index-header">
        <div className="header-content">
          <h1 className="main-title">Financial Model System</h1>
          <p className="subtitle">財務モデリングシステム</p>
        </div>
      </header>

      <main className="index-main">
        <div className="cards-grid">
          {menuItems.map((item, index) => (
            <Link key={index} to={item.path} className="card-link">
              <div className="card">
                <div className="card-icon">{item.icon}</div>
                <h2 className="card-title">{item.title}</h2>
                <p className="card-description">{item.description}</p>
                <div className="card-arrow">→</div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="index-footer">
        <p>© 2024 Financial Model System. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default IndexPage;
