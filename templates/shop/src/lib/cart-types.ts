/** Shared cart wire shapes (backend cart JSON + rates). */
export interface CartLine {
  lineId: string;
  productId: string;
  quantity: number;
  unitPrice: { currency: string; amount: number };
  lineSubtotal: { currency: string; amount: number };
  title: string;
}
export interface ShippingRate {
  id?: string;
  label?: string;
  name?: string;
  amount?: number;
  price?: { amount: number };
}
export interface Cart {
  currency: string;
  items: CartLine[];
  coupons: { code: string }[];
  subtotal: { currency: string; amount: number };
  discountTotal: { currency: string; amount: number };
  shippingTotal: { currency: string; amount: number };
  taxTotal: { currency: string; amount: number };
  total: { currency: string; amount: number };
  shippingAddress?: { country?: string; postalCode?: string } | null;
  shippingMethod?: { id?: string } | null;
}
