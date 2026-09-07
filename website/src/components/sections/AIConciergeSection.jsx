import React, { useMemo, useState } from 'react';
import { colors } from '../../constants/colors';
import FadeIn from '../FadeIn';
import { trackEvent } from '../../utils/analytics';

const COAT_OPTIONS = [
    { value: 'curly', label: 'Curly / Wavy' },
    { value: 'double', label: 'Double Coat' },
    { value: 'short', label: 'Short / Smooth' },
    { value: 'long', label: 'Long / Silky' },
    { value: 'mixed', label: 'Mixed / Unsure' },
];

const GOAL_OPTIONS = [
    { value: 'full-style', label: 'Full refresh' },
    { value: 'tidy-up', label: 'Bath and tidy' },
    { value: 'de-shed', label: 'Reduce shedding' },
    { value: 'first-groom', label: 'First puppy groom' },
];

const TEMPERAMENT_OPTIONS = [
    { value: 'relaxed', label: 'Relaxed' },
    { value: 'nervous', label: 'A bit nervous' },
    { value: 'first-time', label: 'First salon visit' },
];

const VISIT_PLAN_OPTIONS = [
    { value: 'auto', label: 'Let concierge decide' },
    { value: 'one-off', label: 'One-off visit' },
    { value: 'every-6-weeks', label: 'Every 6 weeks' },
    { value: 'every-8-weeks', label: 'Every 8 weeks' },
];

const VISIT_PLAN_LABELS = {
    'one-off': 'one-off visit',
    'every-6-weeks': 'every 6 weeks',
    'every-8-weeks': 'every 8 weeks',
};

const GOAL_LABELS = GOAL_OPTIONS.reduce((acc, option) => ({
    ...acc,
    [option.value]: option.label,
}), {});

const TEMPERAMENT_LABELS = TEMPERAMENT_OPTIONS.reduce((acc, option) => ({
    ...acc,
    [option.value]: option.label,
}), {});

const getRecommendedService = ({ goal }) => {
    if (goal === 'first-groom') return 'Puppy Intro';
    if (goal === 'de-shed') return 'De-shedding Groom';
    if (goal === 'tidy-up') return 'Maintenance Groom';
    return 'Full Groom';
};

const getAutoVisitPlan = ({ coatType, goal, service }) => {
    if (service === 'Puppy Intro') return 'every-6-weeks';
    if (goal === 'de-shed' || coatType === 'double') return 'every-8-weeks';
    if (coatType === 'curly' || goal === 'tidy-up') return 'every-6-weeks';
    return 'one-off';
};

const getPreferredTimes = ({ temperament }) => {
    if (temperament === 'nervous' || temperament === 'first-time') {
        return ['mon-am', 'tue-am'];
    }
    return [];
};

const buildConciergeRecommendation = (profile) => {
    const dogName = profile.dogName.trim() || 'your dog';
    const breedLabel = profile.breed.trim() || 'unknown breed';
    const service = getRecommendedService(profile);
    const autoVisitPlan = getAutoVisitPlan({ ...profile, service });
    const visitPlan = profile.visitRhythm === 'auto' ? autoVisitPlan : profile.visitRhythm;
    const preferredTimes = getPreferredTimes(profile);

    const summary = `${service} on a ${VISIT_PLAN_LABELS[visitPlan]} rhythm for ${dogName}.`;
    const rationale = profile.goal === 'first-groom'
        ? 'Low-pressure introduction focused on confidence and handling.'
        : profile.goal === 'de-shed'
            ? 'Targets undercoat control while keeping skin and coat healthy.'
            : profile.goal === 'tidy-up'
                ? 'Keeps shape, hygiene, and comfort between full grooms.'
                : 'Complete reset including coat, nails, and ears.';

    const notes = [
        `AI concierge recommendation for ${dogName} (${breedLabel}).`,
        `Goal: ${GOAL_LABELS[profile.goal]}.`,
        `Temperament: ${TEMPERAMENT_LABELS[profile.temperament]}.`,
        `Suggested service: ${service}.`,
        `Suggested cadence: ${VISIT_PLAN_LABELS[visitPlan]}.`,
        preferredTimes.length > 0 ? 'Suggested first slots: Monday or Tuesday morning.' : '',
    ].filter(Boolean).join(' ');

    return {
        dogName,
        service,
        visitPlan,
        preferredTimes,
        summary,
        rationale,
        notes,
    };
};

