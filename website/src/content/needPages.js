/**
 * The six need pages. Copy is Leam's approved text from the 3 Nov 2026 brief.
 * Strings are the page, word for word. Do not paraphrase them.
 * En dashes are U+2013, matching the brief (and the Sandra / Lindsay quotes).
 */

const EN = '\u2013';

export const SALON_FACTS_NOTE =
  `Smarter Dog Grooming Salon, 183 Kings Road, Ashton-under-Lyne OL6 8HD. Open Monday${EN}Wednesday 8:30am${EN}3:00pm (closed Thursday${EN}Sunday; we close on bank holidays but open the Thursday after). Book by WhatsApp message on 07873 329440 (message only, there's no phone line), email bookings@smarterdog.co.uk, or book online. About 5 minutes from Ashton town, 8 from Dukinfield, 10 from Stalybridge, 12 from Denton, 14 from Mossley and 15 from Hyde. Free street parking on Kings Road and the side streets.`;

const QUOTE_SANDRA =
  `Been going to Smarter Dogs for over 30 years, they are brilliant. Sam & Liam are the best ${EN} so caring and they genuinely love the dogs they groom. Cassie is 17 now, blind and deaf, but she still loves to go and see them and always comes out looking beautiful.`;

const QUOTE_LINDSAY =
  `Thank you so much for grooming Barney today. After his big operation this year I didn't think he would cope ${EN} but he did. He smells divine and you've done a great job with him. I wouldn't go anywhere else now.`;

const QUOTE_KG =
  'Took a chance changing groomers and took my little Yorkie here for the first time. What a fantastic place! Definitely caring doggy lovers!!';

const QUOTE_WALLIS_PUPPY =
  "Our puppy gets excited when we're near the shop, which is always a good sign!";

const QUOTE_WALLIS_SKIN =
  'They looked after our old dog and their advice and care really improved his skin and coat.';

const QUOTE_KATE =
  "I wouldn't go anywhere else, other than Smarter Dogs. The staff are fantastic. I can hand on heart say not only do they do an exceptional job with the dog grooming, they genuinely care.";

const QUOTE_SANDRA_SHORT =
  `Sam & Liam are the best ${EN} so caring and they genuinely love the dogs they groom.`;

