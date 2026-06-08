import React, { useState, useEffect } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import CTASection from '../sections/CTASection';
import FooterSection from '../sections/FooterSection';
import DogSilhouette from '../DogSilhouette';
import SectionDivider from '../SectionDivider';
import ProcessTimeline from '../ProcessTimeline';
import { colors } from '../../constants/colors';
import { services, timeline, additionalServices } from '../../constants/servicesData';
import { goToBooking } from '../../utils/booking';

const ServicesPage = () => {
    const [isLoaded, setIsLoaded] = useState(false);

    const getServiceHeadingColor = (color) => (
        color === colors.orange || color === colors.yellow ? colors.plum : color
    );

    const getServiceButtonTextColor = (color) => (
        color === colors.orange || color === colors.yellow ? colors.plum : 'white'
    );

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('Services');

    return (
        <div className="min-h-screen bg-white">
            <Navigation isLoaded={isLoaded} onBookClick={() => goToBooking('Services Page')} />

            <main id="main-content">
                {/* Hero - now care-focused */}
                <div className="pt-32 pb-16 px-6 text-center relative overflow-hidden" style={{ backgroundColor: colors.offWhite }}>
                    {/* Background Dog */}
                    <div className="absolute top-10 left-0 md:left-20 z-0 opacity-10 pointer-events-none" aria-hidden="true">
                        <DogSilhouette
                            color={colors.teal}
                            className="w-64 h-auto -rotate-12"
                        />
                    </div>

                    <div className="relative z-10">
                        <h1 className="heading-font text-5xl md:text-6xl font-bold mb-6" style={{ color: colors.teal }}>
                            How we look after your dog
                        </h1>
                        <p className="body-font text-xl max-w-2xl mx-auto" style={{ color: colors.teal }}>
                            Calm, careful grooming shaped around your dog's coat, temperament, and comfort.
                        </p>
                    </div>
                </div>

                <SectionDivider type="wave" color={colors.teal} backgroundColor={colors.offWhite} />

                {/* Pricing Tiers */}
                <section className="py-20 px-6" style={{ backgroundColor: colors.teal }}>
                    <div className="max-w-7xl mx-auto">
                        <div className="grid md:grid-cols-3 gap-8 mb-16">
                            {services.map((service, index) => (
                                <div
                                    key={index}
                                    className="rounded-3xl p-8 border-4 transition-transform hover:-translate-y-2 duration-300 flex flex-col shadow-lg"
                                    style={{ borderColor: 'white', backgroundColor: service.bgColor }}
                                >
                                    <h2 className="heading-font text-3xl font-bold mb-2" style={{ color: getServiceHeadingColor(service.color) }}>
                                        {service.title}
                                    </h2>
                                    <p className="text-2xl font-bold mb-4" style={{ color: colors.darkGray }}>{service.price}</p>
                                    <p className="body-font text-lg mb-6 text-gray-600 flex-grow leading-relaxed">{service.description}</p>
                                    <p className="body-font text-base italic mb-8 pt-4 border-t border-gray-100" style={{ color: colors.teal }}>
                                        Best for: {service.bestFor}
                                    </p>
                                    <button
                                        onClick={() => goToBooking('Services Page')}
                                        className="w-full py-4 rounded-full font-bold text-lg transition-opacity hover:opacity-90"
                                        style={{
                                            backgroundColor: service.color,
                                            color: getServiceButtonTextColor(service.color),
                                        }}
                                    >
                                        Book your visit
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Additional Services Info */}
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="bg-white rounded-3xl p-8 shadow-lg">
                                <h3 className="heading-font text-2xl font-bold mb-4" style={{ color: colors.teal }}>
                                    {additionalServices.puppyIntro.title}
                                </h3>
                                <p className="body-font text-lg text-gray-600 mb-4 leading-relaxed">
                                    {additionalServices.puppyIntro.description}
                                </p>
                                <p className="body-font text-base italic mb-4" style={{ color: colors.teal }}>
                                    {additionalServices.puppyIntro.tagline}
                                </p>
                                <p className="font-bold text-lg" style={{ color: colors.plum }}>{additionalServices.puppyIntro.price}</p>
                            </div>
                            <div className="bg-white rounded-3xl p-8 shadow-lg">
                                <h3 className="heading-font text-2xl font-bold mb-4" style={{ color: colors.teal }}>
                                    {additionalServices.walkIn.title}
                                </h3>
                                <p className="body-font text-lg text-gray-600 mb-4 leading-relaxed">
                                    {additionalServices.walkIn.description}
                                    <br />
                                    <strong>Available:</strong> {additionalServices.walkIn.availability}
                                </p>
                                <ul className="space-y-2 text-lg text-gray-700">
                                    {additionalServices.walkIn.items.map((item, idx) => (
                                        <li key={idx}>{item.name} — {item.price}</li>
                                    ))}
                                </ul>
                                <p className="body-font text-base italic mt-4" style={{ color: colors.teal }}>
                                    {additionalServices.walkIn.tagline}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <SectionDivider type="curve" color={colors.blueSlate} backgroundColor={colors.teal} />

                {/* What to Expect Timeline */}
                <section className="py-20 px-6" style={{ backgroundColor: colors.blueSlate }}>
                    <div className="max-w-4xl mx-auto">
                        <h2 className="heading-font text-4xl font-bold text-center mb-4 text-white">
                            What to expect on the day
                        </h2>
                        <p className="body-font text-lg text-center text-white mb-16">
                            We take things at your dog's pace. Here's how a typical visit flows.
                        </p>
                        <div className="mt-8">
                            <ProcessTimeline steps={timeline} />
                        </div>
                    </div>
                </section>

                <SectionDivider type="slant" color="white" backgroundColor={colors.blueSlate} />

                <CTASection onBookClick={() => goToBooking('Services Page')} />
            </main>

            <FooterSection />
        </div>
    );
};

export default ServicesPage;
