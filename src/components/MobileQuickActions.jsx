import React from 'react';
import { colors } from '../constants/colors';
import { trackEvent } from '../utils/analytics';

const MobileQuickActions = ({ onBookClick }) => {
    const handleWhatsAppClick = () => {
        trackEvent('Engagement', 'Click WhatsApp', 'Mobile Quick Actions');
    };

    return (
        <nav
            aria-label="Quick actions"
            className="fixed bottom-0 left-0 right-0 z-40 md:hidden pointer-events-none"
        >
            <div
                className="mx-4 mb-4 rounded-2xl border p-2 shadow-2xl pointer-events-auto backdrop-blur-md"
                style={{
                    backgroundColor: 'rgba(250, 249, 246, 0.94)',
                    borderColor: 'rgba(45, 0, 75, 0.12)',
                }}
            >
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => onBookClick?.('Mobile Quick Actions')}
                        className="w-full rounded-xl px-4 py-3 font-bold text-sm"
                        style={{ backgroundColor: colors.green, color: colors.plum }}
                    >
                        Book now
                    </button>
                    <a
                        href="https://wa.me/447873329440"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleWhatsAppClick}
                        className="w-full rounded-xl px-4 py-3 font-bold text-sm text-center border-2"
                        style={{ borderColor: colors.teal, color: colors.teal }}
                    >
                        WhatsApp us
                    </a>
                </div>
            </div>
        </nav>
    );
};

export default MobileQuickActions;
