import "@tanstack/react-start/server-only";

import { Resend } from "resend";

import { BUSINESS, formatPrice } from "@/data/menu";
import { listOrdersFromGoogleSheets } from "./google-sheets.server";
import type { DashboardOrder } from "./order-store";

const REVIEW_REMINDER_INTERVAL_MS = 12 * 60 * 60 * 1000;
const NO_REPLY_NOTICE = "Please do not reply to this email. This inbox is not monitored.";

type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo: string | undefined;
  cookEmail: string | undefined;
  websiteOwnerEmail: string | undefined;
};

type EmailSendResult = { sent: true; id: string } | { sent: false; reason: string };

type NotificationResults = Record<string, EmailSendResult>;

type WebsiteIssueNotification = {
  subject: string;
  message: string;
  requestUrl?: string;
  stack?: string;
};

type CustomerOrderAccessCodeEmail = {
  email: string;
  code: string;
  expiresAt: string;
};

export async function sendOrderSubmittedNotifications(
  order: DashboardOrder,
): Promise<NotificationResults> {
  const [customer, cook] = await Promise.all([
    sendCustomerOrderReceivedEmail(order),
    sendCookNewOrderEmail(order),
  ]);

  return { customer, cook };
}

export async function sendOrderApprovedNotifications(
  order: DashboardOrder,
): Promise<NotificationResults> {
  const [customer, cook] = await Promise.all([
    sendCustomerOrderApprovedEmail(order),
    sendCookOrderApprovedEmail(order),
  ]);

  return { customer, cook };
}

export async function sendOrderDeclinedNotifications(
  order: DashboardOrder,
): Promise<NotificationResults> {
  const [customer, cook] = await Promise.all([
    sendCustomerOrderDeclinedEmail(order),
    sendCookOrderDeclinedEmail(order),
  ]);

  return { customer, cook };
}

export async function sendOrderPaymentFailedNotifications(
  order: DashboardOrder,
): Promise<NotificationResults> {
  const customer = await sendCustomerOrderPaymentFailedEmail(order);

  return { customer };
}

export async function handleOrderReminderRequest(request: Request) {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authResult = authorizeReminderRequest(request);
  if (!authResult.authorized) {
    return jsonResponse({ error: authResult.reason }, authResult.status);
  }

  const ordersResult = await listOrdersFromGoogleSheets();
  if (!ordersResult.loadedFromGoogleSheets) {
    return jsonResponse({ error: ordersResult.reason }, 500);
  }

  const dueOrders = ordersResult.orders
    .map((order) => ({
      order,
      reminderCount: getDueReminderCount(order),
    }))
    .filter(
      (entry): entry is { order: DashboardOrder; reminderCount: number } =>
        entry.reminderCount !== null,
    );

  const results = await Promise.all(
    dueOrders.map(async ({ order, reminderCount }) => ({
      orderId: order.id,
      result: await sendCookReviewReminderEmail(order, reminderCount),
    })),
  );

  return jsonResponse({
    checked: ordersResult.orders.length,
    due: dueOrders.length,
    sent: results.filter(({ result }) => result.sent).length,
    failed: results
      .filter(({ result }) => !result.sent)
      .map(({ orderId, result }) => ({
        orderId,
        reason: result.sent ? "" : result.reason,
      })),
  });
}

export function logEmailNotificationResults(
  eventName: string,
  orderId: string,
  results: NotificationResults,
) {
  Object.entries(results).forEach(([recipient, result]) => {
    if (!result.sent) {
      console.warn(
        `[email] ${eventName} notification for ${recipient} on order ${orderId} was not sent: ${result.reason}`,
      );
    }
  });
}