const chipClassName = (isActive) => `px-3 py-2 rounded-full border text-sm font-semibold transition-all ${isActive
    ? 'shadow-sm'
    : 'hover:shadow-sm'
    }`;

const AIConciergeSection = ({ onBookClick }) => {
    const [profile, setProfile] = useState({
        dogName: '',
        breed: '',
        coatType: 'curly',
        goal: 'full-style',
        temperament: 'relaxed',
        visitRhythm: 'auto',
    });

    const recommendation = useMemo(() => buildConciergeRecommendation(profile), [profile]);

    const handleTextChange = (field) => (event) => {
        setProfile((prev) => ({ ...prev, [field]: event.target.value }));
    };

    const handleOptionChange = (field, value) => {
        setProfile((prev) => ({ ...prev, [field]: value }));
    };

    const handleUseRecommendation = () => {
        const bookingPrefill = {
            ownerName: '',
            phone: '',
            email: '',
            dogName: profile.dogName.trim(),
            breed: profile.breed.trim(),
            service: recommendation.service,
            visitPlan: recommendation.visitPlan,
            preferredTimes: recommendation.preferredTimes,
            notes: recommendation.notes,
        };

        trackEvent('Engagement', 'Use AI Concierge Recommendation', recommendation.service);
        onBookClick?.('AI Concierge', {
            prefill: bookingPrefill,
            prefillSummary: recommendation.summary,
        });
    };

    return (
        <section className="py-20" style={{ backgroundColor: colors.warmBeige }}>
            <FadeIn>
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-10">
                        <span
                            className="inline-block px-4 py-2 rounded-full text-sm font-bold mb-4"
                            style={{ backgroundColor: colors.cyanLight, color: colors.teal }}
                        >
                            AI Booking Concierge
                        </span>
                        <h2
                            className="heading-font font-bold text-4xl md:text-5xl mb-3"
                            style={{ color: colors.plum }}
                        >
                            Not sure what to book?
                        </h2>
                        <p className="body-font text-lg max-w-2xl mx-auto" style={{ color: colors.teal }}>
                            Tell us a few details and our concierge will suggest the best service and visit rhythm.
                        </p>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-8 items-start">
                        <div
                            className="rounded-3xl p-6 md:p-8 border"
                            style={{ backgroundColor: colors.offWhite, borderColor: colors.cyanLight }}
                        >
                            <h3 className="heading-font text-2xl font-bold mb-5" style={{ color: colors.plum }}>
                                Concierge chat
                            </h3>
                            <div className="space-y-4">
                                <div className="max-w-[85%] rounded-2xl px-4 py-3" style={{ backgroundColor: colors.cyanLight }}>
                                    <p className="body-font text-sm" style={{ color: colors.teal }}>
                                        Hi, I can shortlist the right grooming plan in under a minute.
                                    </p>
                                </div>
                                <div
                                    className="ml-auto max-w-[85%] rounded-2xl px-4 py-3"
                                    style={{ backgroundColor: 'white', border: `1px solid ${colors.cyanLight}` }}
                                >
                                    <p className="body-font text-sm" style={{ color: colors.plum }}>
                                        Dog: {profile.dogName.trim() || 'Not provided yet'}
                                    </p>
                                    <p className="body-font text-sm" style={{ color: colors.plum }}>
                                        Breed: {profile.breed.trim() || 'Not provided yet'}
                                    </p>
                                </div>
                                <div className="max-w-[85%] rounded-2xl px-4 py-3" style={{ backgroundColor: colors.cyanLight }}>
                                    <p className="body-font text-sm font-semibold mb-1" style={{ color: colors.teal }}>
                                        Recommended:
                                    </p>
                                    <p className="body-font text-sm" style={{ color: colors.teal }}>
                                        {recommendation.summary}
                                    </p>
                                    <p className="body-font text-xs mt-2" style={{ color: colors.teal }}>
                                        {recommendation.rationale}
                                    </p>
                                </div>
                                <p className="body-font text-xs" style={{ color: colors.teal }}>
                                    Final service is always confirmed by the grooming team when we review your request.
                                </p>
                            </div>
                        </div>

                        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-layered border border-gray-100">
                            <div className="grid sm:grid-cols-2 gap-4 mb-5">
                                <div>
                                    <label htmlFor="concierge-dog-name" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                                        Dog&apos;s name
                                    </label>
                                    <input
                                        id="concierge-dog-name"
                                        type="text"
                                        value={profile.dogName}
                                        onChange={handleTextChange('dogName')}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors text-base"
                                        placeholder="Barnaby"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="concierge-breed" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                                        Breed
                                    </label>
                                    <input
                                        id="concierge-breed"
                                        type="text"
                                        value={profile.breed}
                                        onChange={handleTextChange('breed')}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors text-base"
                                        placeholder="Cockapoo"
                                    />
                                </div>
                            </div>

                            <fieldset className="mb-5">
                                <legend className="block text-sm font-bold mb-2" style={{ color: colors.teal }}>
                                    Coat type
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {COAT_OPTIONS.map((option) => {
                                        const isActive = profile.coatType === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => handleOptionChange('coatType', option.value)}
                                                className={chipClassName(isActive)}
                                                style={{
                                                    backgroundColor: isActive ? colors.cyanLight : 'white',
                                                    borderColor: isActive ? colors.cyan : '#E5E7EB',
                                                    color: colors.plum,
                                                }}
                                                aria-pressed={isActive}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <fieldset className="mb-5">
                                <legend className="block text-sm font-bold mb-2" style={{ color: colors.teal }}>
                                    Main goal
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {GOAL_OPTIONS.map((option) => {
                                        const isActive = profile.goal === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => handleOptionChange('goal', option.value)}
                                                className={chipClassName(isActive)}
                                                style={{
                                                    backgroundColor: isActive ? colors.yellowLight : 'white',
                                                    borderColor: isActive ? colors.yellow : '#E5E7EB',
                                                    color: colors.plum,
                                                }}
                                                aria-pressed={isActive}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <fieldset className="mb-5">
                                <legend className="block text-sm font-bold mb-2" style={{ color: colors.teal }}>
                                    Temperament
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {TEMPERAMENT_OPTIONS.map((option) => {
                                        const isActive = profile.temperament === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => handleOptionChange('temperament', option.value)}
                                                className={chipClassName(isActive)}
                                                style={{
                                                    backgroundColor: isActive ? colors.greenLight : 'white',
                                                    borderColor: isActive ? colors.green : '#E5E7EB',
                                                    color: colors.plum,
                                                }}
                                                aria-pressed={isActive}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <label htmlFor="visit-rhythm" className="block text-sm font-bold mb-2" style={{ color: colors.teal }}>
                                Visit rhythm
                            </label>
                            <select
                                id="visit-rhythm"
                                value={profile.visitRhythm}
                                onChange={handleTextChange('visitRhythm')}
                                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors bg-white text-base mb-6"
                            >
                                {VISIT_PLAN_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div
                        className="mt-8 rounded-3xl p-6 md:p-8 border"
                        style={{ backgroundColor: 'white', borderColor: colors.greenLight }}
                    >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                                <h3 className="heading-font text-2xl font-bold" style={{ color: colors.plum }}>
                                    Suggested plan: {recommendation.service}
                                </h3>
                                <p className="body-font text-base mt-2" style={{ color: colors.teal }}>
                                    {recommendation.summary}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleUseRecommendation}
                                className="px-8 py-4 rounded-full font-bold text-base transition-all hover:scale-105 hover:shadow-lg"
                                style={{ backgroundColor: colors.green, color: colors.plum }}
                            >
                                Use this and book now
                            </button>
                        </div>
                    </div>
                </div>
            </FadeIn>
        </section>
    );
};

export default AIConciergeSection;
