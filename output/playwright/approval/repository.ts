export const SIGNUP_PAGE_SIZE = 5;
const humans = [{ id: 'h1', name: 'Alex Taylor', phone: '07700 900123', email: 'alex@example.test', submittedAt: '2026-09-04T08:00:00Z', dogs: [{ id: 'd1', name: 'Milo' }, { id: 'd2', name: 'Luna' }] }, { id: 'h2', name: 'Sam Morgan', phone: null, email: null, submittedAt: '2026-09-05T07:00:00Z', dogs: [{ id: 'd3', name: 'Pepper' }] }];
const dogs = [{ id: 'd1', name: 'Milo', breed: 'Cockapoo', size: 'medium', reportedSize: null }, { id: 'd2', name: 'Luna', breed: 'Crossbreed', size: null, reportedSize: 'small' }];
export async function listPendingSignups() { return { customers: structuredClone(humans), total: humans.length }; }
export async function getSignupReview(_client, id) { return { ...structuredClone(humans.find(h=>h.id===id)), activeDogs: structuredClone(dogs) }; }
export async function saveSignupDogSize(_client, _id, dog, size) { dogs.find(d=>d.id===dog.id).size=size; }
export async function approveFixture(id) { humans.splice(humans.findIndex(h=>h.id===id),1); return { ok: true, welcomeStatus: 'accepted' }; }
