# Changelog

All notable changes to the Smarter Dog Grooming website will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `colors.cyanText` (`#2A62A8`): the calm blue for type and links, which passes WCAG AA on white and cream where the bright sky does not. `ErrorBoundary`'s WhatsApp link uses it (2.07:1 before, 6.16:1 now).
- Scheduled holiday notice card in the homepage hero (`HolidayNoticeCard`), driven only by the booking database's `get_public_holiday_notices` RPC. Shows "Upcoming holiday" before the closure and "We're taking a little break" during it, with the reopening date and a "Book for our return" action; disappears automatically on the reopening date (Europe/London). Nothing is shown unless the salon's actual diary confirms the dates.
- Automated dependency updates via Dependabot (weekly on Mondays)
- Page view analytics tracking on route changes (`usePageTracking` hook)
- WebP image format support with JPG fallback for older browsers
- `ResponsiveImage` component for optimal image delivery
- Comprehensive website audit documentation
- Maintenance documentation

### Changed

- Brand reskin palette (booking-app plan step 9, #896): `plum` is now charcoal `#1F1F1F`, `offWhite` cream `#F7EFE6`, `cyan` the sky `#5595DC` (surfaces, tape and strokes) and `cyanLight` `#E0EFFF`; keys unchanged. Every changed text/background pair stays at AA. The manifest `theme_color` and the focus ring's outer halo follow.
- Headings load Poppins from Google Fonts instead of Quicksand (same weights); Montserrat and Caveat unchanged.
- Updated sitemap.xml with all current routes (removed `/gallery`, added `/approach`, `/faq`, `/privacy`, `/terms`, `/matted-coat-policy`)
- Updated `.env.example` with all required environment variables
- Images converted to WebP format (27-81% file size reduction)
- `PolaroidImage` component now uses `<picture>` element for WebP with fallback
- Improved alt text on all product and hero images for accessibility

### Fixed

- Missing alt text on hero section polaroid images
- Empty captions on Houndsly product images

---

## [1.0.0] - 2025-12-01

### Added

- Initial website launch
- Homepage with hero, services, gallery, testimonials sections
- Services page with pricing tiers and process timeline
- FAQ page with accordion
- Our Approach page
- Houndsly product section
- Privacy Policy, Terms, and Matted Coat Policy pages
- Booking modal with EmailJS integration
- Google Analytics integration (GA4)
- Cookie consent banner
- 404 Not Found page
- Scroll restoration and scroll-to-top button
- Error boundary for graceful error handling
- Comprehensive test suite (unit, E2E, accessibility)
