import React, { useEffect } from 'react';

/**
 * Bounces the visitor to an external URL on mount. Used to keep old
 * in-app routes (e.g. /book) working by redirecting them to the
 * external customer portal. Shows a brief loading state while the
 * browser navigates away.
 */
export default function ExternalRedirect({ to }) {
    useEffect(() => {
        window.location.replace(to);
    }, [to]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="text-4xl mb-4 animate-bounce">🐾</div>
                <p className="text-gray-500 text-sm">Taking you to booking…</p>
            </div>
        </div>
    );
}
