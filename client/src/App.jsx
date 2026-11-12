import React, { useState, useEffect } from 'react';
import { getUser, getToken, setToken, setUser, api } from './api/client';
import Navbar from './components/Navbar';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import CamerasPage from './pages/CamerasPage';
import UploadPage from './pages/UploadPage';
import SearchPage from './pages/SearchPage';

export default function App() {
  const [currentUser, setCurrentUser] = useState(getUser());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchPlateQuery, setSearchPlateQuery] = useState('');

  useEffect(() => {
    if (getToken()) {
      api
        .getMe()
        .then((res) => {
          setCurrentUser(res.user);
          setUser(res.user);
        })
        .catch(() => {
          handleLogout();
        });
    }
  }, []);

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setCurrentUser(null);
  };

  const handleSearchFromDashboard = (plate) => {
    setSearchPlateQuery(plate);
    setActiveTab('search');
  };

  if (!currentUser) {
    return <AuthPage onAuthSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={currentUser}
        onLogout={handleLogout}
      />
      <main style={{ flex: 1, paddingBottom: '40px' }}>
        {activeTab === 'dashboard' && (
          <DashboardPage onSearchPlate={handleSearchFromDashboard} />
        )}
        {activeTab === 'cameras' && <CamerasPage />}
        {activeTab === 'upload' && <UploadPage />}
        {activeTab === 'search' && (
          <SearchPage initialPlate={searchPlateQuery} />
        )}
      </main>
    </div>
  );
}

