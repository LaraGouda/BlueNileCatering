import type { DashboardOrder, DashboardOrderLine } from "@/lib/order-store";

export interface CustomerOrderView {
  id: string;
  submittedAt: string;
  status: DashboardOrder["status"];
  paymentStatus: DashboardOrder["payment"]["status"];
  event: {
    date: string;
    time: string;
    deliveryAddress: string;
    deliveryAddressLine2: string;
    zipCode: string;
    numberOfPeople: number;
    paperSupplies: boolean;
    individuallyWrapped: boolean;
    specialInstructions: string;
  };
  cart: DashboardOrderLine[];
  totals: {
    subtotal: number;
    deliveryFee: number;
    estimatedTotal: number;
    finalTotal: number | null;
  };
}

export function toCustomerOrderView(order: DashboardOrder): CustomerOrderView {
  return {
    id: order.id,
    submittedAt: order.submittedAt,
    status: order.status,
    paymentStatus: order.payment.status,
    event: order.event,
    cart: order.cart,
    totals: {
      subtotal: order.totals.subtotal,
      deliveryFee: order.totals.deliveryFee,
      estimatedTotal: order.totals.estimatedTotal,
      finalTotal: order.totals.finalTotal,
    },
  };
}

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}
