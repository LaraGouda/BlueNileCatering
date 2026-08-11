import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  cancelAuthorizedPayment,
  captureAuthorizedPayment,
  createManualCaptureCheckoutSession,
  refundCapturedPayment,
} from "./stripe.server";
import type { DashboardOrder } from "./order-store";

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

const paymentActionSchema = z.object({
  orderId: z.string().min(1),
  paymentIntentId: z.string().min(1),
});

const refundActionSchema = paymentActionSchema.extend({
  refundAmount: z.number().positive().optional(),
});

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => dashboardOrderSchema.parse(data))
  .handler(async ({ data }) => {
    return createManualCaptureCheckoutSession(data);
  });

export const captureStripeAuthorizedPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => paymentActionSchema.parse(data))
  .handler(async ({ data }) => {
    return captureAuthorizedPayment(data.orderId, data.paymentIntentId);
  });

export const cancelStripeAuthorizedPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => paymentActionSchema.parse(data))
  .handler(async ({ data }) => {
    return cancelAuthorizedPayment(data.orderId, data.paymentIntentId);
  });

export const refundStripeCapturedPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => refundActionSchema.parse(data))
  .handler(async ({ data }) => {
    return refundCapturedPayment(data.orderId, data.paymentIntentId, data.refundAmount);
  });
