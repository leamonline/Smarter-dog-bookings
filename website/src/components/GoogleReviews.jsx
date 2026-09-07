import React from 'react';
import { colors } from '../constants/colors';

// Curated reviews that tell a story
// Featured: trust, longevity, complex needs
// Supporting: joy, medical/vulnerable, switchers, loyalty

const featuredReview = {
    name: "Sandra W.",
    tagline: "30+ years with us",
    text: "Been going to Smarter Dogs for over 30 years, they are brilliant. Sam & Liam are the best – so caring and they genuinely love the dogs they groom. Cassie is 17 now, blind and deaf, but she still loves to go and see them and always comes out looking beautiful."
};

const supportingReviews = [
    {
        name: "Wallis",
        tagline: "Excited every time",
        text: "Incredible groomers. Our puppy gets excited when we're near the shop, which is always a good sign! They looked after our old dog and their advice and care really improved his skin and coat. Their cuts are excellent and reasonably priced – definitely recommended."
    },
    {
        name: "Lindsay C.",
        tagline: "Back after a big operation",
        text: "Thank you so much for grooming Barney today. After his big operation this year I didn't think he would cope – but he did. He smells divine and you've done a great job with him. I wouldn't go anywhere else now."
    },
    {
        name: "K.G.",
        tagline: "Took a chance changing groomers",
        text: "Took a chance changing groomers and took my little Yorkie here for the first time. What a fantastic place! Definitely caring doggy lovers!!"
    },
    {
        name: "Kate M.",
        tagline: "Wouldn't go anywhere else",
        text: "I wouldn't go anywhere else, other than Smarter Dogs. The staff are fantastic. I can hand on heart say not only do they do an exceptional job with the dog grooming, they genuinely care."
    }
];

// Simple star display
const Stars = () => (
    <span className="text-yellow-400 text-sm tracking-wide">★★★★★</span>
);

// Review card component
const ReviewCard = ({ name, tagline, text, featured = false }) => (
    <div
        className={`rounded-2xl shadow-sm ${featured
            ? 'p-10 border-l-4'
            : 'p-6 border border-gray-100 bg-white'
            }`}
        style={featured ? {
            borderLeftColor: colors.cyan,
            borderLeftWidth: '5px',
            backgroundColor: '#FDFCFA',
            borderTop: '1px solid #f0ede8',
            borderRight: '1px solid #f0ede8',
            borderBottom: '1px solid #f0ede8'
        } : {}}
    >
        <div className={featured ? 'mb-5' : 'mb-4'}>
            <p
                className={`font-semibold ${featured ? 'text-xl' : 'text-lg'}`}
                style={{ color: colors.plum }}
            >
                {name}
            </p>
            <span
                className="text-base"
                style={{ color: colors.teal, opacity: 0.85 }}
            >
                {tagline}
            </span>
        </div>
        <p
            className={`body-font leading-relaxed ${featured ? 'text-lg' : ''}`}
            style={{ color: colors.teal }}
        >
            "{text}"
        </p>
    </div>
);

const GoogleReviews = () => {
    return (
        <div className="w-full">
            {/* Rating summary */}
            <div className="flex items-center justify-center gap-2 mb-10">
                <Stars />
                <span className="text-sm" style={{ color: colors.teal }}>
                    4.9 on Google from local dog owners
                </span>
            </div>

            {/* Featured review - full width */}
            <div className="mb-6">
                <ReviewCard {...featuredReview} featured={true} />
            </div>

            {/* Supporting reviews - 2x2 grid */}
            <div className="grid md:grid-cols-2 gap-5">
                {supportingReviews.map((review, index) => (
                    <ReviewCard key={index} {...review} />
                ))}
            </div>

            {/* Google link */}
            <div className="flex items-center justify-center mt-8 pt-6 border-t border-gray-100">
                <a
                    href="https://g.page/r/CQJp3bxjrSfmEAE/review"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                    style={{ color: colors.teal }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    See all reviews on Google →
                </a>
            </div>
        </div>
    );
};

export default GoogleReviews;
