import React from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../../constants/colors';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';
import DogSilhouette from '../DogSilhouette';

const NotFoundPage = () => {
    useDocumentTitle('Page Not Found');
    return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.offWhite }}>
            <Navigation isLoaded={true} onBookClick={() => { }} />

            <main className="flex-grow flex items-center justify-center px-6 pt-32 pb-20">
                <div className="text-center max-w-lg relative">
                    {/* Background Dog */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
                        <DogSilhouette
                            color={colors.teal}
                            className="w-96 h-auto"
                        />
                    </div>

                    <div className="relative z-10">
                        <span className="text-8xl mb-6 block">🐕‍🦺</span>

                        <h1
                            className="heading-font font-bold text-6xl md:text-7xl mb-4"
                            style={{ color: colors.teal }}
                        >
                            404
                        </h1>

                        <h2
                            className="heading-font font-semibold text-2xl md:text-3xl mb-6"
                            style={{ color: colors.plum }}
                        >
                            Oops! This page has wandered off
                        </h2>

                        <p
                            className="body-font text-lg mb-10 max-w-md mx-auto"
                            style={{ color: colors.teal, opacity: 0.8 }}
                        >
                            Looks like this page went chasing squirrels. Let's get you back on track!
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                                to="/"
                                className="px-8 py-4 rounded-full font-bold text-lg text-white transition-all hover:scale-105 hover:shadow-lg"
                                style={{ backgroundColor: colors.green }}
                            >
                                Go Home
                            </Link>
                            <Link
                                to="/services"
                                className="px-8 py-4 rounded-full font-bold text-lg transition-all hover:scale-105 border-2"
                                style={{ borderColor: colors.teal, color: colors.teal }}
                            >
                                View Services
                            </Link>
                        </div>
                    </div>
                </div>
            </main>

            <FooterSection />
        </div>
    );
};

export default NotFoundPage;
