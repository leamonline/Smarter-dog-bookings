import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for trapping focus inside a container (modals, menus).
 * Also handles Escape key to close.
 *
 * @param {boolean} isActive - Whether the focus trap is active
 * @param {function} onEscape - Called when Escape is pressed
 * @returns {React.RefObject} - Ref to attach to the container element
 */
export const useFocusTrap = (isActive, onEscape) => {
    const containerRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    const getFocusableElements = useCallback(() => {
        if (!containerRef.current) return [];
        return Array.from(
            containerRef.current.querySelectorAll(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        ).filter(el => !el.closest('[aria-hidden="true"]'));
    }, []);

    useEffect(() => {
        if (!isActive) return;

        // Store the previously focused element to restore later
        previousActiveElementRef.current = document.activeElement;

        // Focus the first focusable element in the container
        const timer = requestAnimationFrame(() => {
            const focusable = getFocusableElements();
            if (focusable.length > 0) {
                focusable[0].focus();
            }
        });

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onEscape?.();
                return;
            }

            if (e.key !== 'Tab') return;

            const focusable = getFocusableElements();
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                // Shift+Tab: wrap from first to last
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab: wrap from last to first
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            cancelAnimationFrame(timer);
            document.removeEventListener('keydown', handleKeyDown);

            // Restore focus to the element that was focused before the trap
            if (previousActiveElementRef.current && previousActiveElementRef.current.focus) {
                previousActiveElementRef.current.focus();
            }
        };
    }, [isActive, onEscape, getFocusableElements]);

    return containerRef;
};
