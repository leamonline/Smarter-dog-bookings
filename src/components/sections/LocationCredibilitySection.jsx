import React from 'react';
import { colors } from '../../constants/colors';
import FadeIn from '../FadeIn';
import { MapPinTrailIcon, ParkingIcon, RouteClockIcon } from '../BrandIcons';

const TRAVEL_NOTES = [
    { town: 'Ashton-under-Lyne', eta: '5 min' },
    { town: 'Dukinfield', eta: '8 min' },
    { town: 'Stalybridge', eta: '10 min' },
    { town: 'Denton', eta: '12 min' },
    { town: 'Mossley', eta: '14 min' },
    { town: 'Hyde', eta: '15 min' },
];

const LocationCredibilitySection = () => {
    const isTest = typeof window !== 'undefined' && window.IS_TEST;

    return (
        <section className="py-20 px-6 texture-speckle" style={{ backgroundColor: 'white' }}>
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 items-stretch">
                <FadeIn>
                    <article className="rounded-3xl p-6 md:p-8 card-glow" style={{ backgroundColor: colors.yellow }}>
                        <div className="flex items-center gap-3 mb-4" style={{ color: colors.plum }}>
                            <MapPinTrailIcon />
                            <h2 className="heading-font text-3xl md:text-4xl font-bold">Easy to find</h2>
                        </div>
                        <p className="body-font text-lg mb-4" style={{ color: colors.plum }}>
                            183 Kings Road, Ashton-under-Lyne, OL6 8HD
                        </p>
                        {isTest ? (
                            <div
                                className="rounded-2xl border border-black/10 shadow-sm mb-4 h-72 flex items-center justify-center text-center p-6"
                                style={{ backgroundColor: 'rgba(255,255,255,0.6)', color: colors.plum }}
                            >
                                Interactive map preview
                            </div>
                        ) : (
                            <div className="rounded-2xl overflow-hidden border border-black/10 shadow-sm mb-4">
                                <iframe
                                    title="Smarter Dog Grooming Salon map location"
                                    src="https://www.google.com/maps?q=183%20Kings%20Road%2C%20Ashton-under-Lyne%2C%20OL6%208HD&output=embed"
                                    className="w-full h-72"
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                            </div>
                        )}
                        <a
                            href="https://www.google.com/maps/dir/?api=1&destination=183+Kings+Road,+Ashton-under-Lyne,+OL6+8HD"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-bold transition-all hover:scale-105"
                            style={{ backgroundColor: colors.plum, color: 'white' }}
                        >
                            Get directions
                        </a>
                    </article>
                </FadeIn>

                <div className="grid gap-6 reveal-sequence">
                    <article className="rounded-3xl p-6 card-glow" style={{ backgroundColor: colors.offWhite }}>
                        <div className="flex items-center gap-3 mb-4" style={{ color: colors.plum }}>
                            <RouteClockIcon />
                            <h3 className="heading-font text-2xl font-bold">Typical travel times</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {TRAVEL_NOTES.map((entry) => (
                                <span
                                    key={entry.town}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold"
                                    style={{ backgroundColor: 'white', color: colors.teal }}
                                >
                                    {entry.town}
                                    <span style={{ color: colors.plum }}>{entry.eta}</span>
                                </span>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-3xl p-6 card-glow" style={{ backgroundColor: colors.cyan }}>
                        <div className="flex items-center gap-3 mb-4" style={{ color: colors.plum }}>
                            <ParkingIcon />
                            <h3 className="heading-font text-2xl font-bold">Parking and drop-off</h3>
                        </div>
                        <ul className="space-y-3 body-font text-base" style={{ color: colors.plum }}>
                            <li>Free street parking nearby on Kings Road and side streets.</li>
                            <li>Easy kerbside drop-off for nervous or elderly dogs.</li>
                            <li>Flat entrance and quick handover to keep arrivals calm.</li>
                        </ul>
                    </article>
                </div>
            </div>
        </section>
    );
};

export default LocationCredibilitySection;
