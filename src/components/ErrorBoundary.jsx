import React from 'react';
import { colors } from '../constants/colors';

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

                        <p
                            className="body-font text-lg mb-8"
                            style={{ color: colors.teal, opacity: 0.8 }}
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
                            style={{ color: colors.teal, opacity: 0.6 }}
                        >
                            Or message us on{' '}
                            <a
                                href="https://wa.me/447873329440"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:opacity-80"
                                style={{ color: colors.cyan }}
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
