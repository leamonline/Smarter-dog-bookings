import React from 'react';

const IconBase = ({ children, className = "w-full h-full", color = "currentColor", ...props }) => (
    <svg
        viewBox="0 0 24 24"
        fill={color}
        className={className}
        {...props}
    >
        {children}
    </svg>
);

export const ScissorsIcon = (props) => (
    <IconBase {...props}>
        <path d="M18.5 2C16 2 14 4 14 6.5V9L10 13L6 9V6.5C6 4 4 2 1.5 2S-1 4 -1 6.5C-1 9 1 11 3.5 11H4L8 15L4 19H3.5C1 19 -1 21 -1 23.5S1 28 3.5 28S8 26 8 23.5V21L12 17L16 21V23.5C16 26 18 28 20.5 28S25 26 25 23.5S23 19 20.5 19H20L16 15L20 11H20.5C23 11 25 9 25 6.5S23 2 20.5 2S18.5 4 18.5 6.5V9L14 13L18 9V6.5C18 4 18.5 2 18.5 2ZM3.5 8C2.7 8 2 7.3 2 6.5S2.7 5 3.5 5S5 5.7 5 6.5S4.3 8 3.5 8ZM3.5 25C2.7 25 2 24.3 2 23.5S2.7 22 3.5 22S5 22.7 5 23.5S4.3 25 3.5 25ZM20.5 25C19.7 25 19 24.3 19 23.5S19.7 22 20.5 22S22 22.7 22 23.5S21.3 25 20.5 25ZM20.5 8C19.7 8 19 7.3 19 6.5S19.7 5 20.5 5S22 5.7 22 6.5S21.3 8 20.5 8Z" transform="scale(0.8) translate(3, -2)" />
    </IconBase>
);

export const BathtubIcon = (props) => (
    <IconBase {...props}>
        <path d="M20 13V4.83C20 3.27 18.73 2 17.17 2c-.75 0-1.47.3-2 .83l-1.25 1.25c-.16-.05-.33-.08-.5-.08-.92 0-1.67.75-1.67 1.67 0 .92.75 1.67 1.67 1.67.42 0 .8-.16 1.1-.42l.9-1.9 1.5-1.5c.26-.26.62-.42 1.08-.42.83 0 1.5.67 1.5 1.5V13h-2v-2.5c0-1.93-1.57-3.5-3.5-3.5S10 8.57 10 10.5V13H4v6h2.5v3h3v-3h5v3h3v-3H20v-6z" />
    </IconBase>
);

export const DogBrushIcon = (props) => (
    <IconBase {...props}>
        <path d="M9 14h6v4h-6z" />
        <path d="M20 14h-2V9h-2V7h-2v2h-2V7h-2v2H8V7H6v2H4v5H2v2h2v4h16v-4h2v-2zM8 4h8v2H8z" />
    </IconBase>
);

export const PuppyIcon = (props) => (
    <IconBase {...props}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-9c.83 0 1.5.67 1.5 1.5S10.83 14 10 14s-1.5-.67-1.5-1.5S9.17 11 10 11zm4 0c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z" />
        <circle cx="12" cy="16" r="1.5" />
    </IconBase>
);

export const EarIcon = (props) => (
    <IconBase {...props}>
        <path d="M12 2C7.58 2 4 5.58 4 10v4c0 2.21 1.79 4 4 4h1v4h2v-4h2v4h2v-4h1c2.21 0 4-1.79 4-4v-4c0-4.42-3.58-8-8-8zm0 2c3.31 0 6 2.69 6 6v4c0 1.1-.9 2-2 2h-1v-2h-2v2h-2v-2H9v2H8c-1.1 0-2-.9-2-2v-4c0-3.31 2.69-6 6-6z" />
        <path d="M12 6c-2.21 0-4 1.79-4 4v2h8v-2c0-2.21-1.79-4-4-4z" />
    </IconBase>
);

export const GlandIcon = (props) => (
    <IconBase {...props}>
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8.5 13.5h-3v-3h3v-3h3v3h3v3h-3v3h-3v-3z" />
        <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
        <path d="M12 10v4" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 12h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </IconBase>
);

export const NailIcon = (props) => (
    <IconBase {...props}>
        <path d="M18 2h-4c-1.1 0-2 .9-2 2v4h8V4c0-1.1-.9-2-2-2zm-6 8v10c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V10h-8z" />
        <path d="M8 6c-2.21 0-4 1.79-4 4v8c0 2.21 1.79 4 4 4s4-1.79 4-4v-8c0-2.21-1.79-4-4-4zm0 10c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
    </IconBase>
);
