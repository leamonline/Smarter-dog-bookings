import React from 'react';
import { colors } from '../../constants/colors';
import PolaroidImage from '../PolaroidImage';
import DogSilhouette from '../DogSilhouette';

// Photos with unique tape positions and colors — static, no need to recreate per render
const GALLERY_PHOTOS = [
    { src: '/assets/client-dog-1.jpg', rotation: -4, tape: colors.cyan, tapePos: 'top' },
    { src: '/assets/client-dog-9.jpg', rotation: 5, tape: colors.pink, tapePos: 'top-left' },
    { src: '/assets/client-dog-3.jpg', rotation: -2, tape: colors.orange, tapePos: 'top-right' },
    { src: '/assets/client-dog-4.jpg', rotation: 6, tape: colors.green, tapePos: 'left' },
    { src: '/assets/client-dog-10.jpg', rotation: -5, tape: colors.yellow, tapePos: 'right' },
    { src: '/assets/client-dog-2.jpg', rotation: 3, tape: '#E8506A', tapePos: 'top-left' },
    { src: '/assets/client-dog-5.jpg', rotation: -3, tape: colors.teal, tapePos: 'top-right' },
];

const GallerySection = () => {
    const photos = GALLERY_PHOTOS;

    return (
        <>
            <section
                className="py-16 relative overflow-hidden"
                style={{ backgroundColor: colors.yellow }}
            >
                <div className="max-w-[1600px] mx-auto px-4">
                    <div className="text-center mb-12">
                        <h2
                            className="heading-font font-bold text-4xl md:text-5xl"
                            style={{ color: colors.teal }}
                        >
                            Strike a pose, wet nose.
                        </h2>
                    </div>

                    {/* Wide horizontal collage layout */}
                    <div className="flex flex-wrap justify-center items-center gap-4 md:gap-2">

                        {/* Photo 1 */}
                        <div className="transform -translate-y-4 rotate-[-3deg] hover:scale-105 hover:z-20 transition-all duration-300">
                            <PolaroidImage
                                src={photos[0].src}
                                rotation={photos[0].rotation}
                                tapeColor={photos[0].tape}
                                tapePosition={photos[0].tapePos}
                                size="md"
                            />
                        </div>

                        {/* Dog Silhouette Sticker 1 */}
                        <div className="hidden md:block transform rotate-12 -translate-y-8 -mx-6 z-10">
                            <DogSilhouette color={colors.pink} className="w-20 h-auto opacity-70" />
                        </div>

                        {/* Photo 2 */}
                        <div className="transform translate-y-6 rotate-[4deg] hover:scale-105 hover:z-20 transition-all duration-300">
                            <PolaroidImage
                                src={photos[1].src}
                                rotation={photos[1].rotation}
                                tapeColor={photos[1].tape}
                                tapePosition={photos[1].tapePos}
                                size="md"
                            />
                        </div>

                        {/* Photo 3 */}
                        <div className="transform -translate-y-8 rotate-[-2deg] hover:scale-105 hover:z-20 transition-all duration-300 hidden sm:block">
                            <PolaroidImage
                                src={photos[2].src}
                                rotation={photos[2].rotation}
                                tapeColor={photos[2].tape}
                                tapePosition={photos[2].tapePos}
                                size="md"
                            />
                        </div>

                        {/* Scissors Icon Sticker */}
                        <div className="hidden lg:flex flex-col items-center transform -rotate-[25deg] translate-y-4 -mx-4 z-10">
                            <svg className="w-16 h-16 opacity-60" viewBox="0 0 24 24" fill={colors.teal}>
                                <path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z" />
                            </svg>
                        </div>

                        {/* Photo 4 */}
                        <div className="transform translate-y-2 rotate-[5deg] hover:scale-105 hover:z-20 transition-all duration-300 hidden md:block">
                            <PolaroidImage
                                src={photos[3].src}
                                rotation={photos[3].rotation}
                                tapeColor={photos[3].tape}
                                tapePosition={photos[3].tapePos}
                                size="md"
                            />
                        </div>

                        {/* Dog Silhouette Sticker 2 */}
                        <div className="hidden xl:block transform -rotate-6 translate-y-10 -mx-8 z-10">
                            <DogSilhouette color={colors.cyan} className="w-24 h-auto opacity-60 scale-x-[-1]" />
                        </div>

                        {/* Photo 5 */}
                        <div className="transform -translate-y-6 rotate-[-4deg] hover:scale-105 hover:z-20 transition-all duration-300 hidden lg:block">
                            <PolaroidImage
                                src={photos[4].src}
                                rotation={photos[4].rotation}
                                tapeColor={photos[4].tape}
                                tapePosition={photos[4].tapePos}
                                size="md"
                            />
                        </div>

                        {/* Comb Icon Sticker */}
                        <div className="hidden xl:flex transform rotate-[15deg] -translate-y-2 -mx-6 z-10">
                            <svg className="w-14 h-14 opacity-50" viewBox="0 0 24 24" fill={colors.orange}>
                                <path d="M21.5 10.5h-4v-2h4v2zm0-4h-4v-2h4v2zm0 8h-4v-2h4v2zm-6 6H4.5c-.55 0-1-.45-1-1V4.5c0-.55.45-1 1-1H5v2h2v-2h2v2h2v-2h2v2h2v-2h.5c.55 0 1 .45 1 1v15c0 .55-.45 1-1 1z" />
                            </svg>
                        </div>

                        {/* Photo 6 */}
                        <div className="transform translate-y-4 rotate-[3deg] hover:scale-105 hover:z-20 transition-all duration-300 hidden xl:block">
                            <PolaroidImage
                                src={photos[5].src}
                                rotation={photos[5].rotation}
                                tapeColor={photos[5].tape}
                                tapePosition={photos[5].tapePos}
                                size="md"
                            />
                        </div>

                        {/* Photo 7 */}
                        <div className="transform -translate-y-3 rotate-[-5deg] hover:scale-105 hover:z-20 transition-all duration-300 hidden xl:block">
                            <PolaroidImage
                                src={photos[6].src}
                                rotation={photos[6].rotation}
                                tapeColor={photos[6].tape}
                                tapePosition={photos[6].tapePos}
                                size="md"
                            />
                        </div>
                    </div>

                    {/* Mobile/Tablet: show hidden photos in second row */}
                    <div className="flex flex-wrap justify-center gap-4 mt-6 xl:hidden">
                        <div className="transform translate-y-2 hover:scale-105 transition-all duration-300 sm:hidden">
                            <PolaroidImage
                                src={photos[2].src}
                                rotation={photos[2].rotation}
                                tapeColor={photos[2].tape}
                                tapePosition={photos[2].tapePos}
                                size="md"
                            />
                        </div>
                        <div className="transform -translate-y-4 hover:scale-105 transition-all duration-300 md:hidden">
                            <PolaroidImage
                                src={photos[3].src}
                                rotation={photos[3].rotation}
                                tapeColor={photos[3].tape}
                                tapePosition={photos[3].tapePos}
                                size="md"
                            />
                        </div>
                        <div className="hidden md:block lg:hidden transform translate-y-3 hover:scale-105 transition-all duration-300">
                            <PolaroidImage
                                src={photos[4].src}
                                rotation={photos[4].rotation}
                                tapeColor={photos[4].tape}
                                tapePosition={photos[4].tapePos}
                                size="md"
                            />
                        </div>
                        <div className="hidden lg:flex xl:hidden gap-4">
                            <div className="transform -translate-y-2 hover:scale-105 transition-all duration-300">
                                <PolaroidImage
                                    src={photos[5].src}
                                    rotation={photos[5].rotation}
                                    tapeColor={photos[5].tape}
                                    tapePosition={photos[5].tapePos}
                                    size="md"
                                />
                            </div>
                            <div className="transform translate-y-4 hover:scale-105 transition-all duration-300">
                                <PolaroidImage
                                    src={photos[6].src}
                                    rotation={photos[6].rotation}
                                    tapeColor={photos[6].tape}
                                    tapePosition={photos[6].tapePos}
                                    size="md"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
};

export default GallerySection;
