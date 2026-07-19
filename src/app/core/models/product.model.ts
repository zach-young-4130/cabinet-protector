export interface CabinetSize {
  id: string;
  label: string;
  widthInches: number;
  heightInches: number;
}

export interface FinishColor {
  id: string;
  name: string;
  hex: string;
  /** Paint brand id (e.g. 'sherwin-williams') this stock color is pre-painted with. */
  brand: string;
}

export interface VinylProtector {
  id: string;
  name: string;
  description: string;
  price: number;
  thicknessMils: number;
  isPaintable: boolean;
  isRemovable: boolean;
  isCuttable: boolean;
  availableSizes: CabinetSize[];
  image_url?: string;
}
