import React, { useState, useEffect } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';
import CTASection from '../sections/CTASection';
import DogSilhouette from '../DogSilhouette';
import SectionDivider from '../SectionDivider';
import { colors } from '../../constants/colors';
import { goToBooking } from '../../utils/booking';

const HoundslyPage = () => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('Houndsly Shop');

    const products = [
        {
            name: 'Calming Shampoo',
            description: 'Lavender & Chamomile for anxious pups. Gentle, tear-free formula.',
            price: '£12.00',
            image: '/assets/shampoo.jpg',
            tag: 'Best Seller'
        },
        {
            name: 'Detangling Spray',
            description: 'For a silky, knot-free coat. Reduces brushing time and static.',
            price: '£10.00',
            image: '/assets/spray.jpg',
            tag: 'New'
        },
        {
            name: 'Ear Cleaner',
            description: 'Gentle solution to remove wax and debris. Helps prevent infections.',
            price: '£9.00',
            image: '/assets/ear-cleaner.jpg'
        }
    ];

    return (
        <div className="min-h-screen bg-white relative">
            <Navigation isLoaded={isLoaded} onBookClick={() => goToBooking('Houndsly Page')} />

            <main id="main-content">
                {/* Coming Soon Overlay */}
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
                    {/* Construction Stripes Top */}
                    <div
                        className="absolute top-0 left-0 right-0 h-8"
                        style={{
                            background: 'repeating-linear-gradient(45deg, #f59e0b, #f59e0b 20px, #000 20px, #000 40px)'
                        }}
                    />

                    <div className="text-center px-6">
                        <div className="text-6xl mb-6">🚧</div>
                        <h1
                            className="heading-font font-bold text-5xl md:text-7xl mb-4"
                            style={{ color: '#f59e0b' }}
                        >
                            Coming Soon
                        </h1>
                        <p className="body-font text-xl text-white mb-8 max-w-md mx-auto">
                            Our Houndsly shop is getting a makeover. Check back soon for natural, handmade grooming products!
                        </p>
                        <a
                            href="/"
                            className="inline-block px-8 py-4 rounded-full font-bold text-lg transition-all hover:scale-105"
                            style={{ backgroundColor: '#f59e0b', color: '#000' }}
                        >
                            Back to Homepage
                        </a>
                    </div>

                    {/* Construction Stripes Bottom */}
                    <div
                        className="absolute bottom-0 left-0 right-0 h-8"
                        style={{
                            background: 'repeating-linear-gradient(45deg, #f59e0b, #f59e0b 20px, #000 20px, #000 40px)'
                        }}
                    />
                </div>

                {/* Hero */}
                <div className="pt-32 pb-16 px-6 text-center relative overflow-hidden" style={{ backgroundColor: colors.offWhite }}>
                    {/* Background Dog */}
                    <div className="absolute top-10 right-0 md:right-20 z-0 opacity-10 pointer-events-none" aria-hidden="true">
                        <DogSilhouette
                            color={colors.orange}
                            className="w-64 h-auto rotate-12"
                        />
                    </div>

                    <div className="relative z-10">
                        <span className="handwriting text-3xl block mb-4" style={{ color: colors.plum }}>
                            Handmade with love
                        </span>
                        <h2 className="heading-font text-5xl md:text-6xl font-bold mb-6" style={{ color: colors.teal }}>
                            Houndsly Shop
                        </h2>
                        <p className="body-font text-xl max-w-2xl mx-auto" style={{ color: colors.teal }}>
                            Natural, vegan, and cruelty-free grooming products. Made in small batches for your best friend.
                        </p>
                    </div>
                </div>

                <SectionDivider type="slant" color={colors.orange} backgroundColor={colors.offWhite} />

                {/* Product Grid */}
                <section className="py-20 px-6" style={{ backgroundColor: colors.orange }}>
                    <div className="max-w-7xl mx-auto">
                        <div className="grid md:grid-cols-3 gap-10">
                            {products.map((product, index) => (
                                <div
                                    key={index}
                                    className="group bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
                                >
                                    <div className="aspect-square bg-gray-100 relative overflow-hidden">
                                        <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-20 group-hover:scale-110 transition-transform duration-500">
                                            🛁
                                        </div>
                                        {product.tag && (
                                            <span
                                                className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold"
                                                style={{ backgroundColor: colors.green, color: colors.plum }}
                                            >
                                                {product.tag}
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-2">
                                            <h2 className="heading-font text-xl font-bold" style={{ color: colors.teal }}>
                                                {product.name}
                                            </h2>
                                            <span className="font-bold text-lg" style={{ color: colors.plum }}>
                                                {product.price}
                                            </span>
                                        </div>
                                        <p className="body-font text-sm text-gray-600 mb-6">
                                            {product.description}
                                        </p>
                                        <button
                                            className="w-full py-3 rounded-full font-bold text-sm transition-colors border-2 hover:text-white"
                                            style={{
                                                borderColor: colors.teal,
                                                color: colors.teal,
                                            }}
                                            onMouseEnter={(e) => {
                                                e.target.style.backgroundColor = colors.teal;
                                                e.target.style.color = 'white';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.target.style.backgroundColor = 'transparent';
                                                e.target.style.color = colors.teal;
                                            }}
                                        >
                                            Add to Cart
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <SectionDivider type="wave" color={colors.green} backgroundColor={colors.orange} />

                {/* Philosophy */}
                <section className="py-20 px-6 text-center" style={{ backgroundColor: colors.green }}>
                    <div className="max-w-3xl mx-auto">
                        <h2 className="heading-font text-4xl font-bold mb-6" style={{ color: colors.plum }}>
                            Why Houndsly?
                        </h2>
                        <p className="body-font text-lg leading-relaxed" style={{ color: colors.plum }}>
                            We believe that what goes on your dog is just as important as what goes in them.
                            That's why all our products are free from harsh chemicals, parabens, and sulfates.
                            Tested on humans, loved by dogs.
                        </p>
                    </div>
                </section>

                <SectionDivider type="curve" color="white" backgroundColor={colors.green} />

                <CTASection onBookClick={() => goToBooking('Houndsly Page')} />
            </main>
            <FooterSection />
        </div>
    );
};

export default HoundslyPage;
