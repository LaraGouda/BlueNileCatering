import "@tanstack/react-start/server-only";

import {
  isDashboardOrderStatus,
  isDashboardPaymentStatus,
  type DashboardOrder,
  type DashboardOrderLine,
  type DashboardOrderStatus,
  type DashboardPaymentStatus,
} from "./order-store";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const ORDERS_RANGE = "Orders!A:X";
const ORDER_ITEMS_RANGE = "OrderItems!A:H";
const BUSINESS_NAME = "Blue Nile Mediterranean Grill";

const ORDER_HEADERS = [
  "orderId",
  "submittedAt",
  "updatedAt",
  "status",
  "paymentStatus",
  "customerName",
  "customerPhone",
  "customerEmail",
  "eventDate",
  "eventTime",
  "deliveryAddress",
  "deliveryAddressLine2",
  "zipCode",
  "numberOfPeople",
  "individuallyWrapped",
  "specialInstructions",
  "subtotal",
  "deliveryFee",
  "tax",
  "estimatedTotal",
  "finalTotal",
  "stripeCheckoutSessionId",
  "stripePaymentIntentId",
  "stripeReceiptUrl",
] as const;

const ORDER_ITEM_HEADERS = [
  "orderId",
  "lineNumber",
  "item",
  "quantity",
  "selections",
  "notes",
  "unitPrice",
  "lineTotal",
] as const;

type SheetValue = string | number | boolean;

export type GoogleSheetsSubmitResult =
  { savedToGoogleSheets: true } | { savedToGoogleSheets: false; reason: string };

export type GoogleSheetsOrdersResult =
  | { loadedFromGoogleSheets: true; orders: DashboardOrder[] }
  | { loadedFromGoogleSheets: false; orders: []; reason: string };

export type GoogleSheetsMutationResult =
  { updatedGoogleSheets: true } | { updatedGoogleSheets: false; reason: string };

export type GoogleSheetsPaymentUpdate = {
  orderId: string;
  paymentStatus: DashboardPaymentStatus;
  orderStatus?: DashboardOrderStatus;
  tax?: number;
  finalTotal?: number | null;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeReceiptUrl?: string;
};

type GoogleSheetsConfig = {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
};

type GoogleSheetsClient = {
  config: GoogleSheetsConfig;
  accessToken: string;
};

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
};

type OrderSheetRow = {
  rowNumber: number;
  values: SheetValue[];
};

export async function appendOrderToGoogleSheets(
  order: DashboardOrder,
): Promise<GoogleSheetsSubmitResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      savedToGoogleSheets: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  await appendSheetValues(
    client.config.spreadsheetId,
    ORDERS_RANGE,
    [toOrderRow(order)],
    client.accessToken,
  );

  if (order.cart.length > 0) {
    await appendSheetValues(
      client.config.spreadsheetId,
      ORDER_ITEMS_RANGE,
      toOrderItemRows(order),
      client.accessToken,
    );
  }

  return { savedToGoogleSheets: true };
}

export async function listOrdersFromGoogleSheets(): Promise<GoogleSheetsOrdersResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      loadedFromGoogleSheets: false,
      orders: [],
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  const [orderValues, orderItemValues] = await Promise.all([
    readSheetValues(client.config.spreadsheetId, ORDERS_RANGE, client.accessToken),
    readSheetValues(client.config.spreadsheetId, ORDER_ITEMS_RANGE, client.accessToken),
  ]);

  const [orderHeaders = [], ...orderRows] = orderValues;
  const [orderItemHeaders = [], ...orderItemRows] = orderItemValues;
  assertHeaders("Orders", orderHeaders, ORDER_HEADERS);
  assertHeaders("OrderItems", orderItemHeaders, ORDER_ITEM_HEADERS);

  const itemRowsByOrderId = groupOrderItemRows(orderItemRows);
  const orders = orderRows
    .map((row) => toDashboardOrder(row, itemRowsByOrderId.get(cell(row, 0)) ?? []))
    .filter((order): order is DashboardOrder => order !== null)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  return { loadedFromGoogleSheets: true, orders };
}

export async function updateOrderStatusInGoogleSheets(
  orderId: string,
  status: DashboardOrderStatus,
): Promise<GoogleSheetsMutationResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      updatedGoogleSheets: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  const orderRow = await findOrderRow(client, orderId);
  if (!orderRow) {
    return {
      updatedGoogleSheets: false,
      reason: `Order ${orderId} was not found in Google Sheets.`,
    };
  }

  const nextRow = normalizeRow(orderRow.values, ORDER_HEADERS.length);
  nextRow[2] = new Date().toISOString();
  nextRow[3] = status;

  await updateSheetValues(
    client.config.spreadsheetId,
    `Orders!A${orderRow.rowNumber}:X${orderRow.rowNumber}`,
    [nextRow],
    client.accessToken,
  );

  return { updatedGoogleSheets: true };
}

