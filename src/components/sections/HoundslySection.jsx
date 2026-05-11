import React from 'react';
import { colors } from '../../constants/colors';
import FadeIn from '../FadeIn';
import PolaroidImage from '../PolaroidImage';

const HoundslySection = () => {
    return (
        <section className="py-24 relative overflow-hidden" style={{ backgroundColor: colors.mutedGreen }}>
            {/* Subtle texture overlay */}
            <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-multiply"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.5'/%3E%3C/svg%3E")` }}
            />

            {/* Decorative paw removed — paw prints get one job only */}

            <div className="max-w-7xl mx-auto px-6 relative z-10">


                {/* Editorial Product Layout - Layered Polaroids & Separate Text */}
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">

                        {/* Left: Layered Polaroids - Centered Vertically */}
                        <div className="relative flex items-center justify-center min-h-[700px]">
                            {/* Main Shampoo Polaroid - Back Layer */}
                            <FadeIn delay={200} className="absolute top-[40%] left-0 -translate-y-1/2 z-10">
                                <div className="transform scale-[2]" style={{ width: '280px' }}>
                                    <PolaroidImage
                                        src="/assets/houndsly-shampoo.jpg"
                                        caption="Houndsly Natural Shampoo"
                                        rotation={-4}
                                        tapeColor={colors.green}
                                        width={300}
                                        height={300}
                                        loading="lazy"
                                    />
                                </div>
                            </FadeIn>

                            {/* Drynamite Polaroid - Front Layer, Slight Overlap */}
                            <FadeIn delay={400} className="absolute bottom-0 right-[10%] translate-y-0 z-20">
                                <div className="transform scale-[1.35]" style={{ width: '280px' }}>
                                    <PolaroidImage
                                        src="/assets/drynamite.jpg"
                                        caption="Drynamite Dry Shampoo"
                                        rotation={5}
                                        tapeColor={colors.cyan}
                                        width={300}
                                        height={300}
                                        loading="lazy"
                                    />
                                </div>
                            </FadeIn>
                        </div>

                        {/* Right: Content - Completely Separate */}
                        <div className="relative z-0 lg:pl-8">
                            <FadeIn delay={600}>
                                {/* Logo moved here */}
                                <img
                                    src="/assets/houndsly-logo-rainbow.png"
                                    alt="Houndsly Pet Products"
                                    className="h-32 md:h-40 w-auto object-contain mb-8 drop-shadow-xl hover:scale-105 transition-transform duration-500"
                                    width="600"
                                    height="446"
                                />

                                {/* Moved Header Text */}
                                <div className="mb-8">
                                    <div className="relative inline-block mb-4">
                                        <span className="handwriting text-3xl md:text-4xl block relative z-10" style={{ color: colors.plum }}>
                                            Handmade with love
                                        </span>
                                        <svg className="absolute -bottom-2 left-0 w-full h-3 text-yellow-400 opacity-60" viewBox="0 0 100 10" preserveAspectRatio="none">
                                            <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="3" fill="none" />
                                        </svg>
                                    </div>
                                </div>

                                <h2 className="heading-font font-bold text-4xl mb-6" style={{ color: colors.plum }}>
                                    Made for sensitive skin
                                </h2>
                                <p className="body-font text-xl mb-6 leading-relaxed" style={{ color: colors.teal }}>
                                    We couldn't find shampoos we were happy putting on our own dogs, so we made our own.
                                    Naturally derived ingredients, no animal products, and properly gentle — even on the fussiest skin.
                                </p>

                                <p className="body-font text-xl mb-8 leading-relaxed" style={{ color: colors.teal }}>
                                    Handmade in small batches, because that's the only way we'd want our dogs washed.
                                </p>

                                {/* Badges Grid */}
                                <div className="grid grid-cols-2 gap-4 mb-8 max-w-md">
                                    {[
                                        { icon: '🌱', text: 'Vegan' },
                                        { icon: '🧴', text: 'Small Batch' }
                                    ].map((badge, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-white/60 p-4 rounded-xl backdrop-blur-sm border border-white/50 shadow-sm hover:shadow-md transition-all">
                                            <span className="text-3xl">{badge.icon}</span>
                                            <span className="font-bold text-base" style={{ color: colors.plum }}>{badge.text}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Salon link - the key differentiator */}
                                <p className="body-font text-base mb-8 italic" style={{ color: colors.teal, opacity: 0.9 }}>
                                    These are the products we actually use in the salon every day.
                                </p>

                                {/* Single CTA */}
                                <a
                                    href="https://houndsly.co.uk"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex px-10 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-lg text-center"
                                    style={{
                                        backgroundColor: colors.plum,
                                        color: 'white'
                                    }}
                                >
                                    Shop Houndsly →
                                </a>
                            </FadeIn>
                        </div>
                    </div>
                </div>
            </div>

            {/* Wave Transition to Reviews (white) */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-0 transform translate-y-px">
                <svg
                    position="relative"
                    display="block"
                    width="calc(138% + 1.3px)"
                    height="126px"
                    viewBox="0 0 1200 120"
                    preserveAspectRatio="none"
                >
                    <path
                        d="M985.66,92.83C906.67,72,823.78,31,743.84,14.19c-82.26-17.34-168.06-16.33-250.45.39-57.84,11.73-114,31.07-172,41.86A600.21,600.21,0,0,1,0,27.35V120H1200V75.85C1132.19,98.94,1055.71,91.33,985.66,92.83Z"
                        fill={colors.offWhite}
                    ></path>
                </svg>
            </div>
        </section>
    );
};

export default HoundslySection;