export async function sendWebsiteIssueNotification({
  subject,
  message,
  requestUrl,
  stack,
}: WebsiteIssueNotification) {
  const config = readEmailConfig();
  if (!config.websiteOwnerEmail) {
    return {
      sent: false,
      reason: "WEBSITE_OWNER_EMAIL is not configured.",
    } satisfies EmailSendResult;
  }

  const details = [
    ["Message", message],
    ["URL", requestUrl ?? ""],
    ["Time", new Date().toISOString()],
  ].filter(([, value]) => value);

  return sendEmail({
    to: config.websiteOwnerEmail,
    subject: `Blue Nile website alert: ${subject}`,
    text: [
      `Blue Nile website alert: ${subject}`,
      "",
      message,
      requestUrl ? `URL: ${requestUrl}` : "",
      `Time: ${new Date().toISOString()}`,
      stack ? `\nStack:\n${stack}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: emailLayout(
      "Website alert",
      [escapeHtml(message)],
      [
        detailsTable(details as [string, string][]),
        stack
          ? `<h2 style="font-size:16px;margin:24px 0 8px;">Stack</h2><pre style="white-space:pre-wrap;background:#f7f4ee;border:1px solid #e5ded0;padding:12px;font-size:12px;line-height:1.4;">${escapeHtml(
              stack,
            )}</pre>`
          : "",
      ].join(""),
    ),
    idempotencyKey: `website-issue/${Date.now()}/${Math.random().toString(36).slice(2)}`,
  });
}

export async function sendCustomerOrderAccessCodeEmail({
  email,
  code,
  expiresAt,
}: CustomerOrderAccessCodeEmail) {
  const expiresAtText = formatDateTime(expiresAt);

  return sendEmail({
    to: email,
    subject: "Your Blue Nile order verification code",
    text: [
      "Use this verification code to view your Blue Nile catering orders:",
      "",
      code,
      "",
      `This code expires at ${expiresAtText}.`,
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
    html: emailLayout(
      "Your order verification code",
      [
        "Use this verification code to view your Blue Nile catering orders:",
        `<strong style="display:inline-block;font-size:28px;letter-spacing:6px;margin:6px 0;color:#172217;">${escapeHtml(
          code,
        )}</strong>`,
        `This code expires at ${escapeHtml(expiresAtText)}.`,
        "If you did not request this code, you can ignore this email.",
      ],
      "",
    ),
    idempotencyKey: `customer-orders-code/${email}/${Date.now()}`,
  });
}

function sendCustomerOrderReceivedEmail(order: DashboardOrder) {
  return sendEmail({
    to: order.customer.email,
    subject: `We received your Blue Nile catering order ${order.id}`,
    text: [
      `Hi ${order.customer.name},`,
      "",
      `Thank you for your catering order with ${BUSINESS.name}. We received your request and your card authorization, but the order is not guaranteed yet.`,
      "The kitchen will review your event details and confirm or decline the order. Your card will only be charged if the order is approved.",
      "",
      orderSummaryText(order),
      "",
      `Questions or changes? Call ${BUSINESS.phone}.`,
    ].join("\n"),
    html: emailLayout(
      "Thank you for your order",
      [
        `Hi ${escapeHtml(order.customer.name)},`,
        `We received your catering request and your card authorization, but the order is not guaranteed yet.`,
        `The kitchen will review your event details and confirm or decline the order. Your card will only be charged if the order is approved.`,
      ],
      orderDetailsHtml(order),
    ),
    idempotencyKey: `order-submitted/customer/${order.id}`,
  });
}

function sendCookNewOrderEmail(order: DashboardOrder) {
  return sendCookEmail({
    subject: `New catering order needs review: ${order.id}`,
    text: [
      `A new catering order needs approval or decline: ${order.id}`,
      "",
      orderSummaryText(order),
      "",
      customerText(order),
      "",
      itemSummaryText(order),
      "",
      dashboardText(),
    ].join("\n"),
    html: emailLayout(
      "New order needs review",
      [
        `A new catering order needs approval or decline.`,
        `Open the kitchen dashboard, review the details, then confirm and charge or decline and release the authorization.`,
      ],
      [orderDetailsHtml(order), customerHtml(order), itemSummaryHtml(order), dashboardHtml()].join(
        "",
      ),
    ),
    idempotencyKey: `order-submitted/cook/${order.id}`,
  });
}

function sendCustomerOrderPaymentFailedEmail(order: DashboardOrder) {
  return sendEmail({
    to: order.customer.email,
    subject: `Payment could not be authorized for order ${order.id}`,
    text: [
      `Hi ${order.customer.name},`,
      "",
      `We could not authorize the payment for your catering request with ${BUSINESS.name}.`,
      "The kitchen will not receive this order for review unless payment is successfully authorized.",
      "",
      "You can submit the order again with another payment method or call us for help.",
      "",
      `Questions? Call ${BUSINESS.phone}.`,
    ].join("\n"),
    html: emailLayout(
      "Payment could not be authorized",
      [
        `Hi ${escapeHtml(order.customer.name)},`,
        `We could not authorize the payment for your catering request with ${BUSINESS.name}.`,
        `The kitchen will not receive this order for review unless payment is successfully authorized.`,
        `You can submit the order again with another payment method or call us for help.`,
      ],
      orderDetailsHtml(order),
    ),
    idempotencyKey: `order-payment-failed/customer/${order.id}`,
  });
}

function sendCustomerOrderApprovedEmail(order: DashboardOrder) {
  const receiptLine = order.payment.stripeReceiptUrl
    ? `Receipt: ${order.payment.stripeReceiptUrl}`
    : "";

  return sendEmail({
    to: order.customer.email,
    subject: `Your Blue Nile catering order is approved: ${order.id}`,
    text: [
      `Hi ${order.customer.name},`,
      "",
      `Your catering order with ${BUSINESS.name} has been approved. The authorized payment has been captured.`,
      "",
      orderSummaryText(order),
      receiptLine,
      "",
      `Questions or changes? Call ${BUSINESS.phone}.`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: emailLayout(
      "Your order is approved",
      [
        `Hi ${escapeHtml(order.customer.name)},`,
        `Your catering order has been approved. The authorized payment has been captured.`,
      ],
      [
        orderDetailsHtml(order),
        order.payment.stripeReceiptUrl
          ? `<p><a href="${escapeAttribute(order.payment.stripeReceiptUrl)}">View receipt</a></p>`
          : "",
      ].join(""),
    ),
    idempotencyKey: `order-approved/customer/${order.id}`,
  });
}

function sendCookOrderApprovedEmail(order: DashboardOrder) {
  return sendCookEmail({
    subject: `Order confirmed and charged: ${order.id}`,
    text: [
      `Order ${order.id} has been confirmed and charged.`,
      "",
      orderSummaryText(order),
      "",
      customerText(order),
    ].join("\n"),
    html: emailLayout(
      "Order confirmed and charged",
      [`Order ${escapeHtml(order.id)} has been confirmed and the payment has been captured.`],
      [orderDetailsHtml(order), customerHtml(order)].join(""),
    ),
    idempotencyKey: `order-approved/cook/${order.id}`,
  });
}

function sendCustomerOrderDeclinedEmail(order: DashboardOrder) {
  return sendEmail({
    to: order.customer.email,
    subject: `Your Blue Nile catering order was declined: ${order.id}`,
    text: [
      `Hi ${order.customer.name},`,
      "",
      `We are sorry, but ${BUSINESS.name} cannot accept this catering order. Your card authorization has been released and you will not be charged for this order.`,
      "",
      orderSummaryText(order),
      "",
      `If you would like to adjust the order or choose another time, call ${BUSINESS.phone}.`,
    ].join("\n"),
    html: emailLayout(
      "Your order was declined",
      [
        `Hi ${escapeHtml(order.customer.name)},`,
        `We are sorry, but ${BUSINESS.name} cannot accept this catering order.`,
        `Your card authorization has been released and you will not be charged for this order.`,
      ],
      orderDetailsHtml(order),
    ),
    idempotencyKey: `order-declined/customer/${order.id}`,
  });
}

function sendCookOrderDeclinedEmail(order: DashboardOrder) {
  return sendCookEmail({
    subject: `Order declined and authorization released: ${order.id}`,
    text: [
      `Order ${order.id} has been declined and the card authorization has been released.`,
      "",
      orderSummaryText(order),
      "",
      customerText(order),
    ].join("\n"),
    html: emailLayout(
      "Order declined",
      [
        `Order ${escapeHtml(order.id)} has been declined and the card authorization has been released.`,
      ],
      [orderDetailsHtml(order), customerHtml(order)].join(""),
    ),
    idempotencyKey: `order-declined/cook/${order.id}`,
  });
}

function sendCookReviewReminderEmail(order: DashboardOrder, reminderCount: number) {
  const hoursWaiting = reminderCount * 12;

  return sendCookEmail({
    subject: `Reminder: order ${order.id} still needs review`,
    text: [
      `Order ${order.id} has been waiting ${hoursWaiting}+ hours for approval or decline.`,
      "",
      orderSummaryText(order),
      "",
      customerText(order),
      "",
      dashboardText(),
    ].join("\n"),
    html: emailLayout(
      "Order review reminder",
      [
        `Order ${escapeHtml(order.id)} has been waiting ${hoursWaiting}+ hours for approval or decline.`,
        `Please confirm and charge it or decline and release the authorization.`,
      ],
      [orderDetailsHtml(order), customerHtml(order), dashboardHtml()].join(""),
    ),
    idempotencyKey: `order-reminder/cook/${order.id}/${reminderCount}`,
  });
}

async function sendCookEmail({
  subject,
  text,
  html,
  idempotencyKey,
}: {
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}) {
  const config = readEmailConfig();
  if (!config.cookEmail) {
    return {
      sent: false,
      reason: "COOK_ORDER_EMAIL is not configured.",
    } satisfies EmailSendResult;
  }

  return sendEmail({
    to: config.cookEmail,
    subject,
    text,
    html,
    idempotencyKey,
  });
}

async function sendEmail({
  to,
  subject,
  text,
  html,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}): Promise<EmailSendResult> {
  const config = readEmailConfig();

  if (!config.apiKey) {
    return { sent: false, reason: "RESEND_API_KEY is not configured." };
  }
  if (!config.from) {
    return { sent: false, reason: "RESEND_FROM_EMAIL is not configured." };
  }
  if (!to) {
    return { sent: false, reason: "Recipient email is missing." };
  }

  try {
    const resend = new Resend(config.apiKey);
    const { data, error } = await resend.emails.send(
      {
        from: config.from,
        to,
        subject,
        text: withNoReplyNoticeText(text),
        html,
        replyTo: config.replyTo,
      },
      { idempotencyKey },
    );

    if (error) {
      return {
        sent: false,
        reason: error.message,
      };
    }

    return { sent: true, id: data?.id ?? "" };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Unknown Resend error.",
    };
  }
}

function readEmailConfig(): EmailConfig {
  const cookEmail = process.env.COOK_ORDER_EMAIL?.trim() || undefined;

  return {
    apiKey: process.env.RESEND_API_KEY?.trim() ?? "",
    from: process.env.RESEND_FROM_EMAIL?.trim() ?? "",
    replyTo: process.env.RESEND_REPLY_TO_EMAIL?.trim() || cookEmail,
    cookEmail,
    websiteOwnerEmail: process.env.WEBSITE_OWNER_EMAIL?.trim() || undefined,
  };
}

function authorizeReminderRequest(request: Request) {
  const secret = process.env.ORDER_REMINDER_SECRET?.trim();
  if (!secret) {
    return {
      authorized: false,
      status: 500,
      reason: "ORDER_REMINDER_SECRET is not configured.",
    } as const;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const queryToken = new URL(request.url).searchParams.get("secret")?.trim();

  if (bearerToken === secret || queryToken === secret) {
    return { authorized: true } as const;
  }

  return {
    authorized: false,
    status: 401,
    reason: "Unauthorized.",
  } as const;
}

function getDueReminderCount(order: DashboardOrder) {
  if (order.status !== "new") return null;
  if (order.payment.status !== "authorized") return null;

  const submittedAt = new Date(order.submittedAt).getTime();
  if (!Number.isFinite(submittedAt)) return null;

  const elapsedMs = Date.now() - submittedAt;
  if (elapsedMs < REVIEW_REMINDER_INTERVAL_MS) return null;

  return Math.floor(elapsedMs / REVIEW_REMINDER_INTERVAL_MS);
}

function orderSummaryText(order: DashboardOrder) {
  return [
    `Order ID: ${order.id}`,
    `Event: ${formatDate(order.event.date)} at ${formatTime(order.event.time)}`,
    `Delivery: ${formatAddress(order)}`,
    `Guests: ${order.event.numberOfPeople}`,
    `Paper supplies: ${order.event.paperSupplies ? "yes" : "no"}`,
    `Individually wrapped: ${order.event.individuallyWrapped ? "yes" : "no"}`,
    `Estimated total: ${formatPrice(order.totals.estimatedTotal)}`,
  ].join("\n");
}

function customerText(order: DashboardOrder) {
  return [
    `Customer: ${order.customer.name}`,
    `Phone: ${order.customer.phone}`,
    `Email: ${order.customer.email}`,
  ].join("\n");
}

function itemSummaryText(order: DashboardOrder) {
  return order.cart
    .map((line) => {
      const selections = line.selections.length > 0 ? ` (${line.selections.join(", ")})` : "";
      const notes = line.notes ? ` - ${line.notes}` : "";
      return `${line.quantity} x ${line.item}${selections}${notes}`;
    })
    .join("\n");
}

function orderDetailsHtml(order: DashboardOrder) {
  return detailsTable([
    ["Order ID", order.id],
    ["Event", `${formatDate(order.event.date)} at ${formatTime(order.event.time)}`],
    ["Delivery", formatAddress(order)],
    ["Guests", String(order.event.numberOfPeople)],
    ["Paper supplies", order.event.paperSupplies ? "yes" : "no"],
    ["Individually wrapped", order.event.individuallyWrapped ? "yes" : "no"],
    ["Estimated total", formatPrice(order.totals.estimatedTotal)],
  ]);
}

function customerHtml(order: DashboardOrder) {
  return detailsTable([
    ["Customer", order.customer.name],
    ["Phone", order.customer.phone],
    ["Email", order.customer.email],
  ]);
}

function itemSummaryHtml(order: DashboardOrder) {
  const items = order.cart
    .map((line) => {
      const selections =
        line.selections.length > 0
          ? `<div style="color:#5f6b5f;font-size:13px;">${escapeHtml(line.selections.join(", "))}</div>`
          : "";
      const notes = line.notes
        ? `<div style="color:#5f6b5f;font-size:13px;">${escapeHtml(line.notes)}</div>`
        : "";

      return `<li style="margin-bottom:10px;"><strong>${line.quantity} x ${escapeHtml(
        line.item,
      )}</strong>${selections}${notes}</li>`;
    })
    .join("");

  return `<h2 style="font-size:16px;margin:24px 0 8px;">Items</h2><ul style="padding-left:20px;margin:0;">${items}</ul>`;
}

function detailsTable(rows: [string, string][]) {
  const tableRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#5f6b5f;vertical-align:top;">${escapeHtml(
            label,
          )}</td>
          <td style="padding:6px 0;color:#172217;font-weight:600;vertical-align:top;">${escapeHtml(
            value,
          )}</td>
        </tr>`,
    )
    .join("");

  return `<table style="border-collapse:collapse;width:100%;margin-top:18px;">${tableRows}</table>`;
}

function emailLayout(title: string, paragraphs: string[], bodyHtml: string) {
  return `
    <div style="margin:0;background:#f7f4ee;padding:24px;font-family:Arial,sans-serif;color:#172217;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5ded0;padding:28px;">
        <p style="margin:0 0 8px;color:#6d2f1f;font-weight:700;">${escapeHtml(BUSINESS.name)}</p>
        <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#172217;">${escapeHtml(
          title,
        )}</h1>
        ${paragraphs
          .map((paragraph) => `<p style="margin:0 0 12px;line-height:1.55;">${paragraph}</p>`)
          .join("")}
        ${bodyHtml}
        <p style="margin:24px 0 0;color:#5f6b5f;font-size:13px;">${escapeHtml(
          BUSINESS.phone,
        )} - ${escapeHtml(BUSINESS.location)}</p>
        <p style="margin:10px 0 0;color:#7a6f62;font-size:12px;line-height:1.45;">${escapeHtml(
          NO_REPLY_NOTICE,
        )}</p>
      </div>
    </div>`;
}

function withNoReplyNoticeText(text: string) {
  return [text.trimEnd(), "", NO_REPLY_NOTICE].join("\n");
}

function dashboardText() {
  const url = dashboardUrl();
  return url ? `Dashboard: ${url}` : "Open the kitchen dashboard to review this order.";
}

function dashboardHtml() {
  const url = dashboardUrl();
  if (!url) return "";

  return `<p style="margin:24px 0 0;"><a href="${escapeAttribute(
    url,
  )}" style="display:inline-block;background:#6d2f1f;color:#ffffff;padding:10px 14px;text-decoration:none;font-weight:700;">Open dashboard</a></p>`;
}

function dashboardUrl() {
  const baseUrl = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/dashboard` : "";
}

function formatAddress(order: DashboardOrder) {
  return [order.event.deliveryAddress, order.event.deliveryAddressLine2, order.event.zipCode]
    .filter(Boolean)
    .join(", ");
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hour, minute));
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
