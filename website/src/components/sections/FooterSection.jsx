import React from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../../constants/colors';
import DogSilhouette from '../DogSilhouette';
import BackgroundSticker from '../BackgroundSticker';
import { useSalonFacts } from '../../hooks/useSalonFacts';
import { whatsAppUrl } from '../../constants/salonFacts';
import { STAFF_LOGIN_URL } from '../../constants/links';

// Accessible SVG Social Icons
const FacebookIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
);

const InstagramIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
);

const TikTokIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
);

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBR = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

const formatTime12h = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const period = h < 12 ? 'am' : 'pm';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m || 0).padStart(2, '0')}${period}`;
};

const formatDayRange = (days) => {
    if (days.length === 0) return '';
    if (days.length === 1) return DAY_ABBR[days[0]];
    return `${DAY_ABBR[days[0]]}–${DAY_ABBR[days[days.length - 1]]}`;
};

// Contiguous runs of days sharing the same open/closed config, e.g.
// Mon-Wed open 8:30-15:00, Thu-Sun closed.
const groupWeeklyHours = (businessHours) => {
    const groups = [];
    let current = null;
    for (const day of DAY_ORDER) {
        const h = businessHours?.[day] || { closed: true };
        const key = h.closed ? 'closed' : `${h.open}|${h.close}`;
        if (current && current.key === key) {
            current.days.push(day);
        } else {
            current = { key, closed: Boolean(h.closed), open: h.open, close: h.close, days: [day] };
            groups.push(current);
        }
    }
    return groups;
};

const FooterSection = () => {
    const facts = useSalonFacts();
    const hoursGroups = groupWeeklyHours(facts.businessHours);
    const addressLines = facts.businessAddress.split(',').map((line) => line.trim()).filter(Boolean);
    const socialLinks = [
        { icon: <FacebookIcon />, label: 'Visit our Facebook page', href: 'https://facebook.com/smarterdog' },
        { icon: <InstagramIcon />, label: 'Follow us on Instagram', href: 'https://instagram.com/smarterdog' },
        { icon: <TikTokIcon />, label: 'Watch us on TikTok', href: 'https://tiktok.com/@smarterdog' }
    ];

    return (
        <footer
            className="px-6 py-16 relative overflow-hidden"
            style={{ backgroundColor: colors.plum }}
        >
            {/* Background Dog - subtle */}
            <div className="absolute bottom-0 left-10 z-0 opacity-5 pointer-events-none">
                <DogSilhouette
                    color="white"
                    className="w-[25rem] h-auto"
                />
            </div>

            <div className="max-w-6xl mx-auto relative z-10">
                <div className="grid md:grid-cols-4 gap-8 mb-12">
                    <div>
                        <div className="mb-6">
                            <img src="/assets/logo-text.png" alt="Smarter Dog Grooming Salon" className="h-16 w-auto object-contain mb-4" width="200" height="64" />
                        </div>
                        <p
                            className="body-font leading-relaxed"
                            style={{ color: 'white' }}
                        >
                            Over 40 years of happy dogs in Ashton-under-Lyne. We're not going anywhere.
                        </p>
                        {/* Social icons */}
                        <div className="flex gap-3 mt-4">
                            {socialLinks.map((social, i) => (
                                <a
                                    key={i}
                                    href={social.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={social.label}
                                    className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                                >
                                    {social.icon}
                                </a>
                            ))}
                            <a
                                href={STAFF_LOGIN_URL}
                                aria-label="Staff sign in"
                                title="Staff sign in"
                                className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                                style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                            >
                                <DogSilhouette color="currentColor" className="w-5 h-5" />
                            </a>
                        </div>
                    </div>

                    <div>
                        <h2
                            className="heading-font font-semibold mb-4"
                            style={{ color: 'white' }}
                        >
                            Opening hours
                        </h2>
                        <div
                            className="body-font text-lg space-y-2"
                            style={{ color: 'rgba(255,255,255,0.9)' }}
                        >
                            {hoursGroups.map((group) => (
                                <p className="flex justify-between" key={`${group.key}-${group.days[0]}`}>
                                    <span>{formatDayRange(group.days)}</span>
                                    <span style={{ color: group.closed ? colors.yellow : 'white', fontWeight: '600' }}>
                                        {group.closed ? 'Closed' : `${formatTime12h(group.open)} – ${formatTime12h(group.close)}`}
                                    </span>
                                </p>
                            ))}
                            <p className="text-base mt-3" style={{ opacity: 0.85 }}>
                                * We close on bank holidays but open the Thursday after instead.
                            </p>
                        </div>
                    </div>

                    <div>
                        <h2
                            className="heading-font font-semibold mb-4"
                            style={{ color: 'white' }}
                        >
                            Find us
                        </h2>
                        <div
                            className="body-font text-lg space-y-2"
                            style={{ color: 'rgba(255,255,255,0.9)' }}
                        >
                            {addressLines.map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h2
                            className="heading-font font-semibold mb-4"
                            style={{ color: 'white' }}
                        >
                            Get in touch
                        </h2>
                        <div
                            className="body-font text-lg space-y-2"
                            style={{ color: 'rgba(255,255,255,0.9)' }}
                        >
                            <p>
                                <a href={`mailto:${facts.businessEmail}`} className="hover:underline">{facts.businessEmail}</a>
                            </p>
                            <a
                                href={whatsAppUrl(facts.businessPhone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full text-base transition-opacity hover:opacity-90"
                                style={{ backgroundColor: colors.green, color: colors.plum }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                                WhatsApp Available
                            </a>
                        </div>
                    </div>
                </div>

                <div
                    className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 body-font text-base"
                    style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
                >
                    <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6">
                        <p>© {new Date().getFullYear()} Smarter Dog Grooming Salon. All rights reserved.</p>
                        <span className="hidden md:inline" style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm opacity-70">Legal:</span>
                            <Link
                                to="/terms"
                                className="underline hover:opacity-70 transition-opacity"
                                style={{ color: 'rgba(255,255,255,0.8)' }}
                            >
                                Terms
                            </Link>
                            <span style={{ color: 'rgba(255,255,255,0.4)' }}>•</span>
                            <Link
                                to="/matted-coat-policy"
                                className="underline hover:opacity-70 transition-opacity"
                                style={{ color: 'rgba(255,255,255,0.8)' }}
                            >
                                Matted coats
                            </Link>
                            <span style={{ color: 'rgba(255,255,255,0.4)' }}>•</span>
                            <Link
                                to="/privacy"
                                className="underline hover:opacity-70 transition-opacity"
                                style={{ color: 'rgba(255,255,255,0.8)' }}
                            >
                                Privacy
                            </Link>
                        </div>
                    </div>
                    <p
                        className="handwriting text-lg"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                        Made with 🐾 in Ashton-under-Lyne
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default FooterSection;
