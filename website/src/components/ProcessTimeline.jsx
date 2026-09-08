import React, { useEffect, useRef } from 'react';
import { colors } from '../constants/colors';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';

const ProcessTimeline = ({ steps }) => {
    const observerRef = useRef(null);
    const prefersReducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        const elements = document.querySelectorAll('.timeline-item');

        if (prefersReducedMotion) {
            elements.forEach((el) => {
                el.classList.remove('opacity-0', 'translate-y-10');
            });
            return;
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animate-fade-in-up');
                        entry.target.classList.remove('opacity-0', 'translate-y-10');
                    }
                });
            },
            { threshold: 0.1 }
        );

        elements.forEach((el) => observerRef.current.observe(el));

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [prefersReducedMotion]);

    return (
        <div className="relative max-w-4xl mx-auto px-4">
            {/* Vertical Line */}
            <div
                className="absolute left-6 md:left-1/2 top-0 bottom-0 w-1.5 -ml-0.5 md:-ml-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
            ></div>

            <div className="space-y-8 md:space-y-12 relative">
                {steps.map((step, index) => (
                    <div
                        key={index}
                        className={`timeline-item ${prefersReducedMotion ? '' : 'opacity-0 translate-y-10'} transition-all duration-700 ease-out flex flex-col md:flex-row gap-4 md:gap-0 items-center ${index % 2 === 0 ? 'md:flex-row-reverse' : ''
                            }`}
                        style={{ transitionDelay: `${index * 100}ms` }}
                    >
                        {/* Content Side */}
                        <div className="flex-1 md:w-1/2 md:px-8 text-center md:text-left">
                            <div
                                className={`bg-white p-5 rounded-2xl shadow-lg relative group hover:-translate-y-1 transition-transform duration-300 ${index % 2 === 0 ? 'md:text-left' : 'md:text-right'
                                    }`}
                            >
                                <h3 className="heading-font text-xl font-bold mb-1" style={{ color: colors.teal }}>
                                    {step.title}
                                </h3>
                                <p className="body-font text-sm text-gray-600 leading-relaxed">
                                    {step.desc}
                                </p>
                                {/* Arrow */}
                                <div
                                    className={`hidden md:block absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white transform rotate-45 ${index % 2 === 0 ? '-left-2' : '-right-2'
                                        }`}
                                ></div>
                            </div>
                        </div>

                        {/* Center Number Bubble */}
                        <div className="relative z-10 flex-shrink-0 w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center font-bold text-lg md:text-xl shadow-xl border-4 border-white transform transition-transform duration-300 hover:scale-110"
                            style={{
                                backgroundColor: colors.yellow,
                                color: colors.teal
                            }}
                        >
                            {step.step}
                        </div>

                        {/* Empty Side for Layout Balance */}
                        <div className="hidden md:block flex-1 md:w-1/2"></div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProcessTimeline;