export async function updateOrderPaymentInGoogleSheets(
  update: GoogleSheetsPaymentUpdate,
): Promise<GoogleSheetsMutationResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      updatedGoogleSheets: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  const orderRow = await findOrderRow(client, update.orderId);
  if (!orderRow) {
    return {
      updatedGoogleSheets: false,
      reason: `Order ${update.orderId} was not found in Google Sheets.`,
    };
  }

  const nextRow = normalizeRow(orderRow.values, ORDER_HEADERS.length);
  nextRow[2] = new Date().toISOString();
  if (update.orderStatus !== undefined) nextRow[3] = update.orderStatus;
  nextRow[4] = update.paymentStatus;

  if (update.tax !== undefined) nextRow[18] = update.tax;
  if (update.finalTotal !== undefined) nextRow[20] = update.finalTotal ?? "";
  if (update.stripeCheckoutSessionId !== undefined) {
    nextRow[21] = update.stripeCheckoutSessionId;
  }
  if (update.stripePaymentIntentId !== undefined) {
    nextRow[22] = update.stripePaymentIntentId;
  }
  if (update.stripeReceiptUrl !== undefined) {
    nextRow[23] = update.stripeReceiptUrl;
  }

  await updateSheetValues(
    client.config.spreadsheetId,
    `Orders!A${orderRow.rowNumber}:X${orderRow.rowNumber}`,
    [nextRow],
    client.accessToken,
  );

  return { updatedGoogleSheets: true };
}

async function getGoogleSheetsClient(): Promise<GoogleSheetsClient | null> {
  const config = readGoogleSheetsConfig();
  if (!config) return null;

  return {
    config,
    accessToken: await getAccessToken(config),
  };
}

function readGoogleSheetsConfig(): GoogleSheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) return null;

  const jsonCredentials = readServiceAccountJson();
  const clientEmail =
    jsonCredentials?.client_email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(
    jsonCredentials?.private_key ?? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  );

  if (!clientEmail || !privateKey) return null;

  return {
    spreadsheetId,
    clientEmail,
    privateKey,
  };
}

function readServiceAccountJson(): ServiceAccountJson | null {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawJson) return null;

  try {
    return JSON.parse(rawJson) as ServiceAccountJson;
  } catch {
    return null;
  }
}

function normalizePrivateKey(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

async function getAccessToken(config: GoogleSheetsConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claimSet = {
    iss: config.clientEmail,
    scope: SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const { createSign } = await import("node:crypto");
  const signature = createSign("RSA-SHA256")
    .update(unsignedJwt)
    .end()
    .sign(config.privateKey, "base64url");
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token request failed: ${await readGoogleError(response)}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Google did not return a token.");
  }

  return payload.access_token;
}

async function readSheetValues(
  spreadsheetId: string,
  range: string,
  accessToken: string,
): Promise<SheetValue[][]> {
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      range,
    )}?majorDimension=ROWS`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets read failed: ${await readGoogleError(response)}`);
  }

  const payload = (await response.json()) as { values?: SheetValue[][] };
  return payload.values ?? [];
}

async function appendSheetValues(
  spreadsheetId: string,
  range: string,
  values: SheetValue[][],
  accessToken: string,
) {
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      range,
    )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        majorDimension: "ROWS",
        values,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets append failed: ${await readGoogleError(response)}`);
  }
}

async function updateSheetValues(
  spreadsheetId: string,
  range: string,
  values: SheetValue[][],
  accessToken: string,
) {
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        majorDimension: "ROWS",
        values,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets update failed: ${await readGoogleError(response)}`);
  }
}

async function findOrderRow(client: GoogleSheetsClient, orderId: string) {
  const values = await readSheetValues(
    client.config.spreadsheetId,
    ORDERS_RANGE,
    client.accessToken,
  );
  const [headers = [], ...rows] = values;
  assertHeaders("Orders", headers, ORDER_HEADERS);

  const dataIndex = rows.findIndex((row) => cell(row, 0) === orderId);
  if (dataIndex === -1) return null;

  return {
    rowNumber: dataIndex + 2,
    values: rows[dataIndex],
  } satisfies OrderSheetRow;
}

