// Community page data - local recommendations for dog owners in Tameside
// Update listings here without touching UI code

import { colors } from './colors';

export const communityCategories = [
    {
        id: 'dog-walks',
        title: 'Dog Walks',
        subtitle: 'Our favourite local spots for a good sniff and a stretch.',
        color: colors.cyan,
        tint: colors.cyanLight,
        iconName: 'DogWalkIcon',
        listings: [
            {
                name: 'Park Bridge Heritage Centre & Medlock Valley',
                description: 'Atmospheric walks combining industrial heritage ruins with woodland trails and riverside paths along the River Medlock. Multiple routes from 1.5 to 4 miles through varied terrain.',
                address: 'Park Bridge, Ashton-under-Lyne, OL6 8AQ',
                tags: ['Riverside', 'Woodland', 'Scenic', 'Heritage trails'],
            },
            {
                name: 'Daisy Nook Country Park',
                description: 'A 40-hectare country park with waterways, Crime Lake, canal towpaths, and wildflower meadows. One of the most popular dog walking spots in the area with an on-site coffee shop.',
                address: 'Stannybrook Road, Failsworth, M35 9WJ',
                tags: ['Lakeside', 'Canal towpath', 'Off-lead areas', 'Family-friendly'],
            },
            {
                name: 'Stamford Park',
                description: 'A well-maintained 67-acre Victorian park with open grassed areas, a duck pond, gardens, and easy flat paths. A great starting point for longer walks into Stalybridge Country Park.',
                address: '235 Stamford Street, Stalybridge, SK15 1QZ',
                tags: ['Open green space', 'Flat paths', 'Scenic gardens', 'Pond'],
            },
        ],
    },
    {
        id: 'pet-shops',
        title: 'Pet Shops',
        subtitle: 'Local spots we trust for treats, food, and supplies.',
        color: colors.yellow,
        tint: colors.yellowLight,
        iconName: 'PetShopIcon',
        listings: [
            {
                name: 'The Petman',
                description: 'A family-run pet store serving the community for over 45 years. Wide range of pet food, accessories, live animals, and aquatics. Friendly, knowledgeable staff.',
                address: '147 Stamford Street Central, Ashton-under-Lyne, OL6 6XW',
                phone: '0161 330 4701',
                website: 'https://thepetman.co.uk/',
                tags: ['Independent', 'Family-run', 'Long-established'],
            },
            {
                name: 'Dunns Garden & Pet Centre',
                description: 'Local independent centre well known for their raw dog and cat food range. Customers love the friendly staff and competitive prices on natural products.',
                address: '12 Whitelands, Ashton-under-Lyne, OL6 6UT',
                phone: '0161 330 4928',
                website: 'https://dunnsraw.co.uk/',
                tags: ['Independent', 'Raw food specialist', 'Natural products'],
            },
            {
                name: 'Jollyes - The Pet People',
                description: 'Pet superstore offering branded and own-brand products at competitive prices. Loyalty programme, regular offers, and free parking on site.',
                address: 'Unit 2A, Ashton Retail Park, Wellington Road, OL6 6DJ',
                phone: '0161 343 1236',
                website: 'https://www.jollyes.co.uk/store/ashton',
                tags: ['Wide range', 'Competitive prices', 'Free parking'],
            },
        ],
    },
    {
        id: 'vets',
        title: 'Vets',
        subtitle: 'Trusted local practices for when your dog needs medical care.',
        color: colors.teal,
        tint: colors.tealLight,
        iconName: 'VetIcon',
        listings: [
            {
                name: 'Tameside Veterinary Clinic',
                description: 'An established, RCVS-accredited practice with branches across Tameside. Owned by three experienced vets and recognised as an outstanding place to work.',
                address: '341 Oldham Road, Ashton-under-Lyne, OL7 9ND',
                phone: '0161 830 0462',
                website: 'https://www.tamesideveterinaryclinic.co.uk/',
                tags: ['RCVS accredited', 'Multiple branches', 'Wellness plans'],
            },
            {
                name: 'Animal Trust Ashton',
                description: 'A not-for-profit veterinary practice offering free consultations. On-site orthopaedic surgery and emergency out-of-hours care via their affiliated hospital.',
                address: 'Unit 4, Ashton Retail Park, Wellington Road, OL6 6DJ',
                phone: '0161 507 0444',
                website: 'https://www.animaltrust.org.uk/',
                tags: ['Not-for-profit', 'Free consultations', 'Emergency care'],
            },
            {
                name: 'Vets4Pets Ashton-under-Lyne',
                description: 'Locally owned practice with separate cat and dog waiting areas, an in-house lab, and digital X-ray facilities. They also treat exotic pets.',
                address: 'Unit 1A Snipe Retail Park, Snipe Way, OL7 0DN',
                phone: '0161 371 2954',
                website: 'https://www.vets4pets.com/practices/vets4pets-ashton-under-lyne/',
                tags: ['In-house lab', 'Digital imaging', 'Health plans'],
            },
        ],
    },
    {
        id: 'pet-sitters',
        title: 'Pet Sitters & Dog Walkers',
        subtitle: 'Reliable local people to look after your best friend.',
        color: colors.pink,
        tint: colors.pinkLight,
        iconName: 'PetSitterIcon',
        listings: [
            {
                name: 'Fetch Your Lead',
                description: 'A dedicated team of dog walkers established in 2017. All members hold qualifications in Advanced Canine First Aid and Canine Body Language.',
                address: '13 Edward Street, Ashton-under-Lyne, OL6 6RF',
                phone: '07494 545015',
                website: 'https://www.fetchyourlead.net/',
                tags: ['Dog walking', 'Insured', 'DBS checked', 'First aid trained'],
            },
            {
                name: 'Hound-About Walking',
                description: 'Flexible dog walking and pet sitting covering east Manchester and Tameside. One-to-one walks, small group walks (max 4 dogs), and licensed home boarding.',
                address: 'Audenshaw, Droylsden & Ashton-under-Lyne area',
                website: 'https://www.hound-aboutwalking.com/',
                tags: ['Dog walking', 'Home boarding', 'Licensed', 'Insured'],
            },
            {
                name: 'Snobby Dogs The Boardwalk',
                description: 'Over 8 years serving Tameside and Stockport. Offers dog walking, home boarding, pet sitting, and a pet chauffeur service with free regular health checks.',
                address: 'Godley, Hyde (covering wider Tameside)',
                phone: '0161 452 3676',
                website: 'https://www.snobbydogs.co.uk/',
                tags: ['Dog walking', 'Home boarding', 'Pet chauffeur', 'DBS checked'],
            },
        ],
    },
];
