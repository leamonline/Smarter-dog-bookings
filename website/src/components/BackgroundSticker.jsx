import React from 'react';

const BackgroundSticker = ({ className = '', style = {} }) => {
    return (
        <div
            className={`absolute pointer-events-none select-none mix-blend-multiply opacity-[0.03] ${className}`}
            style={{
                zIndex: 0,
                ...style
            }}
        >
            <img
                src="/assets/sticker.jpg"
                alt=""
                className="w-full h-full object-contain"
            />
        </div>
    );
};

export default BackgroundSticker;
