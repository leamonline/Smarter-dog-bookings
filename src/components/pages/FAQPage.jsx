import React, { useState, useEffect } from 'react';
import { colors } from '../../constants/colors';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';
import { useSalonFacts } from '../../hooks/useSalonFacts';
import { whatsAppUrl } from '../../constants/salonFacts';

const FAQPage = ({ onBookClick }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [openIndex, setOpenIndex] = useState(null);
    const facts = useSalonFacts();

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('FAQ');

    const faqs = [
        {
            question: "My dog is nervous or reactive — can you still groom them?",
            answer: "Absolutely. We've worked with anxious, reactive, and fearful dogs for over 40 years. We take our time, read their body language, and never force anything. Many nervous dogs who come to us eventually relax and even enjoy their visits."
        },
        {
            question: "Can I stay for their first appointment?",
            answer: "We're happy to have a chat when you drop off, and you're welcome to wait in the reception area. That said, most dogs settle better once their owner has left — it's often harder on you than on them! We'll always call if there's any issue."
        },
        {
            question: "What if my dog has had an operation or has health issues?",
            answer: "Just let us know beforehand. We regularly groom dogs with arthritis, skin conditions, diabetes, heart conditions, and post-surgery restrictions. We adapt our handling, products, and equipment to keep them comfortable."
        },
        {
            question: "Do you groom older dogs or dogs with disabilities?",
            answer: "Yes, and we love them. We've groomed blind dogs, deaf dogs, three-legged dogs, and dogs well into their late teens. We have a low table for dogs who struggle to stand, and we take regular breaks if needed."
        },
        {
            question: "How much does a typical visit cost?",
            answer: "It depends on breed, size, coat condition, and what you'd like done. A full groom for a medium-sized dog typically starts around £35–45. We're happy to give you an estimate when you get in touch — no surprises."
        },
        {
            question: "How should I prepare my dog before their appointment?",
            answer: "Just bring them as they are! If they've had a muddy walk, that's fine — we'll wash them anyway. Try to let them have a toilet break before arriving. If it's their first visit, it helps if they've had positive experiences being handled and brushed at home."
        }
    ];

    const toggleFAQ = (index) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: colors.offWhite }}>
            <Navigation isLoaded={isLoaded} onBookClick={onBookClick} />

            <main id="main-content" className="pt-24 pb-16 px-6">
                <div className="max-w-3xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-16">
                        <h1
                            className="heading-font font-bold text-4xl md:text-5xl mb-6"
                            style={{ color: colors.plum }}
                        >
                            Frequently Asked Questions
                        </h1>
                        <p className="body-font text-lg" style={{ color: colors.teal }}>
                            Answers to the questions we hear most — especially from first-time visitors and nervous dog parents.
                        </p>
                    </div>

                    {/* FAQ Accordion */}
                    <div className="space-y-4">
                        {faqs.map((faq, i) => (
                            <div
                                key={i}
                                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                            >
                                <button
                                    onClick={() => toggleFAQ(i)}
                                    className="w-full text-left p-6 flex justify-between items-start gap-4"
                                >
                                    <h2
                                        className="heading-font font-semibold text-lg"
                                        style={{ color: colors.plum }}
                                    >
                                        {faq.question}
                                    </h2>
                                    <span
                                        className="text-2xl transition-transform duration-300 flex-shrink-0"
                                        style={{
                                            color: colors.teal,
                                            transform: openIndex === i ? 'rotate(45deg)' : 'rotate(0)'
                                        }}
                                    >
                                        +
                                    </span>
                                </button>
                                <div
                                    className={`overflow-hidden transition-all duration-300 ${openIndex === i ? 'max-h-96 pb-6' : 'max-h-0'
                                        }`}
                                >
                                    <p
                                        className="body-font px-6"
                                        style={{ color: colors.teal }}
                                    >
                                        {faq.answer}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <div className="text-center mt-16">
                        <p className="body-font mb-2" style={{ color: colors.teal }}>
                            Got a question we haven't answered?
                        </p>
                        <p className="body-font mb-6" style={{ color: colors.teal }}>
                            Send us a message — we're happy to help.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <button
                                onClick={() => onBookClick?.('FAQ Page')}
                                className="px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
                                style={{
                                    backgroundColor: colors.cyan,
                                    color: colors.plum
                                }}
                            >
                                Book online
                            </button>
                            <a
                                href={whatsAppUrl(facts.businessPhone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                                style={{ backgroundColor: '#25D366', color: colors.plum }}
                            >
                                WhatsApp us
                            </a>
                        </div>
                    </div>
                </div>
            </main>

            <FooterSection onBookClick={onBookClick} />
        </div>
    );
};

export default FAQPage;
