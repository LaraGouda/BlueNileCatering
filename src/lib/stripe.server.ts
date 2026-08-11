import "@tanstack/react-start/server-only";

import Stripe from "stripe";

import {
  logEmailNotificationResults,
  sendOrderApprovedNotifications,
  sendOrderDeclinedNotifications,
  sendOrderPaymentFailedNotifications,
  sendOrderSubmittedNotifications,
} from "./email.server";
import {
  getOrderFromGoogleSheets,
  loadServiceStatusFromGoogleSheets,
  updateOrderPaymentInGoogleSheets,
} from "./google-sheets.server";
import type { DashboardOrder } from "./order-store";
import { getServiceSuspensionMessage, type ServiceStatus } from "./service-status";

type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  publicSiteUrl: string;
};

type StripeCheckoutResult =
  | { createdCheckoutSession: true; checkoutUrl: string; checkoutSessionId: string }
  | {
      createdCheckoutSession: false;
      reason: string;
      serviceSuspended?: boolean;
      serviceStatus?: ServiceStatus;
    };

type StripePaymentActionResult = { completed: true } | { completed: false; reason: string };

export async function createManualCaptureCheckoutSession(
  order: DashboardOrder,
): Promise<StripeCheckoutResult> {
  const serviceStatus = await loadServiceStatusFromGoogleSheets();
  if (serviceStatus.loadedFromGoogleSheets && serviceStatus.status.suspended) {
    return {
      createdCheckoutSession: false,
      reason: getServiceSuspensionMessage(serviceStatus.status),
      serviceSuspended: true,
      serviceStatus: serviceStatus.status,
    };
  }

  const config = readStripeConfig();
  if (!config?.secretKey) {
    return {
      createdCheckoutSession: false,
      reason: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env.",
    };
  }

  const stripe = createStripeClient(config.secretKey);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.customer.email,
    client_reference_id: order.id,
    line_items: toCheckoutLineItems(order),
    metadata: {
      orderId: order.id,
    },
    payment_intent_data: {
      capture_method: "manual",
      metadata: {
        orderId: order.id,
        customerName: order.customer.name,
        eventDate: order.event.date,
      },
    },
    success_url: `${config.publicSiteUrl}/?checkout=success&order=${encodeURIComponent(order.id)}`,
    cancel_url: `${config.publicSiteUrl}/?checkout=cancelled&order=${encodeURIComponent(order.id)}`,
  });

  if (!session.url) {
    return {
      createdCheckoutSession: false,
      reason: "Stripe did not return a Checkout URL.",
    };
  }

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId: order.id,
    paymentStatus: "pending",
    stripeCheckoutSessionId: session.id,
  });

  if (!sheetUpdate.updatedGoogleSheets) {
    return {
      createdCheckoutSession: false,
      reason: sheetUpdate.reason,
    };
  }

  return {
    createdCheckoutSession: true,
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
  };
}

export async function captureAuthorizedPayment(
  orderId: string,
  paymentIntentId: string,
): Promise<StripePaymentActionResult> {
  const config = readStripeConfig();
  if (!config?.secretKey) {
    return { completed: false, reason: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env." };
  }

  const stripe = createStripeClient(config.secretKey);
  const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
  const receiptUrl = await readLatestChargeReceiptUrl(stripe, paymentIntent);
  const finalTotal = centsToDollars(paymentIntent.amount_received || paymentIntent.amount);

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId,
    orderStatus: "confirmed",
    paymentStatus: "paid",
    finalTotal,
    stripePaymentIntentId: paymentIntent.id,
    stripeReceiptUrl: receiptUrl,
  });

  if (!sheetUpdate.updatedGoogleSheets) {
    return { completed: false, reason: sheetUpdate.reason };
  }

  await notifyOrderApproved(orderId);

  return { completed: true };
}

