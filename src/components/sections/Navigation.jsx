import React from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../../constants/colors';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';
import { BOOKING_URL } from '../../constants/links';

const Navigation = ({ isLoaded }) => {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [scrolled, setScrolled] = React.useState(false);
    const prefersReducedMotion = usePrefersReducedMotion();
    const navLinkColor = scrolled ? colors.teal : colors.plum;

    const closeMenu = React.useCallback(() => setIsMenuOpen(false), []);
    const menuRef = useFocusTrap(isMenuOpen, closeMenu);

    React.useEffect(() => {
        let ticking = false;
        const handleScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    setScrolled(window.scrollY > 20);
                    ticking = false;
                });
                ticking = true;
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
                ? 'bg-white/80 backdrop-blur-md shadow-sm py-3'
                : 'bg-transparent py-6'
                } ${isLoaded && !prefersReducedMotion ? 'animate-fade-in' : ''}`}
        >
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-md focus:bg-white focus:text-black focus:shadow-md"
            >
                Skip to main content
            </a>
            <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link to="/" className="block relative group">
                        <img
                            src="/assets/logo-text.png"
                            alt="Smarter Dog Grooming Salon"
                            height="64"
                            width="250"
                            className={`w-auto object-contain transition-all duration-300 ${scrolled ? 'h-12' : 'h-16'
                                }`}
                        />
                    </Link>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-2">
                    <Link
                        to="/services"
                        className="font-medium text-sm transition-colors relative group px-3 py-1 hover-wiggle"
                        style={{ color: navLinkColor }}
                    >
                        Services
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-current transition-all duration-300 group-hover:w-full" />
                    </Link>

                    <Link
                        to="/houndsly"
                        className="font-medium text-sm transition-colors relative group px-3 py-1 hover-wiggle"
                        style={{ color: navLinkColor }}
                    >
                        Houndsly
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-current transition-all duration-300 group-hover:w-full" />
                    </Link>

                    <Link
                        to="/approach"
                        className="font-medium text-sm transition-colors relative group px-3 py-1 hover-wiggle"
                        style={{ color: navLinkColor }}
                    >
                        Our Approach
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-current transition-all duration-300 group-hover:w-full" />
                    </Link>

                    <Link
                        to="/community"
                        className="font-medium text-sm transition-colors relative group px-3 py-1 hover-wiggle"
                        style={{ color: navLinkColor }}
                    >
                        Community
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-current transition-all duration-300 group-hover:w-full" />
                    </Link>

                    <Link
                        to="/faq"
                        className="font-medium text-sm transition-colors relative group px-3 py-1 hover-wiggle"
                        style={{ color: navLinkColor }}
                    >
                        FAQ
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-current transition-all duration-300 group-hover:w-full" />
                    </Link>

                    <div className="ml-3">
                        <a
                            href={BOOKING_URL}
                            className="inline-block px-6 py-3 rounded-full font-bold text-sm transition-all duration-300 hover:scale-105 hover:shadow-lg active-squish"
                            style={{
                                backgroundColor: colors.green,
                                color: colors.plum
                            }}
                        >
                            Book online
                        </a>
                    </div>
                </div>

                {/* Mobile Menu Toggle */}
                <button
                    className="md:hidden text-2xl focus:outline-none"
                    onClick={toggleMenu}
                    style={{ color: navLinkColor }}
                    aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={isMenuOpen}
                >
                    {isMenuOpen ? '✕' : '☰'}
                </button>
            </div>

            {/* Mobile Menu Overlay */}
            {isMenuOpen && (
                <div
                    ref={menuRef}
                    className="md:hidden absolute top-full left-0 right-0 bg-white backdrop-blur-md shadow-xl p-6 rounded-b-3xl flex flex-col gap-4 animate-fade-in-up border-t border-gray-100"
                    role="menu"
                >
                    <Link
                        to="/services"
                        className="text-lg font-medium py-2 border-b border-gray-50"
                        style={{ color: colors.teal }}
                        onClick={closeMenu}
                        role="menuitem"
                    >
                        Services
                    </Link>
                    <Link
                        to="/houndsly"
                        className="text-lg font-medium py-2 border-b border-gray-50"
                        style={{ color: colors.teal }}
                        onClick={closeMenu}
                        role="menuitem"
                    >
                        Houndsly
                    </Link>
                    <Link
                        to="/approach"
                        className="text-lg font-medium py-2 border-b border-gray-50"
                        style={{ color: colors.teal }}
                        onClick={closeMenu}
                        role="menuitem"
                    >
                        Our Approach
                    </Link>
                    <Link
                        to="/community"
                        className="text-lg font-medium py-2 border-b border-gray-50"
                        style={{ color: colors.teal }}
                        onClick={closeMenu}
                        role="menuitem"
                    >
                        Community
                    </Link>
                    <Link
                        to="/faq"
                        className="text-lg font-medium py-2 border-b border-gray-50"
                        style={{ color: colors.teal }}
                        onClick={closeMenu}
                        role="menuitem"
                    >
                        FAQ
                    </Link>
                    <a
                        href={BOOKING_URL}
                        onClick={closeMenu}
                        className="block w-full py-3 rounded-full font-bold mt-2 text-center active-squish"
                        style={{ backgroundColor: colors.green, color: colors.plum }}
                        role="menuitem"
                    >
                        Book online
                    </a>
                </div>
            )}
        </nav>
    );
};

export default Navigation;
