export type PaintBrandId = 'sherwin-williams' | 'benjamin-moore' | 'behr';

export interface PaintBrand {
  id: PaintBrandId;
  name: string;
  /** Label for the paint-code input, e.g. "Sherwin-Williams paint code" */
  codeLabel: string;
  placeholder: string;
  /** Shown under the code input to help the customer find their code */
  helpText: string;
  /** The brand's official tool for finding/ordering physical color chips or codes */
  colorToolUrl: string;
  colorToolLabel: string;
  /** Loose sanity check — brands don't publish one fixed code format, so this only
   *  rejects obviously-wrong input. The server re-validates independently. */
  codePattern: RegExp;
}

export const PAINT_BRANDS: PaintBrand[] = [
  {
    id: 'sherwin-williams',
    name: 'Sherwin-Williams',
    codeLabel: 'Sherwin-Williams paint code',
    placeholder: 'SW 7008',
    helpText: 'The 4-digit SW number on your paint can lid or swatch (e.g., SW 7008 Alabaster).',
    colorToolUrl: 'https://www.sherwin-williams.com/homeowners/color-tools/order-color-chips',
    colorToolLabel: 'Order free color chips from Sherwin-Williams',
    codePattern: /^(SW[\s-]?)?\d{4}$/i
  },
  {
    id: 'benjamin-moore',
    name: 'Benjamin Moore',
    codeLabel: 'Benjamin Moore paint code',
    placeholder: 'OC-17',
    helpText: 'The color number on your paint can lid or swatch (e.g., OC-17 White Dove, 2135-70 Wrought Iron).',
    colorToolUrl: 'https://www.benjaminmoore.com/en-us/paint-colors/search',
    colorToolLabel: "Find your code on Benjamin Moore's color search",
    codePattern: /^[A-Za-z0-9]+(-[A-Za-z0-9]+){0,3}$/
  },
  {
    id: 'behr',
    name: 'Behr',
    codeLabel: 'Behr paint code',
    placeholder: 'M290-6',
    helpText: 'The color number on your paint can lid or swatch (e.g., M290-6 Plantain Chips).',
    colorToolUrl: 'https://www.behr.com/consumer/colorstudio',
    colorToolLabel: "Find your code on Behr's ColorStudio",
    codePattern: /^[A-Za-z0-9]+(-[A-Za-z0-9]+){0,3}$/
  }
];

export const DEFAULT_PAINT_BRAND_ID: PaintBrandId = 'sherwin-williams';

export function findPaintBrand(id: string): PaintBrand {
  return PAINT_BRANDS.find(b => b.id === id) ?? PAINT_BRANDS[0];
}