export async function cancelAuthorizedPayment(
  orderId: string,
  paymentIntentId: string,
): Promise<StripePaymentActionResult> {
  const config = readStripeConfig();
  if (!config?.secretKey) {
    return { completed: false, reason: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env." };
  }

  const stripe = createStripeClient(config.secretKey);
  const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId,
    orderStatus: "declined",
    paymentStatus: "canceled",
    stripePaymentIntentId: paymentIntent.id,
  });

  if (!sheetUpdate.updatedGoogleSheets) {
    return { completed: false, reason: sheetUpdate.reason };
  }

  await notifyOrderDeclined(orderId);

  return { completed: true };
}

export async function refundCapturedPayment(
  orderId: string,
  paymentIntentId: string,
  refundAmount?: number,
): Promise<StripePaymentActionResult> {
  const config = readStripeConfig();
  if (!config?.secretKey) {
    return { completed: false, reason: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env." };
  }

  const stripe = createStripeClient(config.secretKey);
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const capturedAmountCents = paymentIntent.amount_received;

  if (paymentIntent.status !== "succeeded" || capturedAmountCents <= 0) {
    return {
      completed: false,
      reason: "Stripe has not captured this payment yet. Use Decline & Release before approval.",
    };
  }

  const refundAmountCents =
    refundAmount === undefined ? capturedAmountCents : dollarsToCents(refundAmount);

  if (refundAmountCents <= 0) {
    return { completed: false, reason: "Refund amount must be greater than $0." };
  }

  if (refundAmountCents > capturedAmountCents) {
    return { completed: false, reason: "Refund amount cannot be more than the captured payment." };
  }

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
    metadata: {
      orderId,
    },
  };

  if (refundAmountCents < capturedAmountCents) {
    refundParams.amount = refundAmountCents;
  }

  const refund = await stripe.refunds.create(refundParams);

  if (refund.status === "failed" || refund.status === "canceled") {
    return { completed: false, reason: `Stripe refund did not complete: ${refund.status}.` };
  }

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId,
    orderStatus: "canceled",
    paymentStatus: "refunded",
    finalTotal: centsToDollars(capturedAmountCents - refundAmountCents),
    stripePaymentIntentId: paymentIntent.id,
  });

  if (!sheetUpdate.updatedGoogleSheets) {
    return { completed: false, reason: sheetUpdate.reason };
  }

  return { completed: true };
}

export async function handleStripeWebhookRequest(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const config = readStripeConfig();
  if (!config?.secretKey) {
    return jsonResponse({ error: "Stripe is not configured." }, 500);
  }
  if (!config.webhookSecret) {
    return jsonResponse({ error: "Stripe webhook secret is not configured." }, 500);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ error: "Missing Stripe signature." }, 400);
  }

  const stripe = createStripeClient(config.secretKey);
  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe signature.";
    return jsonResponse({ error: message }, 400);
  }

  try {
    await handleStripeEvent(stripe, event);
  } catch (error) {
    console.error("Stripe webhook handling failed:", error);
    return jsonResponse({ error: "Webhook handler failed." }, 500);
  }

  return jsonResponse({ received: true });
}

async function handleStripeEvent(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object);
      return;
    case "payment_intent.amount_capturable_updated":
      await handlePaymentIntentAuthorized(event.data.object);
      return;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(stripe, event.data.object);
      return;
    case "payment_intent.canceled":
      await handlePaymentIntentCanceled(event.data.object);
      return;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object);
      return;
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  const paymentIntentId = toStripeId(session.payment_intent);
  if (!orderId || !paymentIntentId) return;

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId,
    paymentStatus: "authorized",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId,
  });

  if (sheetUpdate.updatedGoogleSheets) {
    await notifyOrderSubmitted(orderId);
  }
}

async function handlePaymentIntentAuthorized(paymentIntent: Stripe.PaymentIntent) {
  const orderId = paymentIntent.metadata.orderId;
  if (!orderId) return;

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId,
    paymentStatus: "authorized",
    stripePaymentIntentId: paymentIntent.id,
  });

  if (sheetUpdate.updatedGoogleSheets) {
    await notifyOrderSubmitted(orderId);
  }
}

