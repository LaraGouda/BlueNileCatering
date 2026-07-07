import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { appendOrderToGoogleSheets } from "./google-sheets.server";
import type { DashboardOrder } from "./order-store";

const dashboardOrderSchema: z.ZodType<DashboardOrder> = z.object({
  id: z.string().min(1),
  submittedAt: z.string().min(1),
  status: z.enum(["new", "confirmed", "preparing", "ready", "completed"]),
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
    estimatedTotal: z.number().nonnegative(),
  }),
});

export const submitOrderToGoogleSheets = createServerFn({ method: "POST" })
  .validator((data: unknown) => dashboardOrderSchema.parse(data))
  .handler(async ({ data }) => {
    return appendOrderToGoogleSheets(data);
  });
