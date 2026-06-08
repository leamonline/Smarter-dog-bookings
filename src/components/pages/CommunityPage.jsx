import React, { useState, useEffect } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';
import DogSilhouette from '../DogSilhouette';
import SectionDivider from '../SectionDivider';
import FadeIn from '../FadeIn';
import { colors } from '../../constants/colors';
import { communityCategories } from '../../constants/communityData';
import { goToBooking } from '../../utils/booking';
import { DogWalkIcon, PetShopIcon, VetIcon, PetSitterIcon } from '../BrandIcons';

const ICON_MAP = {
    DogWalkIcon,
    PetShopIcon,
    VetIcon,
    PetSitterIcon,
};

const ListingCard = ({ listing, accentColor, tintColor }) => (
    <article
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-md flex flex-col"
    >
        <h3 className="heading-font text-xl font-semibold mb-2" style={{ color: colors.plum }}>
            {listing.name}
        </h3>
        <p className="body-font text-base mb-4 flex-grow leading-relaxed" style={{ color: colors.teal }}>
            {listing.description}
        </p>

        {/* Details */}
        <div className="space-y-2 mb-4 text-sm" style={{ color: colors.darkGray }}>
            {listing.address && (
                <div className="flex items-start gap-2">
                    <span className="mt-0.5" aria-hidden="true">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M12 21s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10z" />
                            <circle cx="12" cy="11" r="2" />
                        </svg>
                    </span>
                    <span>{listing.address}</span>
                </div>
            )}
            {listing.phone && (
                <div className="flex items-center gap-2">
                    <span aria-hidden="true">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                    </span>
                    <a
                        href={`tel:${listing.phone.replace(/\s/g, '')}`}
                        className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                        style={{ color: colors.teal }}
                    >
                        {listing.phone}
                    </a>
                </div>
            )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
            {listing.tags.map((tag) => (
                <span
                    key={tag}
                    className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: tintColor, color: colors.teal }}
                >
                    {tag}
                </span>
            ))}
        </div>

        {/* Website link */}
        {listing.website && (
            <a
                href={listing.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 decoration-dotted hover:decoration-solid transition-colors mt-auto"
                style={{ color: accentColor }}
            >
                Visit website
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
            </a>
        )}
    </article>
);

const CategorySection = ({ category, index, totalCategories }) => {
    const IconComponent = ICON_MAP[category.iconName];
    const isLastCategory = index === totalCategories - 1;

    // Alternate the divider direction for visual variety
    const nextCategory = !isLastCategory ? communityCategories[index + 1] : null;

    return (
        <>
            <section
                id={category.id}
                className="py-16 md:py-20 px-6"
                style={{ backgroundColor: category.tint }}
            >
                <div className="max-w-5xl mx-auto">
                    <FadeIn>
                        <div className="flex items-center gap-3 mb-3" style={{ color: colors.plum }}>
                            {IconComponent && <IconComponent className="w-8 h-8" />}
                            <h2 className="heading-font text-3xl md:text-4xl font-bold">
                                {category.title}
                            </h2>
                        </div>
                        <p className="body-font text-lg mb-10" style={{ color: colors.teal }}>
                            {category.subtitle}
                        </p>
                    </FadeIn>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {category.listings.map((listing, idx) => (
                            <FadeIn key={listing.name} delay={idx * 100}>
                                <ListingCard
                                    listing={listing}
                                    accentColor={category.color}
                                    tintColor={category.tint}
                                />
                            </FadeIn>
                        ))}
                    </div>
                </div>
            </section>

            {nextCategory && (
                <SectionDivider
                    type="wave"
                    color={nextCategory.tint}
                    backgroundColor={category.tint}
                />
            )}
        </>
    );
};

const CommunityPage = () => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('Community');

    return (
        <div className="min-h-screen bg-white">
            <Navigation isLoaded={isLoaded} onBookClick={() => goToBooking('Community Page')} />

            <main id="main-content">
                {/* Hero */}
                <div className="pt-32 pb-16 px-6 text-center relative overflow-hidden" style={{ backgroundColor: colors.offWhite }}>
                    {/* Background Dog */}
                    <div className="absolute top-10 right-0 md:right-20 z-0 opacity-10 pointer-events-none" aria-hidden="true">
                        <DogSilhouette
                            color={colors.teal}
                            className="w-64 h-auto rotate-12"
                        />
                    </div>

                    <div className="relative z-10">
                        <p className="handwriting text-2xl md:text-3xl mb-4" style={{ color: colors.pink }}>
                            for dog lovers, by dog lovers
                        </p>
                        <h1 className="heading-font text-5xl md:text-6xl font-bold mb-6" style={{ color: colors.plum }}>
                            Our Local Community
                        </h1>
                        <p className="body-font text-xl max-w-2xl mx-auto" style={{ color: colors.teal }}>
                            Our favourite walks, trusted vets, and reliable pet care — all within a paw's reach of Ashton-under-Lyne.
                        </p>

                        {/* Quick jump links */}
                        <div className="flex flex-wrap justify-center gap-3 mt-10">
                            {communityCategories.map((cat) => {
                                const Icon = ICON_MAP[cat.iconName];
                                return (
                                    <a
                                        key={cat.id}
                                        href={`#${cat.id}`}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 hover:scale-105 hover:shadow-md"
                                        style={{ backgroundColor: cat.tint, color: colors.plum }}
                                    >
                                        {Icon && <Icon className="w-4 h-4" />}
                                        {cat.title}
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <SectionDivider
                    type="wave"
                    color={communityCategories[0].tint}
                    backgroundColor={colors.offWhite}
                />

                {/* Category Sections */}
                {communityCategories.map((category, index) => (
                    <CategorySection
                        key={category.id}
                        category={category}
                        index={index}
                        totalCategories={communityCategories.length}
                    />
                ))}

                {/* CTA */}
                <SectionDivider
                    type="wave"
                    color={colors.offWhite}
                    backgroundColor={communityCategories[communityCategories.length - 1].tint}
                />

                <section className="py-20 px-6 text-center" style={{ backgroundColor: colors.offWhite }}>
                    <FadeIn>
                        <div className="max-w-2xl mx-auto">
                            <p className="handwriting text-2xl mb-4" style={{ color: colors.pink }}>
                                part of the community
                            </p>
                            <h2 className="heading-font text-3xl md:text-4xl font-bold mb-6" style={{ color: colors.plum }}>
                                Know a great local business?
                            </h2>
                            <p className="body-font text-lg mb-8" style={{ color: colors.teal }}>
                                We're always looking for trusted recommendations to share with our customers. If you know a wonderful local pet service, let us know and we'll add them to the list.
                            </p>
                            <a
                                href="mailto:leam@smarterdog.co.uk?subject=Community%20connection%20suggestion%21"
                                className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-lg active-squish"
                                style={{ backgroundColor: colors.green, color: colors.plum }}
                            >
                                Get in touch
                            </a>
                        </div>
                    </FadeIn>
                </section>
            </main>

            <FooterSection />
        </div>
    );
};

export default CommunityPage;