async function handlePaymentIntentSucceeded(stripe: Stripe, paymentIntent: Stripe.PaymentIntent) {
  const orderId = paymentIntent.metadata.orderId;
  if (!orderId) return;

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId,
    orderStatus: "confirmed",
    paymentStatus: "paid",
    finalTotal: centsToDollars(paymentIntent.amount_received || paymentIntent.amount),
    stripePaymentIntentId: paymentIntent.id,
    stripeReceiptUrl: await readLatestChargeReceiptUrl(stripe, paymentIntent),
  });

  if (sheetUpdate.updatedGoogleSheets) {
    await notifyOrderApproved(orderId);
  }
}

async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
  const orderId = paymentIntent.metadata.orderId;
  if (!orderId) return;

  await updateOrderPaymentInGoogleSheets({
    orderId,
    paymentStatus: "canceled",
    stripePaymentIntentId: paymentIntent.id,
  });
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const orderId = paymentIntent.metadata.orderId;
  if (!orderId) return;

  const sheetUpdate = await updateOrderPaymentInGoogleSheets({
    orderId,
    paymentStatus: "failed",
    stripePaymentIntentId: paymentIntent.id,
  });

  if (sheetUpdate.updatedGoogleSheets) {
    await notifyOrderPaymentFailed(orderId);
  }
}

async function notifyOrderSubmitted(orderId: string) {
  const order = await getOrderFromGoogleSheets(orderId);
  if (!order) {
    console.warn(`[email] order ${orderId} was not found for submitted notifications.`);
    return;
  }

  const results = await sendOrderSubmittedNotifications(order);
  logEmailNotificationResults("submitted", orderId, results);
}

async function notifyOrderApproved(orderId: string) {
  const order = await getOrderFromGoogleSheets(orderId);
  if (!order) {
    console.warn(`[email] order ${orderId} was not found for approved notifications.`);
    return;
  }

  const results = await sendOrderApprovedNotifications(order);
  logEmailNotificationResults("approved", orderId, results);
}

async function notifyOrderDeclined(orderId: string) {
  const order = await getOrderFromGoogleSheets(orderId);
  if (!order) {
    console.warn(`[email] order ${orderId} was not found for declined notifications.`);
    return;
  }

  const results = await sendOrderDeclinedNotifications(order);
  logEmailNotificationResults("declined", orderId, results);
}

async function notifyOrderPaymentFailed(orderId: string) {
  const order = await getOrderFromGoogleSheets(orderId);
  if (!order) {
    console.warn(`[email] order ${orderId} was not found for payment failed notifications.`);
    return;
  }

  const results = await sendOrderPaymentFailedNotifications(order);
  logEmailNotificationResults("payment failed", orderId, results);
}

function readStripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publicSiteUrl = (process.env.PUBLIC_SITE_URL?.trim() || "http://localhost:8080").replace(
    /\/$/,
    "",
  );

  if (!secretKey) return null;

  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    publicSiteUrl,
  };
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey);
}

function toCheckoutLineItems(
  order: DashboardOrder,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const cartLines = order.cart.map((line) => ({
    quantity: line.quantity,
    price_data: {
      currency: "usd",
      unit_amount: dollarsToCents(line.unitPrice),
      product_data: {
        name: line.item,
        description: line.selections.join(", ") || undefined,
      },
    },
  }));

  if (order.totals.deliveryFee > 0) {
    cartLines.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: dollarsToCents(order.totals.deliveryFee),
        product_data: {
          name: "Delivery fee",
          description: undefined,
        },
      },
    });
  }

  return cartLines;
}

async function readLatestChargeReceiptUrl(stripe: Stripe, paymentIntent: Stripe.PaymentIntent) {
  const latestCharge = paymentIntent.latest_charge;

  if (!latestCharge) return "";

  if (typeof latestCharge === "string") {
    const charge = await stripe.charges.retrieve(latestCharge);
    return charge.receipt_url ?? "";
  }

  return latestCharge.receipt_url ?? "";
}

function toStripeId(value: string | Stripe.PaymentIntent | null) {
  if (!value) return "";
  return typeof value === "string" ? value : value.id;
}

function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

function centsToDollars(value: number) {
  return value / 100;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
