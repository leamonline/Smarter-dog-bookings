import React from 'react';
import { colors } from '../../constants/colors';
import DogSilhouette from '../DogSilhouette';
import PawPrint from '../PawPrint';
import PolaroidImage from '../PolaroidImage';
import MagneticButton from '../MagneticButton';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';

import ParallaxSection from '../ParallaxSection';
import HolidayNoticeCard from '../HolidayNoticeCard';
import { GOOGLE_RATING, FOUNDED_YEAR } from '../../constants/salonFacts';

const HeroSection = ({ isLoaded, onBookClick }) => {
    const prefersReducedMotion = usePrefersReducedMotion();
    const headlineAnimationClass = prefersReducedMotion ? '' : 'animate-fade-in-up';
    const imageClusterAnimationClass = prefersReducedMotion
        ? ''
        : (isLoaded ? 'animate-fade-in' : 'opacity-0');

    return (
        <>
            <section className="pt-32 pb-12 md:pb-8 relative overflow-hidden" style={{ backgroundColor: colors.cyan }}>
                {/* Faint background paws — playful texture, kept clear of the headline/subtext */}
                <PawPrint color="white" aria-hidden className="absolute top-24 left-6 w-16 h-auto opacity-10 -rotate-12 pointer-events-none z-0" />
                <PawPrint color="white" aria-hidden className="absolute bottom-16 left-1/3 w-12 h-auto opacity-10 rotate-6 pointer-events-none z-0" />
                <PawPrint color="white" aria-hidden className="absolute top-1/2 right-8 w-20 h-auto opacity-10 rotate-12 pointer-events-none z-0 hidden md:block" />

                <div className="px-6 relative z-10">
                    {/* Background Dog - subtle */}
                    <ParallaxSection speed={0.2} className="absolute top-20 right-0 md:right-20 z-0 opacity-10 pointer-events-none">
                        <DogSilhouette
                            color="white"
                            className="w-96 h-auto rotate-12"
                        />
                    </ParallaxSection>
                    <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10">
                        <div className={`${headlineAnimationClass} max-w-xl`}>

                            {/* Headline — styled like a logo, not a paragraph */}
                            <h1
                                className="heading-font font-black text-5xl md:text-6xl mb-8"
                                style={{
                                    color: colors.plum,
                                    lineHeight: '1.0',
                                    letterSpacing: '-0.025em'
                                }}
                            >
                                Come scruffy.<br />
                                Leave{' '}
                                <span className="relative inline-block">
                                    gorgeous.
                                    {/* The flyer's yellow swash, under one word and clear of the
                                        descenders; it draws in once (off under reduced motion). */}
                                    <svg aria-hidden="true" className="swash-draw absolute left-0 w-full h-[0.22em]" style={{ bottom: '-0.3em' }} viewBox="0 0 200 12" preserveAspectRatio="none" fill="none">
                                        <path d="M3 8 Q 60 3, 110 6.5 T 197 5" pathLength="1" stroke={colors.yellow} strokeWidth="5" strokeLinecap="round" fill="none" />
                                    </svg>
                                </span>
                            </h1>

                            {/* Subline — supporting evidence, not a second headline */}
                            <p
                                className="body-font text-lg leading-relaxed mb-12 max-w-md"
                                style={{
                                    color: colors.plum,
                                    fontWeight: '500'
                                }}
                            >
                                Over 40 years grooming dogs across <span className="whitespace-nowrap">Ashton-under-Lyne</span> and Tameside.<br />
                                No fuss. No rushing. Just experienced local care.
                            </p>

                            {/* Scheduled holiday notice — only when the booking diary confirms it */}
                            <HolidayNoticeCard onBookClick={onBookClick}>

                                {/* CTA (hidden on mobile — the sticky footer covers it): one yellow
                                    button, and the hero's single handwritten line beside it. */}
                                <div className="mt-4 hidden md:flex flex-wrap items-center gap-x-6 gap-y-3">
                                    <MagneticButton
                                        onClick={() => onBookClick('Hero Section')}
                                        className="relative z-10 shrink-0 whitespace-nowrap px-8 py-5 lg:px-10 lg:py-6 rounded-full font-bold text-2xl transition-all duration-300 hover:shadow-xl flex items-center hover-lift active-squish"
                                        style={{
                                            backgroundColor: colors.yellow,
                                            color: colors.plum,
                                            boxShadow: '0 8px 0 #D4A500'
                                        }}
                                    >
                                        <span>Book your dog online</span>
                                    </MagneticButton>
                                    <span
                                        aria-hidden="true"
                                        className="handwriting text-4xl -rotate-3 whitespace-nowrap"
                                        style={{ color: colors.plum }}
                                    >
                                        Easy peasy {'\u2702\uFE0E'}
                                    </span>
                                </div>
                            </HolidayNoticeCard>

                            {/* Proof, in facts already on the page (the stats strip below) */}
                            <p className="body-font text-base font-semibold -mt-4 md:mt-8" style={{ color: colors.plum }}>
                                <span aria-hidden="true">★ </span>{GOOGLE_RATING} on Google · Since {FOUNDED_YEAR}
                            </p>

                        </div>

                        {/* Hero Polaroid Cluster - Responsive */}
                        <div className={`relative h-[350px] md:h-[500px] ${imageClusterAnimationClass} `} style={{ animationDelay: '0.3s' }}>
                            <div className="absolute top-0 left-0 md:left-4 z-10 hover:z-40 transition-all duration-300 scale-[0.6] md:scale-100 origin-top-left">
                                <PolaroidImage
                                    rotation={-5}
                                    tapeColor={colors.yellow}
                                    src="/assets/client-dog-1.jpg"
                                    alt="Happy freshly groomed pup"
                                    fetchPriority="high"
                                    loading="eager"
                                    width={320}
                                    height={400}
                                    instant={true}
                                />
                            </div>
                            <div className="absolute top-12 md:top-24 right-0 z-20 hover:z-40 transition-all duration-300 scale-[0.6] md:scale-100 origin-top-right">
                                <PolaroidImage
                                    rotation={4}
                                    tapeColor={colors.yellow}
                                    src="/assets/client-dog-2.jpg"
                                    alt="Fluffy and fabulous"
                                    loading="lazy"
                                    instant={true}
                                />
                            </div>
                            <div className="absolute bottom-0 left-1/4 z-30 hover:z-40 transition-all duration-300 scale-[0.6] md:scale-100 origin-bottom-left">
                                <PolaroidImage
                                    rotation={-2}
                                    tapeColor={colors.yellow}
                                    src="/assets/client-dog-3.jpg"
                                    caption="Feeling gorgeous"
                                    loading="lazy"
                                />
                            </div>
                        </div>

                    </div>

                </div>
            </section>

            {/* Wave Transition: Cyan -> White (Trust section) */}
            <div style={{ backgroundColor: colors.cyan, lineHeight: 0, position: 'relative', zIndex: 1 }}>
                <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '80px' }}>
                    <path d="M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,64C960,75,1056,85,1152,80C1248,75,1344,53,1392,42.7L1440,32L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z" fill="white" />
                </svg>
            </div>
        </>
    );
};

export default HeroSection;
