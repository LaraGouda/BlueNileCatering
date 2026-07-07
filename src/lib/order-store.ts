export type DashboardOrderStatus = "new" | "confirmed" | "preparing" | "ready" | "completed";

export interface DashboardOrderLine {
  item: string;
  selections: string[];
  notes: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface DashboardOrder {
  id: string;
  submittedAt: string;
  status: DashboardOrderStatus;
  business: string;
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  event: {
    date: string;
    time: string;
    deliveryAddress: string;
    deliveryAddressLine2: string;
    zipCode: string;
    numberOfPeople: number;
    individuallyWrapped: boolean;
    specialInstructions: string;
  };
  cart: DashboardOrderLine[];
  totals: {
    subtotal: number;
    deliveryFee: number;
    estimatedTotal: number;
  };
}

export type NewDashboardOrder = Omit<DashboardOrder, "id" | "status">;

const ORDERS_STORAGE_KEY = "blue-nile-orders-v1";

const SAMPLE_ORDERS: DashboardOrder[] = [
  {
    id: "BN-0726-1001",
    submittedAt: "2026-07-07T13:15:00.000Z",
    status: "new",
    business: "Blue Nile Mediterranean Grill",
    customer: {
      name: "Maya Hassan",
      phone: "609-555-0184",
      email: "maya@example.com",
    },
    event: {
      date: "2026-07-08",
      time: "12:30",
      deliveryAddress: "22 Mercer Street",
      deliveryAddressLine2: "Suite 4B",
      zipCode: "08690",
      numberOfPeople: 24,
      individuallyWrapped: false,
      specialInstructions: "Please label vegetarian trays and call when arriving.",
    },
    cart: [
      {
        item: "Mediterranean Platter",
        selections: [],
        notes: "",
        quantity: 2,
        unitPrice: 70,
        lineTotal: 140,
      },
      {
        item: "Chicken Shawarma Wrap Tray",
        selections: [],
        notes: "No onions on one tray",
        quantity: 1,
        unitPrice: 70,
        lineTotal: 70,
      },
    ],
    totals: {
      subtotal: 210,
      deliveryFee: 30,
      estimatedTotal: 240,
    },
  },
  {
    id: "BN-0726-1002",
    submittedAt: "2026-07-07T15:40:00.000Z",
    status: "confirmed",
    business: "Blue Nile Mediterranean Grill",
    customer: {
      name: "Jordan Lee",
      phone: "856-555-0142",
      email: "jordan@example.com",
    },
    event: {
      date: "2026-07-10",
      time: "18:00",
      deliveryAddress: "1400 Arena Drive",
      deliveryAddressLine2: "",
      zipCode: "08610",
      numberOfPeople: 36,
      individuallyWrapped: true,
      specialInstructions: "Deliver to rear entrance by loading dock.",
    },
    cart: [
      {
        item: "Shawarma Meat Tray",
        selections: ["Chicken Shawarma", "Side: Rice"],
        notes: "",
        quantity: 2,
        unitPrice: 70,
        lineTotal: 140,
      },
      {
        item: "Baklava",
        selections: [],
        notes: "",
        quantity: 1,
        unitPrice: 50,
        lineTotal: 50,
      },
    ],
    totals: {
      subtotal: 190,
      deliveryFee: 30,
      estimatedTotal: 220,
    },
  },
];

export function loadDashboardOrders(): DashboardOrder[] {
  if (typeof window === "undefined") return SAMPLE_ORDERS;

  try {
    const raw = window.localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return SAMPLE_ORDERS;

    const parsed = JSON.parse(raw) as DashboardOrder[];
    return Array.isArray(parsed) ? parsed : SAMPLE_ORDERS;
  } catch {
    return SAMPLE_ORDERS;
  }
}

export function saveDashboardOrders(orders: DashboardOrder[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
}

export function saveOrderRequest(order: NewDashboardOrder): DashboardOrder {
  const nextOrder: DashboardOrder = {
    ...order,
    id: createOrderId(),
    status: "new",
  };

  if (typeof window === "undefined") return nextOrder;

  try {
    const raw = window.localStorage.getItem(ORDERS_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as DashboardOrder[]) : [];
    const orders = Array.isArray(existing) ? existing : [];
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([nextOrder, ...orders]));
  } catch {
    // The order form still completes even if local storage is unavailable.
  }

  return nextOrder;
}

function createOrderId() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BN-${stamp}-${suffix}`;
}
