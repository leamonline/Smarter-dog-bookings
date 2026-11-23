import React from 'react';
import { colors } from '../constants/colors';

// The segmented stripe from the salon's printed flyer: nine rounded segments,
// copied in order from the flyer's top edge (two yellow, one navy, the rest the
// flyer blue; two segments double width). The booking app draws the same
// stripe (src/components/ui/BrandStripe.jsx there); the two apps share values,
// not code (ADR 009).
//
// It frames the top of a page and never sits inside content. Purely
// decorative, so it is hidden from assistive technology.

const STRIPE_SEGMENTS = ['blue', 'blue wide', 'yellow', 'blue', 'navy', 'blue wide', 'blue', 'blue', 'yellow'];

const SEGMENT_COLOUR = { blue: colors.cyan, yellow: colors.yellow, navy: colors.navy };

const BrandStripe = ({ className = '' }) => (
    <div
        aria-hidden="true"
        data-brand-stripe="bar"
        className={`flex gap-1 h-[7px] ${className}`.trim()}
    >
        {STRIPE_SEGMENTS.map((segment, index) => {
            const [hue, width] = segment.split(' ');
            return (
                <span
                    key={index}
                    className="block min-w-0 rounded-[3px]"
                    style={{ flexGrow: width === 'wide' ? 2.1 : 1, flexShrink: 1, flexBasis: 0, backgroundColor: SEGMENT_COLOUR[hue] }}
                />
            );
        })}
    </div>
);

export default BrandStripe;
