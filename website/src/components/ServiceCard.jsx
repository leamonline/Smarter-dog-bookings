import React from 'react';
import { colors } from '../constants/colors';

// Service card component with color coding
const ServiceCard = ({ icon, title, desc, bestFor, bgColor, accentColor }) => (
    <div
        className="p-8 rounded-3xl transition-all duration-300 hover:shadow-xl hover:-translate-y-2 hover:scale-105 relative overflow-hidden h-full flex flex-col"
        style={{ backgroundColor: bgColor }}
    >
        {/* Decorative circle */}
        <div
            className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20"
            style={{ backgroundColor: accentColor }}
        />
        <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl mb-6 relative z-10"
            style={{ backgroundColor: 'white' }}
        >
            {icon}
        </div>
        <h3
            className="heading-font font-semibold text-xl mb-3 relative z-10"
            style={{ color: colors.teal }}
        >
            {title}
        </h3>
        <p
            className="body-font text-base leading-relaxed relative z-10 flex-grow"
            style={{ color: colors.teal }}
        >
            {desc}
        </p>
        {bestFor && (
            <p
                className="body-font text-base mt-4 pt-4 border-t border-gray-100 relative z-10 italic"
                style={{ color: colors.teal }}
            >
                Best for: {bestFor}
            </p>
        )}
    </div>
);

export default ServiceCard;
