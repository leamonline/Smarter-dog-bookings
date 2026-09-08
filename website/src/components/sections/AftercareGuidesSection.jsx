import React, { useMemo, useState } from 'react';
import { colors } from '../../constants/colors';
import FadeIn from '../FadeIn';
import { BrushIcon, CalendarCycleIcon, ChecklistIcon } from '../BrandIcons';

const GUIDE_GROUPS = [
    {
        id: 'curly',
        label: 'Curly / Doodle',
        rhythm: 'Every six weeks',
        breeds: ['Cockapoo', 'Cavapoo', 'Poodle mixes'],
        checklist: [
            'Line-brush coat four times weekly',
            'Comb legs, armpits, and behind ears daily',
            'Dry beard after meals to avoid knotting',
        ],
        tools: 'Slicker brush and metal comb',
    },
    {
        id: 'double',
        label: 'Double Coat',
        rhythm: 'Every eight weeks',
        breeds: ['Golden Retriever', 'Spaniel', 'Collie'],
        checklist: [
            'De-shed brush twice weekly',
            'Check feathering for compacted undercoat',
            'Rinse muddy areas and fully dry after walks',
        ],
        tools: 'Undercoat rake and finishing brush',
    },
    {
        id: 'wire',
        label: 'Wire / Terrier',
        rhythm: 'Every six to eight weeks',
        breeds: ['Schnauzer', 'Border Terrier', 'Westie'],
        checklist: [
            'Brush jacket and furnishings three times weekly',
            'Wipe eye corners and beard daily',
            'Keep paw pads clipped between visits',
        ],
        tools: 'Pin brush and fine comb',
    },
];

const AftercareGuidesSection = ({ onBookClick }) => {
    const [activeGuideId, setActiveGuideId] = useState(GUIDE_GROUPS[0].id);
    const activeGuide = useMemo(
        () => GUIDE_GROUPS.find((guide) => guide.id === activeGuideId) || GUIDE_GROUPS[0],
        [activeGuideId]
    );

    return (
        <section className="py-20 px-6 texture-paper" style={{ backgroundColor: colors.offWhite }}>
            <div className="max-w-6xl mx-auto">
                <FadeIn>
                    <div className="text-center max-w-3xl mx-auto mb-10">
                        <span
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-4"
                            style={{ backgroundColor: `${colors.yellow}80`, color: colors.plum }}
                        >
                            <ChecklistIcon className="w-4 h-4" />
                            Post-groom care guides
                        </span>
                        <h2 className="heading-font text-4xl md:text-5xl font-bold mb-4" style={{ color: colors.plum }}>
                            Keep that fresh groom looking great at home
                        </h2>
                        <p className="body-font text-lg" style={{ color: colors.teal }}>
                            Pick your coat type for a practical routine, right tools, and a recommended rebook rhythm.
                        </p>
                    </div>
                </FadeIn>

                <div className="flex flex-wrap justify-center gap-3 mb-8">
                    {GUIDE_GROUPS.map((guide) => {
                        const isActive = guide.id === activeGuideId;
                        return (
                            <button
                                key={guide.id}
                                type="button"
                                onClick={() => setActiveGuideId(guide.id)}
                                className="px-5 py-2 rounded-full border-2 font-semibold transition-all duration-300 hover:scale-105"
                                style={{
                                    borderColor: isActive ? colors.plum : `${colors.teal}55`,
                                    backgroundColor: isActive ? colors.plum : 'white',
                                    color: isActive ? 'white' : colors.teal,
                                }}
                                aria-pressed={isActive}
                            >
                                {guide.label}
                            </button>
                        );
                    })}
                </div>

                <div className="grid md:grid-cols-3 gap-6 reveal-sequence">
                    <article className="rounded-3xl p-6 card-glow texture-speckle" style={{ backgroundColor: 'white' }}>
                        <div className="flex items-center gap-3 mb-4" style={{ color: colors.plum }}>
                            <BrushIcon />
                            <h3 className="heading-font text-2xl font-bold">Best for</h3>
                        </div>
                        <ul className="space-y-2">
                            {activeGuide.breeds.map((breed) => (
                                <li key={breed} className="body-font text-base" style={{ color: colors.teal }}>
                                    {breed}
                                </li>
                            ))}
                        </ul>
                        <p className="body-font text-sm mt-5" style={{ color: colors.teal }}>
                            Tools: <strong>{activeGuide.tools}</strong>
                        </p>
                    </article>

                    <article className="rounded-3xl p-6 card-glow texture-speckle" style={{ backgroundColor: 'white' }}>
                        <div className="flex items-center gap-3 mb-4" style={{ color: colors.plum }}>
                            <ChecklistIcon />
                            <h3 className="heading-font text-2xl font-bold">Home routine</h3>
                        </div>
                        <ul className="space-y-3">
                            {activeGuide.checklist.map((item) => (
                                <li key={item} className="body-font text-base flex gap-2" style={{ color: colors.teal }}>
                                    <span aria-hidden="true">✓</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </article>

                    <article className="rounded-3xl p-6 card-glow texture-speckle" style={{ backgroundColor: colors.cyan }}>
                        <div className="flex items-center gap-3 mb-4" style={{ color: colors.plum }}>
                            <CalendarCycleIcon />
                            <h3 className="heading-font text-2xl font-bold">Rebook rhythm</h3>
                        </div>
                        <p className="heading-font text-3xl font-bold mb-4" style={{ color: colors.plum }}>
                            {activeGuide.rhythm}
                        </p>
                        <p className="body-font text-base mb-6" style={{ color: colors.plum }}>
                            Ask us to keep a rolling slot so your dog stays comfortable and mat-free year-round.
                        </p>
                        <button
                            type="button"
                            onClick={() => onBookClick?.('Aftercare Guide Section')}
                            className="px-6 py-3 rounded-full font-bold transition-all duration-300 hover:scale-105"
                            style={{ backgroundColor: colors.yellow, color: colors.plum }}
                        >
                            Set regular visits
                        </button>
                    </article>
                </div>
            </div>
        </section>
    );
};

export default AftercareGuidesSection;
