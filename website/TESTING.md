# Testing Documentation

## Overview

This project uses **Vitest** as the testing framework with **React Testing Library** for component testing. We maintain **100% test coverage** on core components and constants.

## Testing Stack

- **Vitest** - Fast, Vite-native test runner
- **@testing-library/react** - React component testing utilities
- **@testing-library/jest-dom** - Custom DOM matchers
- **jsdom** - DOM environment for tests
- **@vitest/ui** - Visual test runner interface
- **@vitest/coverage-v8** - Code coverage reporting

## Running Tests

### Basic Commands

```bash
# Run tests in watch mode (interactive)
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with visual UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

### Watch Mode

In watch mode, Vitest will:
- Re-run tests when files change
- Show test results in real-time
- Allow filtering tests by filename or pattern

### Coverage Reports

Coverage reports are generated in the `coverage/` directory:
- `coverage/index.html` - Visual HTML report (open in browser)
- `coverage/coverage-final.json` - JSON format for CI tools

## Test Coverage

### Current Coverage: 100%

| Component | Statements | Branches | Functions | Lines |
|-----------|------------|----------|-----------|-------|
| DogSilhouette.jsx | 100% | 100% | 100% | 100% |
| PolaroidImage.jsx | 100% | 100% | 100% | 100% |
| ServiceCard.jsx | 100% | 100% | 100% | 100% |
| SmarterDogHomepage.jsx | 100% | 100% | 100% | 100% |
| colors.js | 100% | 100% | 100% | 100% |

### Coverage Thresholds

The project enforces minimum coverage thresholds (configured in `vitest.config.js`):

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 65%
- **Statements**: 70%

Tests will fail if coverage drops below these thresholds.

## Test Organization

### File Structure

```
src/
├── components/
│   ├── ServiceCard.jsx
│   ├── ServiceCard.test.jsx          # Component tests
│   ├── PolaroidImage.jsx
│   ├── PolaroidImage.test.jsx
│   ├── DogSilhouette.jsx
│   ├── DogSilhouette.test.jsx
│   └── SmarterDogHomepage.jsx
│       └── SmarterDogHomepage.test.jsx
├── constants/
│   ├── colors.js
│   └── colors.test.js                # Constants tests
└── test/
    └── setup.js                      # Test configuration
```

### Naming Conventions

- Test files: `*.test.jsx` or `*.test.js`
- Test suites: Use `describe()` blocks to group related tests
- Test cases: Use `it()` or `test()` with descriptive names

## Writing Tests

### Component Testing Example

```javascript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders with props', () => {
    render(<MyComponent title="Hello" />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies correct styling', () => {
    const { container } = render(<MyComponent />);
    const element = container.firstChild;

    expect(element).toHaveClass('my-class');
  });
});
```

### Testing Async State Updates

When testing components with timers or async state:

```javascript
import { act } from '@testing-library/react';
import { vi } from 'vitest';

it('updates after timeout', async () => {
  vi.useFakeTimers();
  render(<Component />);

  await act(async () => {
    vi.advanceTimersByTime(100);
  });

  expect(screen.getByText('Updated')).toBeInTheDocument();
  vi.useRealTimers();
});
```

### Testing Inline Styles

For components using inline styles:

```javascript
it('applies background color', () => {
  const { container } = render(<Component bgColor="white" />);
  const element = container.firstChild;

  expect(element.style.backgroundColor).toBe('white');
});
```

## Best Practices

### ✅ Do

- Test user-visible behavior, not implementation details
- Use `screen.getByRole()` when possible for accessibility
- Test edge cases and error states
- Keep tests focused on a single behavior
- Use descriptive test names
- Clean up side effects in `afterEach()`

### ❌ Don't

- Test internal component state directly
- Rely on implementation details (class names, internal methods)
- Write tests that depend on other tests
- Use `console.log()` in tests
- Commit `coverage/` directory to git

## Mocking

### Mocking Child Components

For unit testing, mock child components:

```javascript
vi.mock('./ChildComponent', () => ({
  default: () => <div data-testid="child">Mocked Child</div>
}));
```

### Mocking Constants

```javascript
vi.mock('../constants/colors', () => ({
  colors: {
    teal: '#2A6F6B',
    cyan: '#00C2FF',
  }
}));
```

## Continuous Integration

Tests run automatically on:
- Every push to `main`, `master`, or `develop` branches
- Every pull request

The CI workflow (`.github/workflows/ci.yml`):
1. Runs linter
2. Runs all tests
3. Generates coverage report
4. Uploads coverage to Codecov
5. Builds the project

### CI Badge

Add this to your README:

```markdown
![CI](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/CI/badge.svg)
```

## Troubleshooting

### Tests Not Running

```bash
# Clear cache and reinstall
rm -rf node_modules coverage .vitest
npm install
npm test
```

### Coverage Not Generated

```bash
# Install coverage provider
npm install --save-dev @vitest/coverage-v8
npm run test:coverage
```

### Timeout Errors

Increase timeout in test file:

```javascript
it('long running test', async () => {
  // test code
}, 10000); // 10 second timeout
```

Or globally in `vitest.config.js`:

```javascript
export default defineConfig({
  test: {
    testTimeout: 10000,
  },
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Vitest UI](https://vitest.dev/guide/ui.html)

## Future Improvements

### Recommended Next Steps

1. **Integration Tests** - Test full user flows across multiple components
2. **E2E Tests** - Add Playwright or Cypress for browser testing
3. **Visual Regression** - Use Chromatic or Percy for visual testing
4. **Accessibility Tests** - Integrate `jest-axe` or similar tools
5. **Performance Tests** - Add React profiling tests
6. **Section Component Tests** - Test remaining section components:
   - AnnouncementBar
   - Navigation
   - TrustSection
   - ServicesSection
   - GallerySection
   - TestimonialsSection
   - OfferSection
   - CTASection
   - FooterSection

## Coverage Goals

Target 80%+ coverage on:
- All reusable components
- All section components
- All utilities and constants
- Critical user flows
