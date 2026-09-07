import React from 'react';

const DogSilhouette = ({ color = 'currentColor', className = '', style = {} }) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 923 1057"
            className={className}
            style={style}
            fill={color}
        >
            <path d="M 40,22 L 31,45 L 72,110 L 83,169 L 108,168 L 180,103 L 209,109 L 221,150 L 211,216 L 177,261 L 119,286 L 112,307 L 148,357 L 263,416 L 278,457 L 264,498 L 177,536 L 148,568 L 144,607 L 179,703 L 67,698 L 18,742 L 25,810 L 112,898 L 100,955 L 201,1009 L 350,1043 L 508,1032 L 733,971 L 889,986 L 907,928 L 865,889 L 766,883 L 616,905 L 632,861 L 704,774 L 709,738 L 669,700 L 559,698 L 599,597 L 598,560 L 474,475 L 491,416 L 611,363 L 639,334 L 638,309 L 568,261 L 568,219 L 656,266 L 711,255 L 701,175 L 720,105 L 714,57 L 645,42 L 541,89 L 432,61 L 273,88 L 177,17 Z" />
        </svg>
    );
};

export default DogSilhouette;
