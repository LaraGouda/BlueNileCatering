import { z } from "zod";

import { BUSINESS, MENU_ITEMS } from "@/data/menu";
import type { DashboardOrder } from "./order-store";

const LINE_BREAKS = /[\r\n]+/g;
const HORIZONTAL_SPACE = /[ \t]+/g;
const PAPER_SUPPLIES_ITEM = "Paper Plates, Serving Spoons, Forks, Napkins";
const INDIVIDUALLY_WRAPPED_ITEM = "Individually Wrapped Meals";

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

const cleanSingleLine = (value: string, maxLength: number) =>
  stripUnsafeControlCharacters(value.normalize("NFKC"))
    .replace(LINE_BREAKS, " ")
    .replace(HORIZONTAL_SPACE, " ")
    .trim()
    .slice(0, maxLength);

const cleanMultiLine = (value: string, maxLength: number) =>
  stripUnsafeControlCharacters(value.normalize("NFKC"))
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(HORIZONTAL_SPACE, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);

const singleLineString = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? cleanSingleLine(value, maxLength) : value),
    z.string().max(maxLength),
  );

const requiredSingleLineString = (maxLength: number, message = "This field is required.") =>
  singleLineString(maxLength).pipe(z.string().min(1, message).max(maxLength));

const optionalSingleLineString = (maxLength: number) => singleLineString(maxLength);

const multiLineString = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? cleanMultiLine(value, maxLength) : value),
    z.string().max(maxLength),
  );

const emailSchema = z.preprocess(
  (value) => (typeof value === "string" ? cleanSingleLine(value, 254).toLowerCase() : value),
  z.string().email().max(254),
);

const moneySchema = z.number().finite().nonnegative().max(100_000);

export const dashboardOrderSchema: z.ZodType<DashboardOrder, z.ZodTypeDef, unknown> = z.object({
  id: requiredSingleLineString(64).pipe(z.string().regex(/^BN-[A-Z0-9-]+$/)),
  submittedAt: requiredSingleLineString(40),
  status: orderStatusSchema,
  payment: z.object({
    status: paymentStatusSchema,
    stripeCheckoutSessionId: optionalSingleLineString(255),
    stripePaymentIntentId: optionalSingleLineString(255),
    stripeReceiptUrl: optionalSingleLineString(2_000),
  }),
  business: requiredSingleLineString(120),
  customer: z.object({
    name: requiredSingleLineString(80),
    phone: requiredSingleLineString(24).pipe(z.string().regex(/^[\d\s()+.-]{7,24}$/)),
    email: emailSchema,
  }),
  event: z.object({
    date: requiredSingleLineString(10).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    time: requiredSingleLineString(5).pipe(z.string().regex(/^\d{2}:\d{2}$/)),
    deliveryAddress: requiredSingleLineString(160),
    deliveryAddressLine2: optionalSingleLineString(120),
    zipCode: requiredSingleLineString(10).pipe(z.string().regex(/^\d{5}(-\d{4})?$/)),
    numberOfPeople: z.number().int().min(1).max(5_000),
    paperSupplies: z.boolean(),
    individuallyWrapped: z.boolean(),
    specialInstructions: multiLineString(800),
  }),
  cart: z
    .array(
      z.object({
        item: requiredSingleLineString(120),
        selections: z.array(requiredSingleLineString(120)).max(40),
        notes: multiLineString(300),
        quantity: z.number().int().min(1).max(5_000),
        unitPrice: moneySchema,
        lineTotal: moneySchema,
      }),
    )
    .min(1)
    .max(100),
  totals: z.object({
    subtotal: moneySchema,
    deliveryFee: moneySchema,
    tax: moneySchema,
    estimatedTotal: moneySchema,
    finalTotal: moneySchema.nullable(),
  }),
});

