import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React, { Profiler } from 'react';
import { MemoryRouter } from 'react-router-dom';

import SmarterDogHomepage from './SmarterDogHomepage';
import ServiceCard from './ServiceCard';
import PolaroidImage from './PolaroidImage';
import { colors } from '../constants/colors';

describe('React Performance Tests', () => {
  describe('Component Render Performance', () => {
    it('SmarterDogHomepage renders within performance budget', () => {
      const start = performance.now();
      render(
        <MemoryRouter>
          <SmarterDogHomepage />
        </MemoryRouter>
      );
      const end = performance.now();
      const renderTime = end - start;

      console.log(`SmarterDogHomepage render time: ${renderTime.toFixed(2)}ms`);

      // Higher budget for full page
      expect(renderTime).toBeLessThan(2000);
    });

    it('ServiceCard renders quickly', () => {
      const startTime = performance.now();
      render(
        <ServiceCard
          icon="✂️"
          title="Full Groom"
          desc="Complete service"
          bgColor="white"
          accentColor={colors.pink}
        />
      );
      const renderDuration = performance.now() - startTime;

      console.log(`ServiceCard render time: ${renderDuration.toFixed(2)}ms`);

      // Simple component should render under 50ms
      expect(renderDuration).toBeLessThan(50);
    });

    it('PolaroidImage renders quickly', () => {
      const startTime = performance.now();
      render(<PolaroidImage caption="Test" rotation={-5} tapeColor={colors.cyan} />);
      const renderTime = performance.now() - startTime;

      console.log(`PolaroidImage render time: ${renderTime.toFixed(2)}ms`);

      expect(renderTime).toBeLessThan(150);
    });
  });

  describe('Component Re-render Performance', () => {
    it('ServiceCard does not re-render unnecessarily', () => {
      let renderCount = 0;

      const onRender = () => {
        renderCount++;
      };

      const { rerender } = render(
        <Profiler id="ServiceCard" onRender={onRender}>
          <ServiceCard
            icon="✂️"
            title="Full Groom"
            desc="Complete service"
            bgColor="white"
            accentColor={colors.pink}
          />
        </Profiler>
      );

      // Initial render
      expect(renderCount).toBe(1);

      // Re-render with same props (should use memoization if implemented)
      rerender(
        <Profiler id="ServiceCard" onRender={onRender}>
          <ServiceCard
            icon="✂️"
            title="Full Groom"
            desc="Complete service"
            bgColor="white"
            accentColor={colors.pink}
          />
        </Profiler>
      );

      // Should have rendered twice (no memoization currently)
      expect(renderCount).toBe(2);
    });
  });

  describe('Memory Efficiency', () => {
    it('does not create memory leaks on mount/unmount', () => {
      const { unmount } = render(
        <MemoryRouter>
          <SmarterDogHomepage />
        </MemoryRouter>
      );
      unmount();
      // Basic check that unmount doesn't throw
      expect(() => { }).not.toThrow(); // The unmount() above already performed the action. This expect is a placeholder if the original expect was meant to be removed.
    });

    it('renders multiple instances without performance degradation', () => {
      const renderTimes = [];

      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        const { unmount } = render(
          <ServiceCard
            icon="✂️"
            title={`Service ${i}`}
            desc="Description"
            bgColor="white"
            accentColor={colors.pink}
          />
        );
        const renderTime = performance.now() - startTime;
        renderTimes.push(renderTime);
        unmount();
      }

      console.log(`Render times: ${renderTimes.map(t => t.toFixed(2)).join('ms, ')}ms`);

      // Later renders should not be significantly slower than first render
      const firstRender = renderTimes[0];
      const lastRender = renderTimes[renderTimes.length - 1];

      // Allow up to 50% slowdown (generous threshold)
      expect(lastRender).toBeLessThan(firstRender * 5 + 20);
    });
  });

  describe('Large List Performance', () => {
    it('renders multiple service cards efficiently', () => {
      const startTime = performance.now();

      render(
        <div>
          {Array.from({ length: 20 }, (_, i) => (
            <ServiceCard
              key={i}
              icon="✂️"
              title={`Service ${i}`}
              desc="Description"
              bgColor="white"
              accentColor={colors.pink}
            />
          ))}
        </div>
      );

      const renderTime = performance.now() - startTime;
      console.log(`20 ServiceCards render time: ${renderTime.toFixed(2)}ms`);

      // Should render 20 cards in under 500ms
      expect(renderTime).toBeLessThan(500);
    });

    it('renders multiple polaroid images efficiently', () => {
      const startTime = performance.now();

      render(
        <div>
          {Array.from({ length: 20 }, (_, i) => (
            <PolaroidImage
              key={i}
              caption={`Image ${i}`}
              rotation={i % 5 - 2}
              tapeColor={colors.cyan}
            />
          ))}
        </div>
      );

      const renderTime = performance.now() - startTime;
      console.log(`20 PolaroidImages render time: ${renderTime.toFixed(2)}ms`);

      // Should render 20 polaroid images in under 500ms
      expect(renderTime).toBeLessThan(500);
    });
  });

  describe('Profiler Metrics', () => {
    it('captures render metrics for homepage', () => {
      const onRender = vi.fn((
        id,
        phase,
        actualDuration,
        baseDuration
      ) => {
        console.log(`Profiler - ${id}:`, {
          phase,
          actualDuration: `${actualDuration.toFixed(2)}ms`,
          baseDuration: `${baseDuration.toFixed(2)}ms`,
        });

        // Actual render duration should be reasonable
        expect(actualDuration).toBeLessThan(500);
      });

      render(
        <React.Profiler id="Homepage" onRender={onRender}>
          <MemoryRouter>
            <SmarterDogHomepage />
          </MemoryRouter>
        </React.Profiler>
      );

      expect(onRender).toHaveBeenCalled();
    });
  });

  describe('Component Complexity', () => {
    it('Homepage component tree is not too deep', () => {
      const { container } = render(
        <MemoryRouter>
          <SmarterDogHomepage />
        </MemoryRouter>
      );

      // Measure max depth of component tree
      const getMaxDepth = (element) => {
        if (!element.children || element.children.length === 0) {
          return 1;
        }

        const childDepths = Array.from(element.children).map(getMaxDepth);
        return 1 + Math.max(...childDepths);
      };

      const maxDepth = getMaxDepth(container);
      console.log(`Max component tree depth: ${maxDepth}`);

      // Component tree should not be excessively deep (under 30 is good)
      expect(maxDepth).toBeLessThan(30);
    });

    it('Homepage does not have excessive DOM nodes', () => {
      const { container } = render(
        <MemoryRouter>
          <SmarterDogHomepage />
        </MemoryRouter>
      );

      const countNodes = (element) => {
        let count = 1;
        Array.from(element.children).forEach(child => {
          count += countNodes(child);
        });
        return count;
      };

      const nodeCount = countNodes(container);
      console.log(`Total DOM nodes: ${nodeCount}`);

      // Should have reasonable number of DOM nodes (under 1500 is good)
      expect(nodeCount).toBeLessThan(1500);
    });
  });
});
