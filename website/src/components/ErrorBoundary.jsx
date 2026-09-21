import React from 'react';
import { colors } from '../constants/colors';
import { SALON_FACTS_FALLBACK, whatsAppUrl } from '../constants/salonFacts';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="min-h-screen flex items-center justify-center px-6"
                    style={{ backgroundColor: colors.offWhite }}
                >
                    <div className="text-center max-w-lg">
                        <span className="text-7xl mb-6 block">🐾</span>

                        <h1
                            className="heading-font font-bold text-3xl md:text-4xl mb-4"
                            style={{ color: colors.teal }}
                        >
                            Something went wrong
                        </h1>

                        {/*
                          * Hierarchy here comes from size and weight, never from opacity.
                          * `opacity` on a parent creates a compositing group its children
                          * cannot escape, so it silently dims the link below too — that is
                          * how the WhatsApp link ended up at 2.54:1 against the cream.
                          */}
                        <p
                            className="body-font text-lg mb-8"
                            style={{ color: colors.teal }}
                        >
                            We're sorry, but something unexpected happened. Please try refreshing the page.
                        </p>

                        <button
                            onClick={() => window.location.reload()}
                            className="px-8 py-4 rounded-full font-bold text-lg text-white transition-all hover:scale-105 hover:shadow-lg"
                            style={{ backgroundColor: colors.green }}
                        >
                            Refresh Page
                        </button>

                        <p
                            className="body-font text-sm mt-6"
                            style={{ color: colors.teal }}
                        >
                            Or message us on{' '}
                            <a
                                href={whatsAppUrl(SALON_FACTS_FALLBACK.businessPhone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:brightness-90"
                                style={{ color: colors.cyanText }}
                            >
                                WhatsApp
                            </a>
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
