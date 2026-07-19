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
