import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../constants/colors';

const Spinner = () => (
    <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
            <div className="text-4xl mb-4 animate-bounce">🐾</div>
            <p className="text-gray-500 text-sm">Loading...</p>
        </div>
    </div>
);

export default function ProtectedRoute({ children }) {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) return <Spinner />;
    if (!session) {
        const next = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/login?next=${next}`} replace />;
    }

    return (
        <div style={{ backgroundColor: colors.warmBeige, minHeight: '100vh' }}>
            {children}
        </div>
    );
}
