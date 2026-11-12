import React from 'react';

export default function Navbar({ activeTab, setActiveTab, user, onLogout }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'search', label: 'Plate Search & Route' },
    { id: 'cameras', label: 'Cameras' },
    { id: 'upload', label: 'Upload Video' }
  ];

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#38bdf8' }}>
          TRACK<span style={{ color: '#ef4444' }}>BACK</span>
        </div>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Hit-and-Run Tracker</span>
      </div>

      <div className="nav-links">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-link ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <span style={{ fontSize: '14px', color: '#cbd5e1' }}>{user?.name}</span>
        <button className="btn-secondary" onClick={onLogout} style={{ fontSize: '13px' }}>
          Logout
        </button>
      </div>
    </nav>
  );
}

