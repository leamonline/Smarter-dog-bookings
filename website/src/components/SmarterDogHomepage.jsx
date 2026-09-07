import React from 'react';
import { colors } from '../constants/colors';

import Navigation from './sections/Navigation';
import HeroSection from './sections/HeroSection';
import TrustSection from './sections/TrustSection';
import ServicesSection from './sections/ServicesSection';
import AftercareGuidesSection from './sections/AftercareGuidesSection';
import GallerySection from './sections/GallerySection';
import TestimonialsSection from './sections/TestimonialsSection';
import CTASection from './sections/CTASection';
import LocationCredibilitySection from './sections/LocationCredibilitySection';
import FooterSection from './sections/FooterSection';
import HoundslySection from './sections/HoundslySection';
import SectionDivider from './SectionDivider';

import ScrollToTop from './ScrollToTop';
import MobileQuickActions from './MobileQuickActions';
import LandingPopup from './LandingPopup';

import { goToBooking } from '../utils/booking';

const SmarterDogHomepage = () => {
  return (
    <div
      className="min-h-screen pb-24 md:pb-0"
      style={{
        backgroundColor: colors.offWhite,
        fontFamily: "'Montserrat', sans-serif"
      }}
    >
      <Navigation isLoaded />
      <main id="main-content">
        <HeroSection isLoaded onBookClick={goToBooking} />
        <TrustSection />
        <ServicesSection />
        <AftercareGuidesSection onBookClick={goToBooking} />
        <GallerySection />
        <SectionDivider type="grass" color={colors.mutedGreen} backgroundColor={colors.yellow} height="100px" />
        <HoundslySection />
        <TestimonialsSection />
        <LocationCredibilitySection />
        <CTASection onBookClick={goToBooking} />
      </main>
      <FooterSection />
      <MobileQuickActions onBookClick={goToBooking} />

      <ScrollToTop />
      <LandingPopup onBookClick={goToBooking} />
    </div>
  );
};

export default SmarterDogHomepage;
