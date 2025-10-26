import React from 'react';
import { TabItem } from '../types';

interface TabBarProps {
  tabs: TabItem[];
  group: string;
  title: string;
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onDragStart: (e: React.DragEvent, tab: TabItem, group: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, tab: TabItem, group: string) => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  group,
  title,
  activeTabId,
  onTabClick,
  onDragStart,
  onDragOver,
  onDrop,
}) => (
  <div
    style={{
      padding: '5px 20px',
      backgroundColor: '#f3f4f6',
      borderBottom: '1px solid #e5e7eb',
    }}
  >
    <span
      style={{
        fontSize: '12px',
        fontWeight: '600',
        color: '#4b5563',
        marginRight: '15px',
      }}
    >
      {title}:
    </span>
    {tabs.map((tab) => (
      <div
        key={tab.id}
        draggable
        onDragStart={(e) => onDragStart(e, tab, group)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, tab, group)}
        onClick={() => onTabClick(tab.id)}
        style={{
          display: 'inline-block',
          padding: '6px 16px',
          cursor: 'pointer',
          borderBottom:
            activeTabId === tab.id
              ? '2px solid #3b82f6'
              : '2px solid transparent',
          color: activeTabId === tab.id ? '#3b82f6' : '#6b7280',
          fontWeight: activeTabId === tab.id ? '600' : 'normal',
          transition: 'all 0.2s',
          userSelect: 'none',
        }}
      >
        {tab.title}
      </div>
    ))}
  </div>
);

export default TabBar;
