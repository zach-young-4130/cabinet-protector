// Seed data and pricing/validation constants. The runtime catalog lives in
// PostgreSQL — `npm run db:setup` creates the schema and seeds it from here.

export const PAINT_MATCH_FEE = 15;
export const WIDTH_RANGE = { min: 6, max: 96 };
export const HEIGHT_RANGE = { min: 2, max: 24 };
export const SW_CODE_PATTERN = /^(SW[\s-]?)?\d{4}$/i;

export const stockColors = [
  { id: 'alabaster-white', name: 'Alabaster White', hex: '#EDEAE0' },
  { id: 'harbor-fog', name: 'Harbor Fog', hex: '#B9C0C4' },
  { id: 'sagebrush', name: 'Sagebrush', hex: '#8A9A8B' },
  { id: 'midnight-navy', name: 'Midnight Navy', hex: '#1F3A5F' },
  { id: 'clay-ridge', name: 'Clay Ridge', hex: '#B07A5C' },
  { id: 'iron-ore', name: 'Iron Ore', hex: '#4A4A48' }
];

export const products = [
  {
    id: '1',
    name: 'Standard Protect - Matte Finish',
    description: 'Heavy-duty vinyl barrier strip for the base of floor-length cabinets. Absorbs impacts from wheelchair footrests, walkers, and everyday kicks so the door underneath never chips. Fully paintable and sized for common cabinet widths.',
    price: 45.00,
    isPaintable: true,
    isRemovable: true,
    isCuttable: true,
    availableSizes: [
      { id: 's1', label: '24" W × 6" H', widthInches: 24, heightInches: 6 },
      { id: 's2', label: '30" W × 8" H', widthInches: 30, heightInches: 8 }
    ]
  },
  {
    id: '2',
    name: 'Ultra-Thin Easy Grip',
    description: 'Low-profile barrier strip for narrow base panels and tight toe-kick areas. Still fully paintable and easy to cut to any cabinet run.',
    price: 38.00,
    isPaintable: true,
    isRemovable: true,
    isCuttable: true,
    availableSizes: [
      { id: 's3', label: '24" W × 4" H', widthInches: 24, heightInches: 4 },
      { id: 's4', label: '36" W × 6" H', widthInches: 36, heightInches: 6 }
    ]
  }
];
