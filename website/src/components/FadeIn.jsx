import React, { useEffect, useRef, useState } from 'react';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';

const FadeIn = ({ children, delay = 0, className = '' }) => {
    const isTest = typeof window !== 'undefined' && window.IS_TEST;
    const prefersReducedMotion = usePrefersReducedMotion();
    const [isVisible, setIsVisible] = useState(isTest || prefersReducedMotion);
    const domRef = useRef();

    useEffect(() => {
        if (isTest || prefersReducedMotion) return;

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(entry.target);
                }
            });
        });

        const { current } = domRef;
        if (current) {
            observer.observe(current);
        }

        return () => {
            if (current) {
                observer.unobserve(current);
            }
        };
    }, [isTest, prefersReducedMotion]);

    if (isTest || prefersReducedMotion) {
        return <>{children}</>;
    }

    return (
        <div
            ref={domRef}
            className={`${className} ${isVisible ? 'animate-fade-in-up' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: `${delay}ms`, transitionDuration: '0.8s', transitionProperty: 'opacity, transform' }}
        >
            {children}
        </div>
    );
};

export default FadeIn;
