import React from 'react';

// Decorative paw print — purely visual, so it's hidden from assistive tech.
const PawPrint = ({ color = 'currentColor', className = '', style = {} }) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 104 104"
            className={className}
            style={style}
            fill={color}
            aria-hidden="true"
            focusable="false"
        >
            {/* Toe beans */}
            <ellipse cx="20" cy="46" rx="10" ry="13" transform="rotate(-18 20 46)" />
            <ellipse cx="42" cy="28" rx="11" ry="14" />
            <ellipse cx="64" cy="28" rx="11" ry="14" />
            <ellipse cx="86" cy="46" rx="10" ry="13" transform="rotate(18 86 46)" />
            {/* Main pad */}
            <path d="M 53 50 C 72 50, 84 64, 82 80 C 80 95, 64 100, 53 100 C 42 100, 26 95, 24 80 C 22 64, 34 50, 53 50 Z" />
        </svg>
    );
};

export default PawPrint;
