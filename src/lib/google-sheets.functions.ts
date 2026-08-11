import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendOrderToGoogleSheets,
  deleteOrderFromGoogleSheets,
  listOrdersFromGoogleSheets,
  updateOrderPaymentInGoogleSheets,
  updateOrderStatusInGoogleSheets,
} from "./google-sheets.server";
import { dashboardOrderSchema, normalizeOrderForSubmission } from "./order-validation";
import type { DashboardPaymentStatus } from "./order-store";

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
const orderIdSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^BN-[A-Z0-9-]+$/);
const stripeIdSchema = z.string().trim().max(255);

export const submitOrderToGoogleSheets = createServerFn({ method: "POST" })
  .validator((data: unknown) => normalizeOrderForSubmission(dashboardOrderSchema.parse(data)))
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
        orderId: orderIdSchema,
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
        orderId: orderIdSchema,
        paymentStatus: paymentStatusSchema,
        orderStatus: orderStatusSchema.optional(),
        tax: z.number().finite().nonnegative().max(100_000).optional(),
        finalTotal: z.number().finite().nonnegative().max(100_000).nullable().optional(),
        stripeCheckoutSessionId: stripeIdSchema.optional(),
        stripePaymentIntentId: stripeIdSchema.optional(),
        stripeReceiptUrl: z.string().trim().max(2_000).optional(),
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
        orderId: orderIdSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return deleteOrderFromGoogleSheets(data.orderId);
  });
