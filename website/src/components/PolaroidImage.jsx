import React, { useState, useEffect, useRef } from 'react';
import { colors } from '../constants/colors';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';

const RESPONSIVE_WIDTHS = [240, 360, 480, 640];
const RESPONSIVE_SOURCE_LIMITS = {
    '/assets/client-dog-9.jpg': 265,
};

const IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png)$/i;

const buildResponsiveSrcSet = (src, widths, format) => {
    return widths
        .map((width) => `${src.replace(IMAGE_EXT_PATTERN, `-${width}.${format}`)} ${width}w`)
        .join(', ');
};

const PolaroidImage = ({
    src,
    caption,
    rotation = 0,
    tapeColor = colors.cyan,
    tapePosition = 'top', // top, top-left, top-right, left, right
    size = 'lg', // sm, md, lg
    className = "",
    loading = "lazy",
    fetchPriority,
    width,
    height,
    instant = false // If true, skip develop animation
}) => {
    const isTest = typeof window !== 'undefined' && window.IS_TEST;
    const prefersReducedMotion = usePrefersReducedMotion();
    const skipDevelopAnimation = instant || isTest || prefersReducedMotion;
    const [developStage, setDevelopStage] = useState(skipDevelopAnimation ? 4 : 0); // 0=hidden, 1=emerging, 2=shapes, 3=detail, 4=revealed
    const [useOptimizedSources, setUseOptimizedSources] = useState(true);
    const polaroidRef = useRef(null);

    // Randomize tape rotation slightly for realism
    const [tapeRotation] = useState(() => (isTest ? 0 : Math.random() * 10 - 5));
    const [developDelay] = useState(() => (skipDevelopAnimation ? 0 : Math.random() * 500));

    // Scroll-triggered reveal animation with stages
    useEffect(() => {
        if (skipDevelopAnimation) return;

        const timers = [];
        let started = false;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !started) {
                        started = true;
                        observer.disconnect();
                        // Start developing with random delay
                        const firstTimer = setTimeout(() => {
                            setDevelopStage(1);
                            // Stage 2: Blurry shapes emerge (1s)
                            timers.push(setTimeout(() => setDevelopStage(2), 800));
                            // Stage 3: Desaturated details (1.5s)
                            timers.push(setTimeout(() => setDevelopStage(3), 2000));
                            // Stage 4: Full color (2.5s)
                            timers.push(setTimeout(() => setDevelopStage(4), 3500));
                        }, developDelay);
                        timers.push(firstTimer);
                    }
                });
            },
            { threshold: 0.2 }
        );

        if (polaroidRef.current) {
            observer.observe(polaroidRef.current);
        }

        return () => {
            observer.disconnect();
            timers.forEach(clearTimeout);
        };
    }, [developDelay, skipDevelopAnimation]);

    // Get filter based on development stage
    const getImageStyles = () => {
        switch (developStage) {
            case 0: // Undeveloped - dark sepia
                return {
                    filter: 'brightness(0.05) sepia(0.8) blur(8px)',
                    opacity: 0.3
                };
            case 1: // Emerging - faint light, very blurry
                return {
                    filter: 'brightness(0.3) sepia(0.6) blur(6px) contrast(0.8)',
                    opacity: 0.5
                };
            case 2: // Shapes visible - less blur, still desaturated
                return {
                    filter: 'brightness(0.6) sepia(0.4) blur(3px) contrast(0.9) saturate(0.3)',
                    opacity: 0.7
                };
            case 3: // Details emerging - slight blur, more color
                return {
                    filter: 'brightness(0.85) sepia(0.2) blur(1px) contrast(0.95) saturate(0.7)',
                    opacity: 0.9
                };
            case 4: // Fully developed
                return {
                    filter: 'sepia(0.1) contrast(1.05) saturate(1.1)',
                    opacity: 1
                };
            default:
                return { filter: 'none', opacity: 1 };
        }
    };

    // Tape position styles
    const getTapeStyles = () => {
        const baseStyles = {
            backgroundColor: tapeColor + '90',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            clipPath: 'polygon(2% 0%, 98% 0%, 100% 100%, 0% 100%)'
        };

        switch (tapePosition) {
            case 'top-left':
                return {
                    ...baseStyles,
                    top: '-8px',
                    left: '5%',
                    width: '80px',
                    height: '28px',
                    transform: `rotate(${-35 + tapeRotation}deg)`
                };
            case 'top-right':
                return {
                    ...baseStyles,
                    top: '-8px',
                    right: '5%',
                    width: '80px',
                    height: '28px',
                    transform: `rotate(${35 + tapeRotation}deg)`
                };
            case 'left':
                return {
                    ...baseStyles,
                    top: '30%',
                    left: '-20px',
                    width: '60px',
                    height: '24px',
                    transform: `rotate(${-80 + tapeRotation}deg)`
                };
            case 'right':
                return {
                    ...baseStyles,
                    top: '30%',
                    right: '-20px',
                    width: '60px',
                    height: '24px',
                    transform: `rotate(${80 + tapeRotation}deg)`
                };
            default: // top center
                return {
                    ...baseStyles,
                    top: '-12px',
                    left: '50%',
                    width: '100px',
                    height: '28px',
                    transform: `translateX(-50%) rotate(${tapeRotation}deg)`
                };
        }
    };

    const imageStyles = getImageStyles();

    // Size mapping
    const sizeMap = { sm: '180px', md: '240px', lg: '300px' };
    const polaroidWidth = sizeMap[size] || sizeMap.lg;
    const isResponsiveClientDog = Boolean(src && src.startsWith('/assets/client-dog-') && IMAGE_EXT_PATTERN.test(src));
    const maxSourceWidth = isResponsiveClientDog ? (RESPONSIVE_SOURCE_LIMITS[src] || 800) : null;
    const responsiveWidths = isResponsiveClientDog
        ? RESPONSIVE_WIDTHS.filter((widthValue) => widthValue <= maxSourceWidth)
        : [];
    const hasResponsiveVariants = responsiveWidths.length > 0;
    const imageSizesByPolaroidSize = {
        sm: '(max-width: 768px) 44vw, 180px',
        md: '(max-width: 768px) 46vw, 240px',
        lg: '(max-width: 768px) 62vw, 300px',
    };
    const imageSizes = imageSizesByPolaroidSize[size] || imageSizesByPolaroidSize.lg;
    const fallbackWebpSrc = src?.replace(IMAGE_EXT_PATTERN, '.webp');
    const avifSrcSet = hasResponsiveVariants ? buildResponsiveSrcSet(src, responsiveWidths, 'avif') : null;
    const webpSrcSet = hasResponsiveVariants ? buildResponsiveSrcSet(src, responsiveWidths, 'webp') : null;
    const jpegCandidates = hasResponsiveVariants ? buildResponsiveSrcSet(src, responsiveWidths, 'jpg') : null;
    const jpegSrcSet = hasResponsiveVariants ? `${jpegCandidates}, ${src} ${maxSourceWidth}w` : null;
    const handleOptimizedLoadError = () => {
        if (!useOptimizedSources) return;
        setUseOptimizedSources(false);
    };

    return (
        <div
            ref={polaroidRef}
            className={`relative bg-white p-4 pb-12 shadow-layered transform transition-all duration-700 hover:z-50 hover-lift hover-tilt texture-grain ${className}`}
            style={{
                transform: `rotate(${rotation}deg)`,
                width: polaroidWidth,
            }}
        >
            {/* Tape */}
            <div
                className="absolute opacity-80 z-20"
                style={getTapeStyles()}
            />

            {/* Image Container with developing effect */}
            <div
                className="relative aspect-square overflow-hidden mb-4"
                style={{ backgroundColor: '#2a1810' }} // Dark sepia background
            >
                {/* Loading Skeleton - shows during early development stages */}
                {developStage < 2 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white/60 animate-spin" />
                    </div>
                )}

                {src ? (
                    useOptimizedSources ? (
                        <picture>
                            {hasResponsiveVariants ? (
                                <>
                                    <source srcSet={avifSrcSet} sizes={imageSizes} type="image/avif" />
                                    <source srcSet={webpSrcSet} sizes={imageSizes} type="image/webp" />
                                    <source srcSet={jpegSrcSet} sizes={imageSizes} type="image/jpeg" />
                                </>
                            ) : (
                                <source srcSet={fallbackWebpSrc} type="image/webp" />
                            )}
                            <img
                                key="optimized"
                                src={src}
                                srcSet={jpegSrcSet || undefined}
                                sizes={hasResponsiveVariants ? imageSizes : undefined}
                                alt={caption || "Dog being groomed at Smarter Dog Grooming Salon"}
                                className="w-full h-full object-cover transition-all duration-700 ease-out"
                                style={imageStyles}
                                loading={loading}
                                fetchPriority={fetchPriority}
                                width={width}
                                height={height}
                                onError={handleOptimizedLoadError}
                            />
                        </picture>
                    ) : (
                        <img
                            key="fallback"
                            src={src}
                            alt={caption || "Dog being groomed at Smarter Dog Grooming Salon"}
                            className="w-full h-full object-cover transition-all duration-700 ease-out"
                            style={imageStyles}
                            loading={loading}
                            fetchPriority={fetchPriority}
                            width={width}
                            height={height}
                        />
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                        <span className="text-4xl opacity-20">🐾</span>
                    </div>
                )}

                {/* Inner Shadow / Vignette */}
                <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.1)] pointer-events-none" />

                {/* Lens Flare / Light Leak - only visible when developed */}
                <div
                    className="absolute top-0 right-0 w-full h-full pointer-events-none transition-opacity duration-1000"
                    style={{
                        background: 'linear-gradient(45deg, rgba(255,255,255,0) 40%, rgba(255,200,150,0.3) 100%)',
                        opacity: developStage >= 4 ? 0.2 : 0
                    }}
                />
            </div>

            {/* Caption */}
            {caption && (
                <div className="text-center relative">
                    <p
                        className="handwriting text-2xl text-gray-800 transform -rotate-1"
                        style={{ color: colors.plum }}
                    >
                        {caption}
                    </p>
                    {/* Hand-drawn underline */}
                    <svg className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-3/4 h-2 opacity-60" viewBox="0 0 100 5">
                        <path d="M0 2 Q 50 5, 100 2" stroke={tapeColor} strokeWidth="2" fill="none" strokeLinecap="round" />
                    </svg>
                </div>
            )}

            {/* Thumb Smudge (Subtle Imperfection) */}
            <div
                className="absolute bottom-4 right-4 w-12 h-12 bg-black opacity-[0.03] rounded-full blur-md pointer-events-none"
            />
        </div>
    );
};

export default PolaroidImage;
