import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { colors } from '../constants/colors';
import { useAuth } from '../hooks/useAuth';

const tabs = [
    { to: '/account', label: 'Dashboard', end: true },
    { to: '/account/profile', label: 'Profile' },
    { to: '/account/dogs', label: 'Dogs' },
    { to: '/account/bookings', label: 'Bookings' },
];

export default function AccountLayout({ children, heading, subheading }) {
    const { human, signOut } = useAuth();
    const navigate = useNavigate();
    const firstName = human?.name?.split(' ')[0] ?? '';

    const handleSignOut = async () => {
        await signOut();
        navigate('/', { replace: true });
    };

    return (
        <div className="min-h-screen px-4 py-8 md:py-14" style={{ backgroundColor: colors.warmBeige }}>
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <Link to="/" className="text-sm font-medium" style={{ color: colors.teal }}>
                        ← Smarter Dog
                    </Link>
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="text-sm font-medium underline"
                        style={{ color: colors.teal }}
                    >
                        Sign out
                    </button>
                </div>

                <header className="mb-6">
                    <h1
                        className="heading-font font-bold text-3xl md:text-4xl"
                        style={{ color: colors.teal }}
                    >
                        {heading ?? (firstName ? `Hi, ${firstName}` : 'My account')}
                    </h1>
                    {subheading && (
                        <p className="body-font text-sm md:text-base text-gray-600 mt-1">{subheading}</p>
                    )}
                </header>

                <nav
                    className="flex flex-wrap gap-2 mb-6 bg-white rounded-2xl p-2 shadow-sm"
                    aria-label="Account navigation"
                >
                    {tabs.map((tab) => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            end={tab.end}
                            className={({ isActive }) =>
                                `px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                                    isActive ? 'text-white' : 'hover:bg-gray-50'
                                }`
                            }
                            style={({ isActive }) =>
                                isActive
                                    ? { backgroundColor: colors.teal, color: 'white' }
                                    : { color: colors.teal }
                            }
                        >
                            {tab.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8">{children}</div>
            </div>
        </div>
    );
}
