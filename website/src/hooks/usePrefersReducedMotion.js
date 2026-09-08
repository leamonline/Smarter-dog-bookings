import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const getSnapshot = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
};

const getServerSnapshot = () => false;

const subscribe = (onStoreChange) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
    }

    const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY);
    const listener = () => onStoreChange();

    if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', listener);
        return () => mediaQueryList.removeEventListener('change', listener);
    }

    mediaQueryList.addListener(listener);
    return () => mediaQueryList.removeListener(listener);
};

const usePrefersReducedMotion = () => {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};

export default usePrefersReducedMotion;
