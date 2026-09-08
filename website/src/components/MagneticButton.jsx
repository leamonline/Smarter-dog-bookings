import React, { useRef, useState } from 'react';

const MagneticButton = ({ children, className, style, onClick }) => {
    const buttonRef = useRef(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        const { clientX, clientY } = e;
        const { left, top, width, height } = buttonRef.current.getBoundingClientRect();

        const x = clientX - (left + width / 2);
        const y = clientY - (top + height / 2);

        setPosition({ x: x * 0.2, y: y * 0.2 });
    };

    const handleMouseLeave = () => {
        setPosition({ x: 0, y: 0 });
    };

    return (
        <button
            ref={buttonRef}
            className={className}
            style={{
                ...style,
                transform: `translate(${position.x}px, ${position.y}px)`,
                transition: 'transform 0.1s ease-out',
            }}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {children}
        </button>
    );
};

export default MagneticButton;
