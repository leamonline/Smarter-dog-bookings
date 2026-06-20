import React from 'react';
import { colors } from '../../constants/colors';
import DogSilhouette from '../DogSilhouette';
import PawPrint from '../PawPrint';
import PolaroidImage from '../PolaroidImage';
import MagneticButton from '../MagneticButton';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';

import ParallaxSection from '../ParallaxSection';

const HeroSection = ({ isLoaded, onBookClick }) => {
    const prefersReducedMotion = usePrefersReducedMotion();
    const headlineAnimationClass = prefersReducedMotion ? '' : 'animate-fade-in-up';
    const imageClusterAnimationClass = prefersReducedMotion
        ? ''
        : (isLoaded ? 'animate-fade-in' : 'opacity-0');

    return (
        <>
            <section className="pt-32 pb-24 relative overflow-hidden" style={{ backgroundColor: colors.cyan }}>
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
                        <div className={`${headlineAnimationClass} max-w-lg`}>

                            {/* Headline — styled like a logo, not a paragraph */}
                            <h1
                                className="heading-font font-semibold text-5xl md:text-6xl mb-8"
                                style={{
                                    color: colors.plum,
                                    lineHeight: '1.0',
                                    letterSpacing: '-0.02em'
                                }}
                            >
                                Come scruffy.<br />
                                <span
                                    className="relative inline-block mt-1"
                                    style={{ color: colors.plum }}
                                >
                                    Leave gorgeous.
                                    {/* Yellow underline — slightly thinner, extends beyond text */}
                                    <svg className="absolute -bottom-2 left-[-5%] w-[110%]" viewBox="0 0 220 10" fill="none">
                                        <path d="M2 6 Q 55 2, 110 6 T 218 6" stroke={colors.yellow} strokeWidth="3" strokeLinecap="round" fill="none" />
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
                                Over 40 years grooming dogs across Ashton-under-Lyne and Tameside.<br />
                                No fuss. No rushing. Just experienced local care.
                            </p>

                            {/* CTA cluster (hidden on mobile — sticky footer covers this) */}
                            <div className="relative mt-4 hidden md:flex flex-col items-start gap-0 pr-16 pb-8">
                                {/* Booking button — chunky, 3D bottom shadow */}
                                <MagneticButton
                                    onClick={() => onBookClick('Hero Section')}
                                    className="relative z-10 px-14 py-7 rounded-full font-bold text-2xl transition-all duration-300 hover:shadow-xl flex items-center hover-lift active-squish"
                                    style={{
                                        backgroundColor: colors.yellow,
                                        color: colors.plum,
                                        boxShadow: '0 9px 0 #E0A800'
                                    }}
                                >
                                    <span>Book your dog online</span>
                                </MagneticButton>

                                {/* Handwritten "Easy peasy" tag — overlaps the button's lower edge */}
                                <span
                                    aria-hidden="true"
                                    className="handwriting relative z-20 -mt-5 ml-8 -rotate-3 px-6 py-2 rounded-xl text-4xl font-semibold flex items-center gap-2"
                                    style={{
                                        backgroundColor: colors.yellow,
                                        color: colors.plum,
                                        boxShadow: '0 4px 12px rgba(45, 0, 75, 0.20)'
                                    }}
                                >
                                    <span className="text-2xl">✂</span>
                                    Easy peasy
                                    <span className="text-2xl -scale-x-100">✂</span>
                                </span>

                                {/* Wavy round stamp sticker — overlaps the button's upper-right corner */}
                                <span
                                    aria-hidden="true"
                                    className="absolute z-30 -top-8 right-0 rotate-[9deg] pointer-events-none drop-shadow-lg"
                                >
                                    <svg width="132" height="132" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                                        {/* Scalloped / wavy outer edge: ring of little circles */}
                                        <g fill="white">
                                            <circle cx="60" cy="10" r="8.5" />
                                            <circle cx="79.13" cy="13.81" r="8.5" />
                                            <circle cx="95.36" cy="24.64" r="8.5" />
                                            <circle cx="106.19" cy="40.87" r="8.5" />
                                            <circle cx="110" cy="60" r="8.5" />
                                            <circle cx="106.19" cy="79.13" r="8.5" />
                                            <circle cx="95.36" cy="95.36" r="8.5" />
                                            <circle cx="79.13" cy="106.19" r="8.5" />
                                            <circle cx="60" cy="110" r="8.5" />
                                            <circle cx="40.87" cy="106.19" r="8.5" />
                                            <circle cx="24.64" cy="95.36" r="8.5" />
                                            <circle cx="13.81" cy="79.13" r="8.5" />
                                            <circle cx="10" cy="60" r="8.5" />
                                            <circle cx="13.81" cy="40.87" r="8.5" />
                                            <circle cx="24.64" cy="24.64" r="8.5" />
                                            <circle cx="40.87" cy="13.81" r="8.5" />
                                        </g>
                                        {/* Solid disc + dashed cyan ring */}
                                        <circle cx="60" cy="60" r="52" fill="white" />
                                        <circle cx="60" cy="60" r="47" fill="none" stroke={colors.cyan} strokeWidth="2.5" strokeDasharray="2 4" strokeLinecap="round" />
                                        {/* Top flourish */}
                                        <text x="60" y="34" textAnchor="middle" fontSize="13" fill={colors.cyan}>✦</text>
                                        {/* Phrase — centred handwriting, three lines */}
                                        <text className="handwriting" textAnchor="middle" fill={colors.plum} fontWeight="700" fontSize="15">
                                            <tspan x="60" y="56">quick and easy,</tspan>
                                            <tspan x="60" y="72">whenever it</tspan>
                                            <tspan x="60" y="88">suits you.</tspan>
                                        </text>
                                    </svg>
                                </span>
                            </div>

                        </div>

                        {/* Hero Polaroid Cluster - Responsive */}
                        <div className={`relative h-[350px] md:h-[500px] ${imageClusterAnimationClass} `} style={{ animationDelay: '0.3s' }}>
                            <div className="absolute top-0 left-0 md:left-4 z-10 hover:z-40 transition-all duration-300 scale-[0.6] md:scale-100 origin-top-left">
                                <PolaroidImage
                                    rotation={-5}
                                    tapeColor={colors.cyan}
                                    src="/assets/client-dog-1.jpg"
                                    caption="Happy freshly groomed pup"
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
                                    tapeColor={colors.cyan}
                                    src="/assets/client-dog-2.jpg"
                                    caption="Fluffy and fabulous"
                                    loading="lazy"
                                    instant={true}
                                />
                            </div>
                            <div className="absolute bottom-0 left-1/4 z-30 hover:z-40 transition-all duration-300 scale-[0.6] md:scale-100 origin-bottom-left">
                                <PolaroidImage
                                    rotation={-2}
                                    tapeColor={colors.cyan}
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