export const NEED_PAGES = [
  {
    path: '/nervous-anxious-dog-grooming',
    linkLabel: 'Grooming for nervous and anxious dogs',
    title: 'Grooming for Nervous & Anxious Dogs in Ashton-under-Lyne | Smarter Dog',
    description:
      'Nervous, anxious or reactive dog? Smarter Dog in Ashton-under-Lyne has groomed worried dogs from across Tameside for over 40 years. No rushing, no force, no drama.',
    faqs: [
      {
        name: "Is there a groomer in Tameside who's good with nervous or anxious dogs?",
        text: "Yes. Smarter Dog Grooming Salon on Kings Road, Ashton-under-Lyne, has been grooming anxious, reactive and fearful dogs for over 40 years, for families in Dukinfield, Stalybridge, Denton, Mossley, Hyde and across Tameside. We take our time, read their body language and never force anything. Patience isn't an extra; it's how we work.",
      },
      {
        name: 'Can I stay with my dog?',
        text: "We're happy to have a chat when you drop off, and you're welcome to wait in reception. That said, most dogs settle better once their owner has left. It's often harder on you than on them! We'll always call if there's any issue.",
      },
      {
        name: 'Will my nervous dog ever enjoy it?',
        text: `Many nervous dogs who come to us eventually relax and even enjoy their visits. We've seen it plenty: one of our owners says "${QUOTE_WALLIS_PUPPY}" (Wallis)`,
      },
    ],
    blocks: [
      { type: 'h1', text: "Is there a groomer in Tameside who's good with nervous or anxious dogs?" },
      {
        type: 'lead',
        strong:
          'Yes. Smarter Dog Grooming Salon on Kings Road, Ashton-under-Lyne, has been grooming anxious, reactive and fearful dogs for over 40 years, for families in Dukinfield, Stalybridge, Denton, Mossley, Hyde and across Tameside.',
        rest: "We take our time, read their body language and never force anything. Patience isn't an extra; it's how we work.",
      },
      { type: 'h2', text: 'Who this is for' },
      {
        type: 'ul',
        items: [
          'Dogs who shake, hide or dig their heels in at the door.',
          'Dogs who\'ve had a bad time somewhere else (plenty of our regulars "took a chance changing groomers").',
          'Rescues, worriers and first-timers.',
          'Dogs who are reactive or fearful.',
        ],
      },
      {
        type: 'p',
        text: "Not sure if we're right for your dog? We look at every dog case by case, so drop us a message first and have a chat about them before you book.",
      },
      { type: 'h2', text: 'How we do it' },
      {
        type: 'ul',
        items: [
          { strong: 'No double-booking, no hurrying.', rest: ' Every dog gets the time they need. An appointment is usually around 2 hours.' },
          { strong: 'Calm arrivals.', rest: ' We have a flat entrance, easy kerbside drop-off for nervous or elderly dogs, and a quick handover to keep things calm.' },
          { strong: "We go at your dog's pace.", rest: " We take breaks when they're needed and stop and settle when something's too much." },
          { strong: 'We read the dog, not the clock.', rest: ' Body language tells us when to carry on and when to pause.' },
          { strong: 'The same groomer every visit.', rest: ' Sam or Leam will get to know your dog, and your dog gets to know them.' },
          { strong: 'Quiet slots.', rest: " Nervous dogs can book a quiet slot, when the salon's calmer." },
          { strong: 'No cages, no cabinet dryers. Ever.' },
          { strong: 'A gentler dry.', rest: ' Hate the noise? We use a quieter dryer or towel dry instead, whichever suits your dog.' },
          { strong: 'No sedation, ever.', rest: " We only use a muzzle if it's needed to keep everyone safe." },
        ],
      },
      { type: 'h2', text: "Your dog's first visit: you choose the pace" },
      {
        type: 'p',
        text: "Before anything happens, we chat with you and agree what's right for your dog. There are three ways to start:",
      },
      {
        type: 'ol',
        items: [
          { strong: 'A free meet-and-greet.', rest: ' Pop in, have a sniff around, meet us, and go home. No grooming, no pressure.' },
          { strong: 'A short intro groom.', rest: " Just a little bit to start, and we build it up over a few visits until they're happy with the full works." },
          { strong: "A full groom at your dog's pace.", rest: ' For dogs who can manage it, with as many breaks as they need.' },
        ],
      },
      { type: 'h2', text: 'Can I stay with my dog?' },
      {
        type: 'p',
        text: "We're happy to have a chat when you drop off, and you're welcome to wait in reception. That said, most dogs settle better once their owner has left. It's often harder on you than on them! We'll always call if there's any issue.",
      },
      { type: 'h2', text: 'Will my nervous dog ever enjoy it?' },
      {
        type: 'p',
        text: `Many nervous dogs who come to us eventually relax and even enjoy their visits. We've seen it plenty: one of our owners says "${QUOTE_WALLIS_PUPPY}" (Wallis)`,
      },
      { type: 'quote', text: QUOTE_KG, cite: 'K.G.' },
      { type: 'h2', text: 'Before you come' },
      {
        type: 'p',
        text: "Bring them as they are, muddy walk and all. Let them have a toilet break before you arrive. If it's their first visit, it helps if they've had some positive experiences being handled and brushed at home.",
      },
      {
        type: 'rich',
        parts: [
          { strong: 'Ready?' },
          ' Message us on ',
          { wa: '07873 329440', text: 'WhatsApp (07873 329440)' },
          " and tell us a bit about your dog: what worries them, and what's gone wrong before. We respond to all enquiries within 24 hours.",
        ],
      },
    ],
  },
  {
    path: '/senior-blind-deaf-dog-grooming',
    linkLabel: 'Gentle grooming for old, blind and deaf dogs',
    title: 'Gentle Grooming for Old, Blind & Deaf Dogs in Ashton-under-Lyne | Smarter Dog',
    description:
      'Old, blind, deaf or post-op dog? Smarter Dog in Ashton-under-Lyne grooms senior dogs well into their late teens, with a low table, regular breaks and calm handling.',
    faqs: [
      {
        name: 'My old dog is blind and deaf. Where can I get him groomed gently?',
        text: "Smarter Dog Grooming Salon in Ashton-under-Lyne. We've groomed blind dogs, deaf dogs, three-legged dogs and dogs well into their late teens, for owners right across Tameside. We've got a low table for dogs who struggle to stand, we take regular breaks, and we specialise in elderly dogs.",
      },
      {
        name: 'Quick nails or ears only?',
        text: "Not up to a full groom? Nail clipping, ear cleaning and anal glands are walk-in, £10 each, Monday to Wednesday before 1pm, with no appointment needed. They're quick, calm, and over before they realise.",
      },
    ],
    blocks: [
      { type: 'h1', text: 'My old dog is blind and deaf. Where can I get him groomed gently?' },
      {
        type: 'lead',
        strong:
          "Smarter Dog Grooming Salon in Ashton-under-Lyne. We've groomed blind dogs, deaf dogs, three-legged dogs and dogs well into their late teens, for owners right across Tameside.",
        rest: "We've got a low table for dogs who struggle to stand, we take regular breaks, and we specialise in elderly dogs.",
      },
      { type: 'h2', text: 'What we do differently for older dogs' },
      {
        type: 'ul',
        items: [
          { strong: 'A low table', rest: " for dogs who can't stand for long or struggle to get up." },
          { strong: 'Regular breaks', rest: ", as many as they need. Nobody's in a rush." },
          {
            strong: 'Medical needs respected.',
            rest: ' We regularly groom dogs with arthritis, skin conditions, diabetes, heart conditions and post-surgery restrictions, and we adapt our handling, products and equipment to keep them comfortable. Just tell us beforehand.',
          },
          {
            strong: "We'll tell you if something needs attention.",
            rest: " Lumps, ear infections, dental issues: if we spot something, we'll let you know. Sometimes dogs need a vet, not just another groom.",
          },
          {
            strong: 'Easy arrivals.',
            rest: ' We have a flat entrance and kerbside drop-off for elderly dogs, with free street parking right outside on Kings Road.',
          },
        ],
      },
      { type: 'h2', text: 'How we groom blind and deaf dogs' },
      {
        type: 'ul',
        items: [
          { strong: 'Touch cues.', rest: " They can't see us coming or hear us, so we let them know we're there with a gentle touch before we handle them." },
          { strong: 'Sniff first.', rest: ' We let them have a good sniff of the brushes, clippers and dryer before they go anywhere near them.' },
          { strong: 'The same groomer every visit.', rest: " That's a familiar smell and a familiar pair of hands." },
          { strong: 'A calm, quiet room.' },
          { strong: 'Extra time and breaks', rest: ', as many as they need.' },
        ],
      },
      { type: 'h2', text: 'A shorter groom for older dogs, same price' },
      {
        type: 'p',
        text: "If a full session's too much for an older dog, we can do a shorter groom. It's the same price, because it's about what's comfortable for them, not the clock.",
      },
      { type: 'h2', text: "Cassie's still coming at 17" },
      { type: 'quote', text: QUOTE_SANDRA, cite: 'Sandra W.' },
      { type: 'h2', text: 'Back after a big operation' },
      { type: 'quote', text: QUOTE_LINDSAY, cite: 'Lindsay C.' },
      { type: 'h2', text: 'Quick nails or ears only?' },
      {
        type: 'p',
        text: "Not up to a full groom? Nail clipping, ear cleaning and anal glands are walk-in, £10 each, Monday to Wednesday before 1pm, with no appointment needed. They're quick, calm, and over before they realise.",
      },
      {
        type: 'rich',
        parts: [
          { strong: 'Book:' },
          ' ',
          { wa: '07873 329440', text: 'WhatsApp 07873 329440' },
          ' (message only). Tell us about their eyesight, hearing, joints and any meds.',
        ],
      },
    ],
  },
  {
    path: '/doodle-grooming-matted-coats',
    linkLabel: 'Doodle and cockapoo grooming and matted coats',
    title: 'Doodle & Cockapoo Grooming and Matted Coats in Ashton-under-Lyne | Smarter Dog',
    description:
      'Matted doodle, cockapoo or cavapoo? Smarter Dog in Ashton-under-Lyne sorts matted coats safely and kindly, and sets up a six-weekly routine to keep them mat-free.',
    faqs: [
      {
        name: "My doodle's coat is matted. Who can sort it out near Ashton-under-Lyne?",
        text: "Smarter Dog Grooming Salon in Ashton-under-Lyne, Tameside, grooms cockapoos, cavapoos and poodle mixes, and we deal with matted coats the kind way, never by forcing a painful de-matting. Then we'll help you keep it from coming back with a groom every six weeks.",
      },
    ],
    blocks: [
      { type: 'h1', text: "My doodle's coat is matted. Who can sort it out near Ashton-under-Lyne?" },
      {
        type: 'lead',
        strong:
          'Smarter Dog Grooming Salon in Ashton-under-Lyne, Tameside, grooms cockapoos, cavapoos and poodle mixes, and we deal with matted coats the kind way, never by forcing a painful de-matting.',
        rest: "Then we'll help you keep it from coming back with a groom every six weeks.",
      },
      { type: 'h2', text: 'What happens with a matted coat' },
      {
        type: 'p',
        text: "Matted or compacted fur pulls on the skin and can hide irritation, sores or parasites. Removing it isn't about style; it's about comfort.",
      },
      {
        type: 'ul',
        items: [
          { strong: 'Mild matting:', rest: ' we may be able to gently brush out small areas, if we can do it without causing pain.' },
          { strong: 'Moderate to severe matting:', rest: " we clip the coat short to remove the mats safely. It's often the kindest option." },
          { strong: 'We will never force a painful de-matting process.' },
        ],
      },
      {
        type: 'p',
        text: "Afterwards, expect a shorter-than-usual haircut and maybe some temporary redness or sensitivity where the mats were. Sometimes a skin issue that was hiding under the coat turns up once it's off; we'll tell you if we spot anything.",
      },
      {
        type: 'rich',
        parts: [
          { strong: 'What it costs:' },
          ' a doodle full groom is ',
          { strong: 'from £46' },
          ". If the coat's matted, the extra charge is simply for the extra time it takes to get the mats out safely. No mystery fees.",
        ],
      },
      {
        type: 'rich',
        parts: [
          'Read our full ',
          { link: '/matted-coat-policy', text: 'matted coat policy' },
          '.',
        ],
      },
      { type: 'h2', text: 'Keeping a doodle mat-free (our home routine)' },
      { type: 'p', text: 'For curly and doodle coats (cockapoo, cavapoo, poodle mixes):' },
      {
        type: 'ul',
        items: [
          { strong: 'Rebook every six weeks.', rest: ' Ask us to keep a rolling slot so your dog stays comfortable and mat-free year-round.' },
          'Line-brush the coat four times a week.',
          "Comb legs, armpits and behind the ears daily; that's where mats start.",
          'Dry the beard after meals to stop it knotting.',
          { strong: 'Tools:', rest: " a slicker brush and a metal comb. We can show you the right tools and brushing technique for your dog's coat." },
        ],
      },
      { type: 'h2', text: "What's in a full groom" },
      {
        type: 'p',
        text: "The full works: a double bath and blow dry, full body styling to your preference, hygiene clip, paw pad trim, nail trim and ear cleaning. They'll leave looking like a million quid and smelling even better. Full grooms start from £42, and doodles from £46.",
      },
      {
        type: 'rich',
        parts: [
          { strong: 'Book:' },
          ' ',
          { wa: '07873 329440', text: 'WhatsApp 07873 329440' },
          ". Send us a photo of the coat and we'll give you an honest idea of what to expect.",
        ],
      },
    ],
  },
  {
    path: '/dog-de-shedding-ashton-under-lyne',
    linkLabel: 'Dog de-shedding in Ashton-under-Lyne',
    title: 'Dog De-shedding in Ashton-under-Lyne (Ashton, Tameside) | Smarter Dog',
    description:
      'Dog shedding everywhere? Bath & De-shed from £38 at Smarter Dog, Kings Road, Ashton-under-Lyne, Tameside. A proper deep clean and undercoat blowout for double coats.',
    faqs: [
      {
        name: 'My dog is shedding everywhere. Who does a de-shed in Ashton-under-Lyne?',
        text: "Smarter Dog Grooming Salon on Kings Road, Ashton-under-Lyne (Tameside, Greater Manchester, not Ashton-in-Makerfield), does a Bath & De-shed from £38 for double coats and heavy shedders. It's for the fluffier breeds who like to redecorate your house with fur: a proper deep clean and undercoat blowout.",
      },
      {
        name: 'How often?',
        text: 'For double coats (Golden Retriever, Spaniel, Collie and similar), we recommend a groom every eight weeks. In between: De-shed brush twice a week. Check the feathering for compacted undercoat. Rinse muddy areas and dry them fully after walks. Tools: an undercoat rake and a finishing brush.',
      },
      {
        name: 'Will you shave my double-coated dog?',
        text: 'Only if the coat is badly matted or your vet has advised it. Otherwise we de-shed it properly instead.',
      },
    ],
    blocks: [
      { type: 'h1', text: 'My dog is shedding everywhere. Who does a de-shed in Ashton-under-Lyne?' },
      {
        type: 'lead',
        strong:
          'Smarter Dog Grooming Salon on Kings Road, Ashton-under-Lyne (Tameside, Greater Manchester, not Ashton-in-Makerfield), does a Bath & De-shed from £38 for double coats and heavy shedders.',
        rest: "It's for the fluffier breeds who like to redecorate your house with fur: a proper deep clean and undercoat blowout.",
      },
      { type: 'h2', text: "What's in a Bath & De-shed" },
      {
        type: 'ul',
        items: [
          'A bath with our own Houndsly natural shampoo.',
          'A blow-dry with high-velocity dryers to lift out dead hair and undercoat.',
          'A de-shedding treatment to clear the loose coat before it ends up on your sofa.',
        ],
      },
      {
        type: 'rich',
        parts: [
          { strong: 'Price:' },
          " from £38. The final price depends on how thick the coat is and how long it takes, so a big fluffy Pomeranian-type or a Goldie in full moult may take a bit longer than a sleek one. Send us a photo and we'll give you an idea.",
        ],
      },
      {
        type: 'rich',
        parts: [
          { strong: 'Who we see most for de-sheds:' },
          ' Golden Retrievers, Labradors, Pomeranians and Spitz types.',
        ],
      },
      { type: 'h2', text: 'How often?' },
      {
        type: 'p',
        text: 'For double coats (Golden Retriever, Spaniel, Collie and similar), we recommend a groom every eight weeks. In between:',
      },
      {
        type: 'ul',
        items: [
          'De-shed brush twice a week.',
          'Check the feathering for compacted undercoat.',
          'Rinse muddy areas and dry them fully after walks.',
          { strong: 'Tools:', rest: ' an undercoat rake and a finishing brush.' },
        ],
      },
      { type: 'h2', text: 'Will you shave my double-coated dog?' },
      {
        type: 'p',
        text: 'Only if the coat is badly matted or your vet has advised it. Otherwise we de-shed it properly instead.',
      },
      { type: 'h2', text: 'Close by' },
      {
        type: 'p',
        text: "We're about 5 minutes from Ashton town centre, 8 from Dukinfield, 10 from Stalybridge, 12 from Denton, 14 from Mossley and 15 from Hyde, with free parking outside.",
      },
      {
        type: 'rich',
        parts: [
          { strong: 'Book:' },
          ' ',
          { wa: '07873 329440', text: 'WhatsApp 07873 329440' },
          ', or ',
          { book: 'book online' },
          '.',
        ],
      },
    ],
  },
  {
    path: '/sensitive-skin-dog-grooming-natural-shampoo',
    linkLabel: 'Natural, vegan shampoo for sensitive skin',
    title: 'Natural, Vegan Shampoo for Sensitive Skin: Dog Grooming in Ashton-under-Lyne | Smarter Dog',
    description:
      'Dog with sensitive skin? Every groom at Smarter Dog, Ashton-under-Lyne, uses Houndsly, our own handmade, vegan, cruelty-free natural shampoo made for sensitive skin.',
    faqs: [
      {
        name: 'Is there a dog groomer in Greater Manchester that uses natural shampoo for sensitive skin?',
        text: "Yes. Smarter Dog Grooming Salon in Ashton-under-Lyne, Tameside, uses its own Houndsly shampoos in every groom. They're natural, vegan, cruelty-free, handmade in small batches and designed for sensitive skin. We couldn't find shampoos we were happy putting on our own dogs, so we made our own.",
      },
      {
        name: 'Extra-sensitive? Go unscented',
        text: "There's an unscented version of Houndsly for dogs who don't get on with fragrance. Skip the cologne. Every groom normally finishes with a final spritz of cologne. Just ask and we'll leave it off. Bring your own. If your vet's prescribed a medicated shampoo, bring it along and we'll use that instead.",
      },
    ],
    blocks: [
      { type: 'h1', text: 'Is there a dog groomer in Greater Manchester that uses natural shampoo for sensitive skin?' },
      {
        type: 'lead',
        strong:
          "Yes. Smarter Dog Grooming Salon in Ashton-under-Lyne, Tameside, uses its own Houndsly shampoos in every groom. They're natural, vegan, cruelty-free, handmade in small batches and designed for sensitive skin.",
        rest: "We couldn't find shampoos we were happy putting on our own dogs, so we made our own.",
      },
      { type: 'h2', text: 'About Houndsly' },
      {
        type: 'ul',
        items: [
          'Naturally derived ingredients, with no animal products.',
          { strong: 'Free from SLS and SLES, parabens and alcohol.' },
          'Vegan and cruelty-free.',
          "Handmade in small batches, because that's the only way we'd want our dogs washed.",
          'Properly gentle, even on the fussiest skin.',
          {
            parts: [
              'These are the products we actually use in the salon every day. You can buy them at ',
              { href: 'https://houndsly.co.uk', text: 'houndsly.co.uk' },
              '.',
            ],
          },
        ],
      },
      { type: 'h2', text: 'Extra-sensitive? Go unscented' },
      {
        type: 'ul',
        items: [
          { strong: "There's an unscented version of Houndsly", rest: " for dogs who don't get on with fragrance." },
          { strong: 'Skip the cologne.', rest: " Every groom normally finishes with a final spritz of cologne. Just ask and we'll leave it off." },
          { strong: 'Bring your own.', rest: " If your vet's prescribed a medicated shampoo, bring it along and we'll use that instead." },
        ],
      },
      { type: 'h2', text: 'Skin conditions and allergies' },
      {
        type: 'p',
        text: "Just let us know beforehand. We regularly groom dogs with skin conditions, and we adapt our handling, products and equipment to keep them comfortable. If we spot something that looks like it needs a vet, we'll tell you.",
      },
      { type: 'quote', text: QUOTE_WALLIS_SKIN, cite: 'Wallis' },
      { type: 'h2', text: 'Every groom, every time' },
      {
        type: 'p',
        text: "Every bath here is a double wash with Houndsly, followed by a gentle dry. That's true of the Full Groom (from £42), Bath & Brush (from £38), Bath & De-shed (from £38) and Puppy Groom (£38).",
      },
      {
        type: 'rich',
        parts: [
          { strong: 'Book:' },
          ' ',
          { wa: '07873 329440', text: 'WhatsApp 07873 329440' },
          '. Mention any skin trouble or products your vet has told you to use.',
        ],
      },
    ],
  },
  {
    path: '/independent-dog-groomer-vs-chain',
    linkLabel: 'Independent dog groomer vs a chain salon',
    title: 'Independent Dog Groomer vs a Chain Salon in Ashton-under-Lyne | Smarter Dog',
    description:
      'Choosing between a chain grooming salon and an independent groomer in Ashton-under-Lyne? What Smarter Dog, family-run on Kings Road since 1982, does differently.',
    faqs: [
      {
        name: 'Independent dog groomer or a chain salon in Ashton-under-Lyne: which is better for my dog?',
        text: "It depends on your dog. If they're nervous, elderly, have medical needs or a coat that needs real know-how, a family-run independent like Smarter Dog Grooming Salon on Kings Road, Ashton-under-Lyne, is built for exactly that. We've been grooming dogs across Tameside since 1982, with no double-booking and no rushing.",
      },
      {
        name: 'Can a nervous dog have a quieter appointment?',
        text: 'Here: yes, nervous dogs can have a quiet slot.',
      },
      {
        name: 'Will the same person groom my dog each time?',
        text: 'Here: yes, always.',
      },
      {
        name: 'Do you use cages or cabinet dryers?',
        text: 'Here: never.',
      },
      {
        name: 'What happens if my dog gets stressed halfway through?',
        text: "Here: we stop, take a break and go at their pace. We never sedate, and we only use a muzzle if it's needed for safety.",
      },
      {
        name: 'What happens if the coat is matted?',
        text: 'Here: we never force a painful de-matting. Any extra charge is just for the extra time.',
      },
      {
        name: 'What do you wash them with?',
        text: 'Here: our own Houndsly, which is naturally derived, vegan and free from SLS, SLES, parabens and alcohol, with an unscented version too.',
      },
    ],
    blocks: [
      {
        type: 'h1',
        text: 'Independent dog groomer or a chain salon in Ashton-under-Lyne: which is better for my dog?',
      },
      {
        type: 'lead',
        strong:
          "It depends on your dog. If they're nervous, elderly, have medical needs or a coat that needs real know-how, a family-run independent like Smarter Dog Grooming Salon on Kings Road, Ashton-under-Lyne, is built for exactly that.",
        rest: "We've been grooming dogs across Tameside since 1982, with no double-booking and no rushing.",
      },
      { type: 'h2', text: 'What you get at Smarter Dog' },
      {
        type: 'ul',
        items: [
          { strong: 'Family-run, since 1982:', rest: " over 40 years of grooming in Ashton-under-Lyne. We're not going anywhere." },
          {
            strong: 'The same groomer every visit.',
            rest: ` Your dog's groomed by Sam or Leam, and it's the same one each time. One long-time regular says "${QUOTE_SANDRA_SHORT}" (Sandra W.)`,
          },
          { strong: 'Quiet slots for nervous dogs, and no cages or cabinet dryers, ever.' },
          { strong: '4.9 on Google, and 500+ reviews across all review sites.' },
          { strong: 'Specialists in elderly and reactive dogs', rest: ', with a low table and regular breaks.' },
          { strong: 'Our own shampoo.', rest: ' Houndsly is natural, vegan, made for sensitive skin and used on every dog.' },
          {
            strong: 'Honest welfare calls.',
            rest: " Our matted-coat policy puts comfort before style, and we'll tell you if we spot lumps, ear infections or dental issues.",
          },
          {
            strong: 'Clear starting prices:',
            rest: ' Full Groom from £42, Bath & Brush from £38, Bath & De-shed from £38, Puppy Groom £38, and walk-in nails, ears and glands £10.',
          },
        ],
      },
      { type: 'h2', text: 'Questions worth asking any groomer' },
      {
        type: 'ol',
        items: [
          { text: 'Can a nervous dog have a quieter appointment?', note: 'Here: yes, nervous dogs can have a quiet slot.' },
          { text: 'Will the same person groom my dog each time?', note: 'Here: yes, always.' },
          { text: 'Do you use cages or cabinet dryers?', note: 'Here: never.' },
          {
            text: 'What happens if my dog gets stressed halfway through?',
            note: "Here: we stop, take a break and go at their pace. We never sedate, and we only use a muzzle if it's needed for safety.",
          },
          {
            text: 'What happens if the coat is matted?',
            note: 'Here: we never force a painful de-matting. Any extra charge is just for the extra time.',
          },
          {
            text: 'What do you wash them with?',
            note: 'Here: our own Houndsly, which is naturally derived, vegan and free from SLS, SLES, parabens and alcohol, with an unscented version too.',
          },
        ],
      },
      { type: 'quote', text: QUOTE_KATE, cite: 'Kate M.' },
      {
        type: 'rich',
        parts: [
          { strong: 'Book:' },
          ' ',
          { wa: '07873 329440', text: 'WhatsApp 07873 329440' },
          ' (message only) or ',
          { href: 'mailto:bookings@smarterdog.co.uk', text: 'bookings@smarterdog.co.uk' },
          '.',
        ],
      },
    ],
  },
];

export const GUIDE_LINKS = NEED_PAGES.map((page) => ({
  to: page.path,
  label: page.linkLabel,
}));