export function normalizeOrderForSubmission(order: DashboardOrder): DashboardOrder {
  const menuLines = order.cart
    .filter((line) => line.item !== PAPER_SUPPLIES_ITEM && line.item !== INDIVIDUALLY_WRAPPED_ITEM)
    .map(normalizeMenuLine);

  if (menuLines.length === 0) {
    throw new Error("Add at least one menu item before checkout.");
  }

  const addOnLines = [
    ...(order.event.paperSupplies
      ? [
          {
            item: PAPER_SUPPLIES_ITEM,
            selections: [],
            notes: "",
            quantity: order.event.numberOfPeople,
            unitPrice: BUSINESS.paperSuppliesFeePerPerson,
            lineTotal: roundCurrency(
              order.event.numberOfPeople * BUSINESS.paperSuppliesFeePerPerson,
            ),
          },
        ]
      : []),
    ...(order.event.individuallyWrapped
      ? [
          {
            item: INDIVIDUALLY_WRAPPED_ITEM,
            selections: [],
            notes: "",
            quantity: order.event.numberOfPeople,
            unitPrice: BUSINESS.individuallyWrappedFeePerPerson,
            lineTotal: roundCurrency(
              order.event.numberOfPeople * BUSINESS.individuallyWrappedFeePerPerson,
            ),
          },
        ]
      : []),
  ];
  const cart = [...menuLines, ...addOnLines];
  const subtotal = roundCurrency(cart.reduce((sum, line) => sum + line.lineTotal, 0));
  const deliveryFee = cart.length > 0 ? BUSINESS.deliveryFee : 0;

  if (subtotal > 100_000) {
    throw new Error("Order total is too large for online checkout. Please call us.");
  }

  return {
    ...order,
    status: "new",
    payment: {
      status: "unpaid",
      stripeCheckoutSessionId: "",
      stripePaymentIntentId: "",
      stripeReceiptUrl: "",
    },
    cart,
    totals: {
      subtotal,
      deliveryFee,
      tax: 0,
      estimatedTotal: roundCurrency(subtotal + deliveryFee),
      finalTotal: null,
    },
  };
}

function normalizeMenuLine(line: DashboardOrder["cart"][number]) {
  const menuItem = MENU_ITEMS.find((item) => item.name === line.item);
  if (!menuItem) {
    throw new Error(`Menu item is not available: ${line.item}`);
  }

  let unitPrice = menuItem.price ?? 0;
  const selections: string[] = [];

  if (menuItem.variants) {
    const variant = menuItem.variants.find((entry) => line.selections.includes(entry.label));
    if (!variant) {
      throw new Error(`Choose a valid option for ${menuItem.name}.`);
    }
    unitPrice = variant.price;
    selections.push(variant.label);
  } else if (menuItem.price === undefined) {
    throw new Error(`Menu item is missing a price: ${menuItem.name}`);
  }

  if (menuItem.quantityChoices) {
    const quantityChoice = menuItem.quantityChoices.find((choice) =>
      line.selections.includes(choice.label),
    );
    if (!quantityChoice || line.selections.length !== 1) {
      throw new Error(`Choose a valid quantity option for ${menuItem.name}.`);
    }
    selections.push(quantityChoice.label);
  }

  for (const option of menuItem.options ?? []) {
    if (option.type === "single") {
      const prefix = `${option.name}: `;
      const selection = line.selections.find((entry) => entry.startsWith(prefix));
      const choiceLabel = selection?.slice(prefix.length);
      const choice = option.choices.find((entry) => entry.label === choiceLabel);
      if (!choice) {
        throw new Error(`Choose a valid ${option.name.toLowerCase()} for ${menuItem.name}.`);
      }
      selections.push(`${option.name}: ${choice.label}`);
    }

    if (option.type === "addon") {
      for (const choice of option.choices) {
        if (line.selections.includes(choice.label)) {
          selections.push(choice.label);
          unitPrice += choice.priceDelta ?? 0;
        }
      }
    }
  }

  const lineTotal = roundCurrency(unitPrice * line.quantity);

  if (lineTotal > 100_000) {
    throw new Error(`${menuItem.name} total is too large for online checkout. Please call us.`);
  }

  return {
    ...line,
    item: menuItem.name,
    selections,
    unitPrice: roundCurrency(unitPrice),
    lineTotal,
  };
}

function stripUnsafeControlCharacters(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || (code >= 32 && code !== 127);
    })
    .join("");
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
