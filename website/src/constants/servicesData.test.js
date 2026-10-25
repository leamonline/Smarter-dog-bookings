import { describe, expect, it } from 'vitest';
import { services, additionalServices } from './servicesData';

describe('approved customer service facts (#1073)', () => {
    it('publishes the portal names and approved prices without extra trimming claims', () => {
        expect(services.map(({ title, price }) => [title, price])).toEqual([
            ['Full Groom', 'From £42'], ['Bath & Brush', 'From £38'], ['Bath & De-shed', 'From £38'],
        ]);
        for (const service of services.slice(1)) {
            expect(service.description).not.toMatch(/nail|hygiene|face|feet|trim/i);
            expect(service.description).toMatch(/bath, blow-dry/i);
        }
        expect(additionalServices.puppyIntro).toMatchObject({ title: 'Puppy Groom', price: '£38' });
    });
});
