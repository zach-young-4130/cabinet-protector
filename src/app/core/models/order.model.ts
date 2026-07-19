export interface OrderLineSize {
  kind: 'standard' | 'custom';
  label: string;
  widthInches: number;
  heightInches: number;
}

export interface OrderLineFinish {
  kind: 'primed' | 'stock' | 'paint-match';
  label: string;
}

export interface OrderLine {
  productId: string;
  productName: string;
  size: OrderLineSize;
  finish: OrderLineFinish;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderCustomer {
  fullName: string;
  email: string;
  address: string;
  phoneNumber: string;
}

export interface CustomerOrder {
  id: string;
  createdAt: string;
  status: string;
  subtotal: number;
  couponCode: string | null;
  discountAmount: number;
  total: number;
  refundAmount: number;
  lines: OrderLine[];
  customer: OrderCustomer;
}
