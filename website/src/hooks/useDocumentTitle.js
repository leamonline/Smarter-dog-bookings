import { useEffect } from 'react';
import { formatDocumentTitle } from '../seo/documentTitle';

/**
 * Sets the document title on mount and restores the previous title on unmount.
 * Pass absolute=true when `title` is already the full <title> string.
 * @param {string} title
 * @param {boolean} [absolute]
 */
export const useDocumentTitle = (title, absolute = false) => {
    useEffect(() => {
        const prev = document.title;
        document.title = formatDocumentTitle(title, absolute);
        return () => { document.title = prev; };
    }, [title, absolute]);
};

export default useDocumentTitle;
