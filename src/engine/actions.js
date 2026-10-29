// The actions an answer can propose. The model calls one of these tools for a
// booking or an order; the app shows the arguments as a draft card the person
// confirms. Nothing is sent anywhere: a draft is the agent showing its work.

const str = (description) => ({ type: 'string', description });
const list = (description) => ({ type: 'array', items: { type: 'string' }, description });

export const ACTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'draft_booking',
      description: 'Draft a booking or reservation (hotel, flight, restaurant, activity) for the user to confirm.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['hotel', 'flight', 'restaurant', 'activity', 'other'] },
          place: str('Name of the place, airline or venue'),
          when: str('Dates or time, as the user would say them'),
          party: str('Who is going, e.g. "2 adults" or "family of 4"'),
          details: list('Specifics chosen for this user, e.g. "2 queen beds", "patio table", "under $200 a night"'),
          based_on: list('Exact memory card texts that shaped this draft'),
        },
        required: ['kind', 'place', 'details'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_order',
      description: 'Draft an order (groceries, food, a gift, a drink) for the user to confirm.',
      parameters: {
        type: 'object',
        properties: {
          store: str('Where it is ordered from'),
          items: list('Items with quantity, e.g. "1 large iced matcha, oat milk"'),
          when: str('Pickup or delivery time'),
          details: list('Other specifics chosen for this user'),
          based_on: list('Exact memory card texts that shaped this draft'),
        },
        required: ['store', 'items'],
      },
    },
  },
];

// One tool call → the draft the app renders, or null.
export function toDraft(call) {
  if (!call) return null;
  const a = call.args ?? {};
  const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : []);
  if (call.name === 'draft_booking') {
    return { type: 'booking', kind: a.kind ?? 'other', title: String(a.place ?? 'Booking'), when: a.when ?? '', party: a.party ?? '', details: arr(a.details), basedOn: arr(a.based_on) };
  }
  if (call.name === 'draft_order') {
    return { type: 'order', kind: 'order', title: String(a.store ?? 'Order'), when: a.when ?? '', items: arr(a.items), details: arr(a.details), basedOn: arr(a.based_on) };
  }
  return null;
}
