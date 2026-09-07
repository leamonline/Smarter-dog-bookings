import React, { useEffect, useRef } from 'react';

const ParallaxSection = ({ children, speed = 0.5, className, style }) => {
    const elementRef = useRef(null);

    useEffect(() => {
        let ticking = false;

        const handleScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    if (elementRef.current) {
                        const scrollY = window.scrollY;
                        elementRef.current.style.transform = `translateY(${scrollY * speed}px)`;
                    }
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [speed]);

    return (
        <div
            ref={elementRef}
            className={className}
            style={{
                ...style,
                willChange: 'transform'
            }}
        >
            {children}
        </div>
    );
};

export default ParallaxSection;
