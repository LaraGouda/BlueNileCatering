import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendOrderToGoogleSheets,
  deleteOrderFromGoogleSheets,
  listOrdersFromGoogleSheets,
  updateOrderPaymentInGoogleSheets,
  updateOrderStatusInGoogleSheets,
} from "./google-sheets.server";
import type { DashboardOrder, DashboardPaymentStatus } from "./order-store";

const orderStatusSchema = z.enum([
  "new",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "declined",
  "canceled",
]);
const paymentStatusSchema = z.enum([
  "unpaid",
  "pending",
  "authorized",
  "paid",
  "canceled",
  "failed",
  "refunded",
]);

const dashboardOrderSchema: z.ZodType<DashboardOrder> = z.object({
  id: z.string().min(1),
  submittedAt: z.string().min(1),
  status: orderStatusSchema,
  payment: z.object({
    status: paymentStatusSchema,
    stripeCheckoutSessionId: z.string(),
    stripePaymentIntentId: z.string(),
    stripeReceiptUrl: z.string(),
  }),
  business: z.string().min(1),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email(),
  }),
  event: z.object({
    date: z.string().min(1),
    time: z.string().min(1),
    deliveryAddress: z.string().min(1),
    deliveryAddressLine2: z.string(),
    zipCode: z.string().min(1),
    numberOfPeople: z.number().int().positive(),
    paperSupplies: z.boolean(),
    individuallyWrapped: z.boolean(),
    specialInstructions: z.string(),
  }),
  cart: z.array(
    z.object({
      item: z.string().min(1),
      selections: z.array(z.string()),
      notes: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().nonnegative(),
      lineTotal: z.number().nonnegative(),
    }),
  ),
  totals: z.object({
    subtotal: z.number().nonnegative(),
    deliveryFee: z.number().nonnegative(),
    tax: z.number().nonnegative(),
    estimatedTotal: z.number().nonnegative(),
    finalTotal: z.number().nonnegative().nullable(),
  }),
});

export const submitOrderToGoogleSheets = createServerFn({ method: "POST" })
  .validator((data: unknown) => dashboardOrderSchema.parse(data))
  .handler(async ({ data }) => {
    return appendOrderToGoogleSheets(data);
  });

export const loadOrdersFromGoogleSheets = createServerFn({ method: "GET" }).handler(async () => {
  return listOrdersFromGoogleSheets();
});

export const updateGoogleSheetsOrderStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().min(1),
        status: orderStatusSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return updateOrderStatusInGoogleSheets(data.orderId, data.status);
  });

export const updateGoogleSheetsOrderPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().min(1),
        paymentStatus: paymentStatusSchema,
        orderStatus: orderStatusSchema.optional(),
        tax: z.number().nonnegative().optional(),
        finalTotal: z.number().nonnegative().nullable().optional(),
        stripeCheckoutSessionId: z.string().optional(),
        stripePaymentIntentId: z.string().optional(),
        stripeReceiptUrl: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return updateOrderPaymentInGoogleSheets({
      ...data,
      paymentStatus: data.paymentStatus as DashboardPaymentStatus,
    });
  });

export const deleteGoogleSheetsOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return deleteOrderFromGoogleSheets(data.orderId);
  });
