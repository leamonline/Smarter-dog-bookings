import React from 'react';
import { colors } from '../../constants/colors';
import DogSilhouette from '../DogSilhouette';
import ServiceCard from '../ServiceCard';
import FadeIn from '../FadeIn';

const ServicesSection = () => {
    return (
        <>
            <section className="py-20 relative overflow-hidden" style={{ backgroundColor: colors.pink }}>
                <div className="px-6 relative">
                    {/* Background Dog */}
                    <div className="absolute bottom-0 left-0 md:left-20 z-0 opacity-10 pointer-events-none">
                        <DogSilhouette
                            color="white"
                            className="w-[30rem] h-auto -scale-x-100 rotate-[-10deg]"
                        />
                    </div>

                    {/* Background Icon Decorations - Monochromatic Stickers */}
                    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                        {/* Full Groom Icon */}
                        <div className="absolute top-10 right-20 w-32 h-32 opacity-10 animate-float" style={{ animationDelay: '0s' }}>
                            <picture>
                                <source srcSet="/assets/icons/full-groom.webp" type="image/webp" />
                                <img src="/assets/icons/full-groom.jpg" alt="" width="128" height="128" loading="lazy" className="w-full h-full rounded-full object-cover" style={{ filter: 'grayscale(100%) brightness(2)' }} />
                            </picture>
                        </div>
                        {/* Puppy Intro Icon */}
                        <div className="absolute top-60 left-10 w-24 h-24 opacity-10 animate-float" style={{ animationDelay: '1s' }}>
                            <picture>
                                <source srcSet="/assets/icons/puppy-intro.webp" type="image/webp" />
                                <img src="/assets/icons/puppy-intro.jpg" alt="" width="96" height="96" loading="lazy" className="w-full h-full rounded-full object-cover" style={{ filter: 'grayscale(100%) brightness(2)' }} />
                            </picture>
                        </div>
                        {/* De-Shedding Icon */}
                        <div className="absolute bottom-40 right-10 w-28 h-28 opacity-10 animate-float" style={{ animationDelay: '2s' }}>
                            <picture>
                                <source srcSet="/assets/icons/deshedding.webp" type="image/webp" />
                                <img src="/assets/icons/deshedding.jpg" alt="" width="112" height="112" loading="lazy" className="w-full h-full rounded-full object-cover" style={{ filter: 'grayscale(100%) brightness(2)' }} />
                            </picture>
                        </div>
                        {/* Maintenance Icon */}
                        <div className="absolute top-1/3 right-1/4 w-20 h-20 opacity-10 animate-float" style={{ animationDelay: '1.5s' }}>
                            <picture>
                                <source srcSet="/assets/icons/maintenance-groom.webp" type="image/webp" />
                                <img src="/assets/icons/maintenance-groom.jpg" alt="" width="80" height="80" loading="lazy" className="w-full h-full rounded-full object-cover" style={{ filter: 'grayscale(100%) brightness(2)' }} />
                            </picture>
                        </div>
                        {/* Nail Trim Icon */}
                        <div className="absolute bottom-20 left-1/4 w-16 h-16 opacity-10 animate-float" style={{ animationDelay: '0.5s' }}>
                            <picture>
                                <source srcSet="/assets/icons/nail-trim.webp" type="image/webp" />
                                <img src="/assets/icons/nail-trim.jpg" alt="" width="64" height="64" loading="lazy" className="w-full h-full rounded-full object-cover" style={{ filter: 'grayscale(100%) brightness(2)' }} />
                            </picture>
                        </div>
                    </div>
                    <div className="max-w-6xl mx-auto text-center mb-16 relative z-10">
                        <FadeIn>
                            <h2
                                className="heading-font font-bold text-4xl md:text-5xl"
                                style={{ color: 'white' }}
                            >
                                How we care for your dog
                            </h2>
                        </FadeIn>
                    </div>

                    <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-10 relative z-10">
                        <FadeIn delay={200} className="h-full">
                            <ServiceCard
                                icon={
                                    <picture>
                                        <source srcSet="/assets/icons/full-groom.webp" type="image/webp" />
                                        <img src="/assets/icons/full-groom.jpg" alt="Full Groom" width="96" height="96" loading="lazy" className="w-24 h-24 rounded-full object-cover shadow-sm" />
                                    </picture>
                                }
                                title="Full Groom"
                                desc="The full works — bath, dry, brush, trim, nails, ears, the lot. They'll leave looking like a million quid and smelling even better."
                                bestFor="first visits or long-overdue tidy-ups"
                                bgColor={'white'}
                                accentColor={colors.pink}
                            />
                        </FadeIn>
                        <FadeIn delay={400} className="h-full">
                            <ServiceCard
                                icon={
                                    <picture>
                                        <source srcSet="/assets/icons/maintenance-groom.webp" type="image/webp" />
                                        <img src="/assets/icons/maintenance-groom.jpg" alt="Maintenance Groom" width="96" height="96" loading="lazy" className="w-24 h-24 rounded-full object-cover shadow-sm" />
                                    </picture>
                                }
                                title="Maintenance Groom"
                                desc="Not due a full groom but looking a bit scruffy? This keeps them fresh and tidy in between."
                                bestFor="regulars between full grooms"
                                bgColor={'white'}
                                accentColor={colors.pink}
                            />
                        </FadeIn>
                        <FadeIn delay={600} className="h-full">
                            <ServiceCard
                                icon={
                                    <picture>
                                        <source srcSet="/assets/icons/deshedding.webp" type="image/webp" />
                                        <img src="/assets/icons/deshedding.jpg" alt="De-Shedding" width="96" height="96" loading="lazy" className="w-24 h-24 rounded-full object-cover shadow-sm" />
                                    </picture>
                                }
                                title="De-shedding Groom"
                                desc="For the fluffier breeds who like to redecorate your house with fur. A proper deep clean and undercoat blowout."
                                bestFor="double coats and heavy shedders"
                                bgColor={'white'}
                                accentColor={colors.pink}
                            />
                        </FadeIn>
                        <FadeIn delay={800} className="h-full">
                            <ServiceCard
                                icon={
                                    <picture>
                                        <source srcSet="/assets/icons/puppy-intro.webp" type="image/webp" />
                                        <img src="/assets/icons/puppy-intro.jpg" alt="Puppy Intro" width="96" height="96" loading="lazy" className="w-24 h-24 rounded-full object-cover shadow-sm" />
                                    </picture>
                                }
                                title="Puppy Intro"
                                desc="First salon visit? We take it nice and slow — no rushing, no drama. Just gentle introductions for pups under six months."
                                bestFor="puppies under six months or nervous first-timers"
                                bgColor={'white'}
                                accentColor={colors.pink}
                            />
                        </FadeIn>
                    </div>

                    {/* Additional services row */}
                    <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 mt-16 relative z-10">
                        <FadeIn delay={1000} className="h-full">
                            <div
                                className="p-8 rounded-3xl flex items-center gap-6 transition-all duration-300 hover:shadow-lg h-full hover-lift"
                                style={{ backgroundColor: 'white' }}
                            >
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm"
                                >
                                    <picture>
                                        <source srcSet="/assets/icons/ear-cleaning.webp" type="image/webp" />
                                        <img src="/assets/icons/ear-cleaning.jpg" alt="Ear Cleaning" width="80" height="80" loading="lazy" className="w-full h-full object-cover" />
                                    </picture>
                                </div>
                                <div>
                                    <h4
                                        className="heading-font font-semibold text-xl mb-2"
                                        style={{ color: colors.pink }}
                                    >
                                        Ear Cleaning
                                    </h4>
                                    <p
                                        className="body-font text-base"
                                        style={{ color: colors.teal }}
                                    >
                                        We give their ears a good clean and check for any issues. Keeps them clean, comfy, and stops nasties building up.
                                    </p>
                                </div>
                            </div>
                        </FadeIn>

                        <FadeIn delay={1200} className="h-full">
                            <div
                                className="p-8 rounded-3xl flex items-center gap-6 transition-all duration-300 hover:shadow-lg h-full hover-lift"
                                style={{ backgroundColor: 'white' }}
                            >
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm"
                                >
                                    <picture>
                                        <source srcSet="/assets/icons/anal-gland.webp" type="image/webp" />
                                        <img src="/assets/icons/anal-gland.jpg" alt="Anal Gland Expression" width="80" height="80" loading="lazy" className="w-full h-full object-cover" />
                                    </picture>
                                </div>
                                <div>
                                    <h4
                                        className="heading-font font-semibold text-xl mb-2"
                                        style={{ color: colors.pink }}
                                    >
                                        Anal Gland Expression
                                    </h4>
                                    <p
                                        className="body-font text-base"
                                        style={{ color: colors.teal }}
                                    >
                                        Nobody's favourite topic, but sometimes it needs doing — relieves discomfort and prevents impaction. We handle it so you don't have to.
                                    </p>
                                </div>
                            </div>
                        </FadeIn>

                        <FadeIn delay={1400} className="h-full">
                            <div
                                className="p-8 rounded-3xl flex items-center gap-6 transition-all duration-300 hover:shadow-lg h-full hover-lift"
                                style={{ backgroundColor: 'white' }}
                            >
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm"
                                >
                                    <picture>
                                        <source srcSet="/assets/icons/nail-trim.webp" type="image/webp" />
                                        <img src="/assets/icons/nail-trim.jpg" alt="Nail Clipping" width="80" height="80" loading="lazy" className="w-full h-full object-cover" />
                                    </picture>
                                </div>
                                <div>
                                    <h4
                                        className="heading-font font-semibold text-xl mb-2"
                                        style={{ color: colors.pink }}
                                    >
                                        Nail Clipping
                                    </h4>
                                    <p
                                        className="body-font text-base"
                                        style={{ color: colors.teal }}
                                    >
                                        Quick, stress-free nail clips. Healthier paws, fewer scratches on your floors. Everyone wins.
                                    </p>
                                </div>
                            </div>
                        </FadeIn>
                    </div>
                </div>
            </section>

            {/* Curve Transition: Pink -> Yellow */}
            <div style={{ backgroundColor: colors.pink, lineHeight: 0 }}>
                <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '80px' }}>
                    <path d="M0 0L1440 0L1440 80C1440 80 1100 120 720 120C340 120 0 80 0 80L0 0Z" fill={colors.pink} />
                    <path d="M0 120L1440 120L1440 80C1440 80 1100 120 720 120C340 120 0 80 0 80L0 120Z" fill={colors.yellow} />
                </svg>
            </div>
        </>
    );
};

export default ServicesSection;
