import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  cancelAuthorizedPayment,
  captureAuthorizedPayment,
  createManualCaptureCheckoutSession,
  refundCapturedPayment,
} from "./stripe.server";
import { dashboardOrderSchema, normalizeOrderForSubmission } from "./order-validation";

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

const paymentActionSchema = z.object({
  orderId: z
    .string()
    .trim()
    .max(64)
    .regex(/^BN-[A-Z0-9-]+$/),
  paymentIntentId: z
    .string()
    .trim()
    .max(255)
    .regex(/^pi_[A-Za-z0-9_]+$/),
});

const refundActionSchema = paymentActionSchema.extend({
  refundAmount: z.number().finite().positive().max(100_000).optional(),
});

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => normalizeOrderForSubmission(dashboardOrderSchema.parse(data)))
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