function toOrderRow(order: DashboardOrder): SheetValue[] {
  return [
    order.id,
    order.submittedAt,
    new Date().toISOString(),
    order.status,
    order.payment.status,
    order.customer.name,
    order.customer.phone,
    order.customer.email,
    order.event.date,
    order.event.time,
    order.event.deliveryAddress,
    order.event.deliveryAddressLine2,
    order.event.zipCode,
    order.event.numberOfPeople,
    order.event.individuallyWrapped ? "yes" : "no",
    order.event.specialInstructions,
    order.totals.subtotal,
    order.totals.deliveryFee,
    order.totals.tax,
    order.totals.estimatedTotal,
    order.totals.finalTotal ?? "",
    order.payment.stripeCheckoutSessionId,
    order.payment.stripePaymentIntentId,
    order.payment.stripeReceiptUrl,
  ];
}

function toOrderItemRows(order: DashboardOrder): SheetValue[][] {
  return order.cart.map((line, index) => [
    order.id,
    index + 1,
    line.item,
    line.quantity,
    line.selections.join(" | "),
    line.notes,
    line.unitPrice,
    line.lineTotal,
  ]);
}

function groupOrderItemRows(rows: SheetValue[][]) {
  const itemRowsByOrderId = new Map<string, DashboardOrderLine[]>();

  rows.forEach((row) => {
    const orderId = cell(row, 0);
    if (!orderId) return;

    const line: DashboardOrderLine = {
      item: cell(row, 2),
      quantity: numberCell(row, 3),
      selections: cell(row, 4)
        .split("|")
        .map((selection) => selection.trim())
        .filter(Boolean),
      notes: cell(row, 5),
      unitPrice: numberCell(row, 6),
      lineTotal: numberCell(row, 7),
    };

    const existing = itemRowsByOrderId.get(orderId) ?? [];
    itemRowsByOrderId.set(orderId, [...existing, line]);
  });

  return itemRowsByOrderId;
}

function toDashboardOrder(row: SheetValue[], cart: DashboardOrderLine[]): DashboardOrder | null {
  const id = cell(row, 0);
  if (!id) return null;

  const status = parseOrderStatus(cell(row, 3));
  const paymentStatus = parsePaymentStatus(cell(row, 4));

  return {
    id,
    submittedAt: cell(row, 1),
    status,
    payment: {
      status: paymentStatus,
      stripeCheckoutSessionId: cell(row, 21),
      stripePaymentIntentId: cell(row, 22),
      stripeReceiptUrl: cell(row, 23),
    },
    business: BUSINESS_NAME,
    customer: {
      name: cell(row, 5),
      phone: cell(row, 6),
      email: cell(row, 7),
    },
    event: {
      date: cell(row, 8),
      time: cell(row, 9),
      deliveryAddress: cell(row, 10),
      deliveryAddressLine2: cell(row, 11),
      zipCode: cell(row, 12),
      numberOfPeople: numberCell(row, 13),
      individuallyWrapped: cell(row, 14).toLowerCase() === "yes",
      specialInstructions: cell(row, 15),
    },
    cart,
    totals: {
      subtotal: numberCell(row, 16),
      deliveryFee: numberCell(row, 17),
      tax: numberCell(row, 18),
      estimatedTotal: numberCell(row, 19),
      finalTotal: nullableNumberCell(row, 20),
    },
  };
}

function parseOrderStatus(value: string): DashboardOrderStatus {
  return isDashboardOrderStatus(value) ? value : "new";
}

function parsePaymentStatus(value: string): DashboardPaymentStatus {
  return isDashboardPaymentStatus(value) ? value : "unpaid";
}

function assertHeaders(
  sheetName: string,
  actualHeaders: SheetValue[],
  expectedHeaders: readonly string[],
) {
  const missingOrMoved = expectedHeaders.filter(
    (expected, index) => cell(actualHeaders, index) !== expected,
  );

  if (missingOrMoved.length > 0) {
    throw new Error(
      `${sheetName} sheet headers do not match the app schema. Check these columns: ${missingOrMoved.join(
        ", ",
      )}.`,
    );
  }
}

function normalizeRow(row: SheetValue[], length: number) {
  return Array.from({ length }, (_, index) => row[index] ?? "");
}

function cell(row: SheetValue[], index: number) {
  const value = row[index];
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberCell(row: SheetValue[], index: number) {
  const value = Number(cell(row, index));
  return Number.isFinite(value) ? value : 0;
}

function nullableNumberCell(row: SheetValue[], index: number) {
  const value = cell(row, index);
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function readGoogleError(response: Response) {
  const text = await response.text();

  try {
    const payload = JSON.parse(text) as {
      error?: {
        message?: string;
      };
      error_description?: string;
    };
    return payload.error?.message ?? payload.error_description ?? text;
  } catch {
    return text;
  }
}
