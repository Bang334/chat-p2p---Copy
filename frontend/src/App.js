import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Chat from './pages/Chat';
import authService from './services/authService';
import './App.css';

// Protected Route Component
function ProtectedRoute({ children }) {
  return authService.isAuthenticated() ? children : <Navigate to="/login" />;
}

// Public Route Component  
function PublicRoute({ children }) {
  return authService.isAuthenticated() ? <Navigate to="/chat" /> : children;
}

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route 
            path="/login" 
            element={<PublicRoute><Login /></PublicRoute>} 
          />
          <Route 
            path="/chat" 
            element={<ProtectedRoute><Chat /></ProtectedRoute>} 
          />
          <Route 
            path="/" 
            element={<Navigate to={authService.isAuthenticated() ? "/chat" : "/login"} />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

