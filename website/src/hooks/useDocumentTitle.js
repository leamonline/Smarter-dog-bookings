import { useEffect } from 'react';

const BASE_TITLE = 'Smarter Dog Grooming Salon';

/**
 * Sets the document title on mount and restores the base title on unmount.
 * @param {string} title - Page-specific title segment (prepended to base).
 */
export const useDocumentTitle = (title) => {
    useEffect(() => {
        const prev = document.title;
        document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
        return () => { document.title = prev; };
    }, [title]);
};

export default useDocumentTitle;
