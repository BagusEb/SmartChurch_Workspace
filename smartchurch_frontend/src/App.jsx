import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import Layout from './components/Layout';
import LeaderLayout from './pages/LeaderLayout';
import LeaderChat from './pages/LeaderChat';
import LeaderReportPage from './pages/LeaderReportPage';
import Members from './pages/Members';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ManageUsers from './pages/ManageUsers';
import Attendance from './pages/Attendance';
import GuestValidation from './pages/GuestValidation';
import AttendanceReport from './pages/AttendanceReport';
import AdminAIChat from './pages/AdminAIChat';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setIsAuthenticated(true);
        setUserRole(decoded.role);
      } catch {
        localStorage.clear();
      }
    }
  }, []);

  const handleLogin = (token) => {
    const decoded = jwtDecode(token);
    setIsAuthenticated(true);
    setUserRole(decoded.role);
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={(() => {
            if (!isAuthenticated) return <Login onLogin={handleLogin} />;
            return <Navigate to="/" replace />;
          })()}
        />

        <Route
          path="/"
          element={(() => {
            if (!isAuthenticated) return <Navigate to="/login" replace />;
            if (userRole === 'leader') return <LeaderLayout />;
            return <Layout role={userRole} />;
          })()}
        >
          {/* Index: leaders redirect to /chat, admins see Dashboard */}
          <Route
            index
            element={userRole === 'leader' ? <Navigate to="/chat" replace /> : <Dashboard />}
          />

          {/* Chat routes — served to both roles via their respective layouts */}
          <Route
            path="chat"
            element={
              userRole === 'leader' ? <LeaderChat /> :
              userRole === 'admin' ? <AdminAIChat /> :
              <Navigate to="/" replace />
            }
          />
          <Route
            path="chat/:threadId"
            element={
              userRole === 'leader' ? <LeaderChat /> :
              userRole === 'admin' ? <AdminAIChat /> :
              <Navigate to="/" replace />
            }
          />

          {/* Report — served to both roles */}
          <Route
            path="report"
            element={
              userRole === 'leader' ? <LeaderReportPage /> : <AttendanceReport />
            }
          />

          {/* Admin-only routes */}
          <Route
            path="members"
            element={userRole === 'admin' ? <Members /> : <Navigate to="/" replace />}
          />
          <Route
            path="attendance"
            element={userRole === 'admin' ? <Attendance /> : <Navigate to="/" replace />}
          />
          <Route
            path="manage-users"
            element={userRole === 'admin' ? <ManageUsers /> : <Navigate to="/" replace />}
          />
          <Route
            path="validation"
            element={userRole === 'admin' ? <GuestValidation /> : <Navigate to="/" replace />}
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
