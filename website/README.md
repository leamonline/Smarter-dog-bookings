# Smarter Dog Grooming Salon

A modern, production-ready website for Smarter Dog Grooming Salon built with React, Vite, and Tailwind CSS.

## 🎯 Overview

Professional dog grooming salon website featuring:

- **40+ years of experience** in pet care
- Full service offerings (Full Groom, Bath & Tidy, Specialty Services)
- Online appointment booking
- Product showcase (Houndsly line)
- Photo gallery
- Customer testimonials

## 🚀 Tech Stack

- **Frontend**: React 19.2.0
- **Build Tool**: Vite 7.2.4
- **Styling**: Tailwind CSS 4.1.17
- **Routing**: React Router 7.9.6
- **Testing**: Vitest 4.0.14 + Playwright 1.57.0
- **CI/CD**: GitHub Actions

## 📦 Getting Started

### Prerequisites

- Node.js 18.x or 20.x
- npm

### Installation

```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

## 🧪 Testing

Comprehensive testing suite with 403+ tests:

```bash
# Run unit & integration tests
npm test                    # Watch mode
npm run test:run            # CI mode
npm run test:ui             # Visual UI mode
npm run test:coverage       # With coverage report

# Run E2E tests
npm run test:e2e            # All E2E tests
npm run test:e2e:ui         # Playwright UI mode
npm run test:e2e:headed     # Watch browser
npm run test:e2e:report     # View test report

# Run visual regression tests
npm run test:visual         # Compare screenshots
npm run test:visual:update  # Update snapshots

# Run performance tests
npm run test:perf           # Performance benchmarks

# Run everything
npm run test:all            # Unit + E2E tests
```

### Test Coverage

- **Unit Tests**: 350+ tests covering all components
- **Integration Tests**: 37 tests for full page rendering
- **E2E Tests**: 20+ tests across 5 browsers/viewports
- **Accessibility Tests**: 14 tests ensuring WCAG 2.1 AA compliance
- **Visual Regression**: 13 snapshot tests
- **Performance**: 15 metrics tracked

Current coverage: **98.6% passing** (353/358 tests)

## 🏗️ Build & Deployment

```bash
# Production build
npm run build

# Build with bundle analysis — writes bundle-analysis/stats.html, which sits
# outside dist/ on purpose so the report is never published with the site
npm run build:analyze

# Preview production build
npm run preview
```

### Build Output

- **Main Bundle**: ~267 KB (raw) → ~81 KB (gzipped)
- **React Vendor**: ~11 KB (raw) → ~4 KB (gzipped)
- **CSS Bundle**: ~28 KB (raw) → ~6 KB (gzipped)
- **Total (gzipped)**: ~91 KB

## 📁 Project Structure

```bash
src/
├── components/
│   ├── sections/          # Section components (Hero, Services, Gallery, etc.)
│   ├── pages/             # Page components (Services, Houndsly, Gallery)
│   ├── *.jsx              # Shared components
│   └── *.test.jsx         # Co-located tests
├── constants/
│   └── colors.js          # Design system colors
├── App.jsx                # Route configuration
├── index.css              # Global styles & animations
└── main.jsx               # Application entry point
```

## 🎨 Design System

### Colors

- **Anchors**: Plum, Dungaree Teal, Off-White
- **Brights**: Cyan, Green
- **Accents**: Pink, Yellow, Orange

### Typography

- **Headings**: Quicksand
- **Body**: Montserrat
- **Handwriting**: Caveat

## 🔍 Code Quality

```bash
# Run linter
npm run lint

# Code is formatted according to ESLint rules
# Following React Hooks and React Refresh best practices
```

## ♿ Accessibility

- WCAG 2.1 Level AA compliant
- Zero accessibility violations
- Keyboard navigation support
- Screen reader compatible
- Proper semantic HTML

## 📈 Performance

- **Lighthouse Score**: 95+
- **Bundle Size**: <100KB gzipped
- **First Contentful Paint**: <1.8s
- **Time to Interactive**: <3.8s

## 🌐 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📄 License

All rights reserved - Smarter Dog Grooming Salon

## 📞 Contact

- **Email**: <bookings@smarterdog.co.uk>
- **WhatsApp**: 07873 329440
- **Location**: Ashton-under-Lyne, OL6 8HD

---

Built with ❤️ for our furry friends 🐕
