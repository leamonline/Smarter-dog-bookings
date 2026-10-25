// Services page data - extracted for maintainability
// Update prices and descriptions here without touching UI code

import { colors } from './colors';

export const services = [
    {
        title: "Full Groom",
        price: "From £42",
        description: "The complete makeover. Includes a double bath and blow dry, full body styling to your preference, hygiene clip, paw pad trim, nail trim, and ear cleaning.",
        bestFor: "First visits or dogs needing a full reset",
        color: colors.teal,
        bgColor: 'white'
    },
    {
        title: "Bath & Brush",
        price: "From £38",
        description: "A bath, blow-dry and thorough brush-out to keep your dog fresh between full grooms.",
        bestFor: "Regulars between full grooms",
        color: colors.orange,
        bgColor: 'white'
    },
    {
        title: "Bath & De-shed",
        price: "From £38",
        description: "A bath, blow-dry and de-shedding treatment for double coats and heavy shedders.",
        bestFor: "Double coats and heavy shedders",
        color: colors.yellow,
        bgColor: 'white'
    }
];

export const timeline = [
    { step: 1, title: "Arrival", desc: "We welcome you and your dog, discussing their needs and your styling preferences." },
    { step: 2, title: "The Prep", desc: "A thorough brush out to remove tangles and prepare the coat for bathing." },
    { step: 3, title: "The Bath", desc: "Using our Houndsly natural shampoos, we double wash to ensure a deep clean." },
    { step: 4, title: "The Dry", desc: "Gentle drying with high-velocity dryers to remove dead hair and fluff the coat." },
    { step: 5, title: "The Style", desc: "Clipping and scissoring to create the perfect look for your dog." },
    { step: 6, title: "The Finish", desc: "Nail trimming, ear cleaning, and a final spritz of cologne before the reunion!" }
];

export const additionalServices = {
    puppyIntro: {
        title: "Puppy Groom",
        price: "£38",
        description: "A gentle first experience for puppies under 6 months. We focus on positive association with grooming sounds and sensations. Includes a gentle bath, slow dry, and lots of reassurance.",
        tagline: "No rushing. Plenty of cuddles."
    },
    walkIn: {
        title: "Walk-in Services",
        availability: "Mon, Tue, Wed before 1pm",
        description: "Quick, calm services — no full appointment needed.",
        items: [
            { name: "Nail Clipping", price: "£10" },
            { name: "Ear Cleaning", price: "£10" },
            { name: "Anal Gland Expression", price: "£10" }
        ],
        tagline: "Quick, calm, and over before they realise."
    }
};
