import React from 'react';

/**
 * Responsive image component that serves WebP with JPG fallback
 * for maximum browser compatibility and performance.
 */
const ResponsiveImage = ({
    src,
    alt,
    className = '',
    style = {},
    loading = 'lazy',
    ...props
}) => {
    // Generate WebP path from JPG/PNG path
    const webpSrc = src.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    const isConvertible = /\.(jpg|jpeg|png)$/i.test(src);

    if (!isConvertible) {
        // For non-convertible images, use standard img
        return (
            <img
                src={src}
                alt={alt}
                className={className}
                style={style}
                loading={loading}
                {...props}
            />
        );
    }

    return (
        <picture>
            <source srcSet={webpSrc} type="image/webp" />
            <source srcSet={src} type="image/jpeg" />
            <img
                src={src}
                alt={alt}
                className={className}
                style={style}
                loading={loading}
                {...props}
            />
        </picture>
    );
};

export default ResponsiveImage;
