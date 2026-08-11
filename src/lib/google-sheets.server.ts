import "@tanstack/react-start/server-only";

import {
  normalizeCustomerEmail,
  toCustomerOrderView,
  type CustomerOrderView,
} from "./customer-orders";
import {
  isDashboardOrderStatus,
  isDashboardPaymentStatus,
  type DashboardOrder,
  type DashboardOrderLine,
  type DashboardOrderStatus,
  type DashboardPaymentStatus,
} from "./order-store";
import {
  DEFAULT_SERVICE_STATUS,
  getServiceSuspensionMessage,
  isServiceMessageMode,
  withServiceStatusDefaults,
  type ServiceStatus,
} from "./service-status";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const ORDERS_RANGE = "Orders!A:Y";
const ORDER_ITEMS_RANGE = "OrderItems!A:H";
const SERVICE_STATUS_SHEET = "ServiceStatus";
const SERVICE_STATUS_RANGE = `${SERVICE_STATUS_SHEET}!A:E`;
const CUSTOMER_ACCESS_CODES_SHEET = "CustomerAccessCodes";
const CUSTOMER_ACCESS_CODES_RANGE = `${CUSTOMER_ACCESS_CODES_SHEET}!A:G`;
const BUSINESS_NAME = "Blue Nile Mediterranean Grill";
const PAPER_SUPPLIES_ITEM = "Paper Plates, Serving Spoons, Forks, Napkins";
const CUSTOMER_ACCESS_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CUSTOMER_ACCESS_CODE_ATTEMPTS = 5;
const DATABASE_TEXT_COLOR = { red: 0, green: 0, blue: 0 };
const DATABASE_ROW_WHITE = { red: 1, green: 1, blue: 1 };
const DATABASE_ROW_LIGHT_BLUE = { red: 0.9, green: 0.96, blue: 1 };
const SHEET_FORMULA_PREFIX = /^[=+\-@]/;

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
  "paperSupplies",
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

const DATABASE_SHEET_FORMATS = [
  { title: "Orders", range: ORDERS_RANGE, columnCount: ORDER_HEADERS.length },
  { title: "OrderItems", range: ORDER_ITEMS_RANGE, columnCount: ORDER_ITEM_HEADERS.length },
] as const;

const SERVICE_STATUS_HEADERS = [
  "suspended",
  "messageMode",
  "customMessage",
  "resumeDate",
  "updatedAt",
] as const;

const CUSTOMER_ACCESS_CODE_HEADERS = [
  "email",
  "codeHash",
  "expiresAt",
  "createdAt",
  "usedAt",
  "attemptCount",
  "lastAttemptAt",
] as const;

type SheetValue = string | number | boolean;

export type GoogleSheetsSubmitResult =
  | { savedToGoogleSheets: true }
  | {
      savedToGoogleSheets: false;
      reason: string;
      serviceSuspended?: boolean;
      serviceStatus?: ServiceStatus;
    };

export type GoogleSheetsOrdersResult =
  | { loadedFromGoogleSheets: true; orders: DashboardOrder[] }
  | { loadedFromGoogleSheets: false; orders: []; reason: string };

export type GoogleSheetsMutationResult =
  { updatedGoogleSheets: true } | { updatedGoogleSheets: false; reason: string };

export type GoogleSheetsServiceStatusResult =
  | { loadedFromGoogleSheets: true; status: ServiceStatus }
  | { loadedFromGoogleSheets: false; status: ServiceStatus; reason: string };

export type CustomerAccessCodeCreateResult =
  { created: true; code: string; expiresAt: string } | { created: false; reason: string };

export type CustomerOrderVerificationResult =
  | { verified: true; email: string; orders: CustomerOrderView[] }
  | { verified: false; reason: string };

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

type SheetMetadata = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

type DeleteDimensionRequest = {
  deleteDimension: {
    range: {
      sheetId: number;
      dimension: "ROWS";
      startIndex: number;
      endIndex: number;
    };
  };
};

type AddSheetRequest = {
  addSheet: {
    properties: {
      title: string;
    };
  };
};

type SheetColor = {
  red: number;
  green: number;
  blue: number;
};

type SheetCellFormat = {
  backgroundColor?: SheetColor;
  textFormat?: {
    foregroundColor: SheetColor;
  };
};

type RepeatCellRequest = {
  repeatCell: {
    range: {
      sheetId: number;
      startRowIndex: number;
      endRowIndex: number;
      startColumnIndex: number;
      endColumnIndex: number;
    };
    cell: {
      userEnteredFormat: SheetCellFormat;
    };
    fields: string;
  };
};

type BatchUpdateRequest = DeleteDimensionRequest | AddSheetRequest | RepeatCellRequest;

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

  const serviceStatus = await loadServiceStatusWithClient(client);
  if (serviceStatus.suspended) {
    return {
      savedToGoogleSheets: false,
      reason: getServiceSuspensionMessage(serviceStatus),
      serviceSuspended: true,
      serviceStatus,
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

  await tryFormatOrderDatabaseSheets(client);

  return { savedToGoogleSheets: true };
}

export async function formatOrderDatabaseSheets(): Promise<GoogleSheetsMutationResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      updatedGoogleSheets: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  await formatOrderDatabaseSheetsWithClient(client);

  return { updatedGoogleSheets: true };
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

export async function getOrderFromGoogleSheets(orderId: string): Promise<DashboardOrder | null> {
  const client = await getGoogleSheetsClient();
  if (!client) return null;

  const [orderValues, orderItemValues] = await Promise.all([
    readSheetValues(client.config.spreadsheetId, ORDERS_RANGE, client.accessToken),
    readSheetValues(client.config.spreadsheetId, ORDER_ITEMS_RANGE, client.accessToken),
  ]);

  const [orderHeaders = [], ...orderRows] = orderValues;
  const [orderItemHeaders = [], ...orderItemRows] = orderItemValues;
  assertHeaders("Orders", orderHeaders, ORDER_HEADERS);
  assertHeaders("OrderItems", orderItemHeaders, ORDER_ITEM_HEADERS);

  const orderRow = orderRows.find((row) => cell(row, 0) === orderId);
  if (!orderRow) return null;

  const itemRowsByOrderId = groupOrderItemRows(orderItemRows);
  return toDashboardOrder(orderRow, itemRowsByOrderId.get(orderId) ?? []);
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
    `Orders!A${orderRow.rowNumber}:Y${orderRow.rowNumber}`,
    [nextRow],
    client.accessToken,
  );

  await tryFormatOrderDatabaseSheets(client);

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
    `Orders!A${orderRow.rowNumber}:Y${orderRow.rowNumber}`,
    [nextRow],
    client.accessToken,
  );

  await tryFormatOrderDatabaseSheets(client);

  return { updatedGoogleSheets: true };
}

export async function deleteOrderFromGoogleSheets(
  orderId: string,
): Promise<GoogleSheetsMutationResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      updatedGoogleSheets: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  const [orderValues, orderItemValues, sheetIds] = await Promise.all([
    readSheetValues(client.config.spreadsheetId, ORDERS_RANGE, client.accessToken),
    readSheetValues(client.config.spreadsheetId, ORDER_ITEMS_RANGE, client.accessToken),
    readSheetIds(client.config.spreadsheetId, client.accessToken),
  ]);

  const [orderHeaders = [], ...orderRows] = orderValues;
  const [orderItemHeaders = [], ...orderItemRows] = orderItemValues;
  assertHeaders("Orders", orderHeaders, ORDER_HEADERS);
  assertHeaders("OrderItems", orderItemHeaders, ORDER_ITEM_HEADERS);

  const orderDataIndex = orderRows.findIndex((row) => cell(row, 0) === orderId);
  if (orderDataIndex === -1) {
    return {
      updatedGoogleSheets: false,
      reason: `Order ${orderId} was not found in Google Sheets.`,
    };
  }

  const ordersSheetId = sheetIds.get("Orders");
  const orderItemsSheetId = sheetIds.get("OrderItems");

  if (ordersSheetId === undefined || orderItemsSheetId === undefined) {
    return {
      updatedGoogleSheets: false,
      reason: "Orders or OrderItems sheet tab was not found in Google Sheets.",
    };
  }

  const orderItemRowNumbers = orderItemRows
    .map((row, index) => (cell(row, 0) === orderId ? index + 2 : null))
    .filter((rowNumber): rowNumber is number => rowNumber !== null)
    .sort((a, b) => b - a);
  const orderRowNumber = orderDataIndex + 2;

  const requests: DeleteDimensionRequest[] = [
    ...orderItemRowNumbers.map((rowNumber) => deleteRowRequest(orderItemsSheetId, rowNumber)),
    deleteRowRequest(ordersSheetId, orderRowNumber),
  ];

  await batchUpdateSpreadsheet(client.config.spreadsheetId, requests, client.accessToken);
  await tryFormatOrderDatabaseSheets(client);

  return { updatedGoogleSheets: true };
}

export async function loadServiceStatusFromGoogleSheets(): Promise<GoogleSheetsServiceStatusResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      loadedFromGoogleSheets: false,
      status: DEFAULT_SERVICE_STATUS,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  const status = await loadServiceStatusWithClient(client);
  return { loadedFromGoogleSheets: true, status };
}

export async function updateServiceStatusInGoogleSheets(
  status: ServiceStatus,
): Promise<GoogleSheetsMutationResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      updatedGoogleSheets: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  await ensureServiceStatusSheet(client);
  await updateSheetValues(
    client.config.spreadsheetId,
    `${SERVICE_STATUS_SHEET}!A2:E2`,
    [toServiceStatusRow(withServiceStatusDefaults(status))],
    client.accessToken,
  );

  return { updatedGoogleSheets: true };
}

export async function createCustomerOrderAccessCode(
  email: string,
): Promise<CustomerAccessCodeCreateResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      created: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  const normalizedEmail = normalizeCustomerEmail(email);
  const code = await createNumericAccessCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CUSTOMER_ACCESS_CODE_TTL_MS).toISOString();

  await ensureCustomerAccessCodesSheet(client);
  await appendSheetValues(
    client.config.spreadsheetId,
    CUSTOMER_ACCESS_CODES_RANGE,
    [
      [
        normalizedEmail,
        await hashCustomerAccessCode(normalizedEmail, code),
        expiresAt,
        now.toISOString(),
        "",
        0,
        "",
      ],
    ],
    client.accessToken,
  );

  return { created: true, code, expiresAt };
}

export async function verifyCustomerOrderAccessCode(
  email: string,
  code: string,
): Promise<CustomerOrderVerificationResult> {
  const client = await getGoogleSheetsClient();

  if (!client) {
    return {
      verified: false,
      reason: "Order lookup is not configured. Please call us if you need help with your order.",
    };
  }

  const normalizedEmail = normalizeCustomerEmail(email);
  await ensureCustomerAccessCodesSheet(client);

  const values = await readSheetValues(
    client.config.spreadsheetId,
    CUSTOMER_ACCESS_CODES_RANGE,
    client.accessToken,
  );
  const [headers = [], ...rows] = values;
  assertHeaders(CUSTOMER_ACCESS_CODES_SHEET, headers, CUSTOMER_ACCESS_CODE_HEADERS);

  const now = Date.now();
  const matchingRows = rows
    .map((row, index) => ({
      rowNumber: index + 2,
      values: normalizeRow(row, CUSTOMER_ACCESS_CODE_HEADERS.length),
    }))
    .filter(({ values }) => cell(values, 0) === normalizedEmail && !cell(values, 4))
    .sort((a, b) => new Date(cell(b.values, 3)).getTime() - new Date(cell(a.values, 3)).getTime());

  const accessRow = matchingRows.find(({ values }) => {
    const expiresAt = new Date(cell(values, 2)).getTime();
    return Number.isFinite(expiresAt) && expiresAt >= now;
  });

  if (!accessRow) {
    return {
      verified: false,
      reason: "That code is expired or invalid. Please request a new code.",
    };
  }

  const expectedHash = cell(accessRow.values, 1);
  const actualHash = await hashCustomerAccessCode(normalizedEmail, code);
  const nextRow = normalizeRow(accessRow.values, CUSTOMER_ACCESS_CODE_HEADERS.length);
  nextRow[6] = new Date().toISOString();

  if (actualHash !== expectedHash) {
    const attemptCount = numberCell(nextRow, 5) + 1;
    nextRow[5] = attemptCount;
    if (attemptCount >= MAX_CUSTOMER_ACCESS_CODE_ATTEMPTS) {
      nextRow[4] = new Date().toISOString();
    }

    await updateSheetValues(
      client.config.spreadsheetId,
      `${CUSTOMER_ACCESS_CODES_SHEET}!A${accessRow.rowNumber}:G${accessRow.rowNumber}`,
      [nextRow],
      client.accessToken,
    );

    return {
      verified: false,
      reason: "That code is expired or invalid. Please request a new code if needed.",
    };
  }

  nextRow[4] = new Date().toISOString();
  await updateSheetValues(
    client.config.spreadsheetId,
    `${CUSTOMER_ACCESS_CODES_SHEET}!A${accessRow.rowNumber}:G${accessRow.rowNumber}`,
    [nextRow],
    client.accessToken,
  );

  const ordersResult = await listOrdersFromGoogleSheets();
  if (!ordersResult.loadedFromGoogleSheets) {
    return { verified: false, reason: ordersResult.reason };
  }

  return {
    verified: true,
    email: normalizedEmail,
    orders: ordersResult.orders
      .filter((order) => normalizeCustomerEmail(order.customer.email) === normalizedEmail)
      .map(toCustomerOrderView),
  };
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

async function readSheetIds(spreadsheetId: string, accessToken: string) {
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(
      spreadsheetId,
    )}?fields=sheets.properties(sheetId,title)`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets metadata read failed: ${await readGoogleError(response)}`);
  }

  const payload = (await response.json()) as SheetMetadata;
  const sheetIds = new Map<string, number>();

  payload.sheets?.forEach((sheet) => {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    if (title && sheetId !== undefined) {
      sheetIds.set(title, sheetId);
    }
  });

  return sheetIds;
}

async function tryFormatOrderDatabaseSheets(client: GoogleSheetsClient) {
  try {
    await formatOrderDatabaseSheetsWithClient(client);
  } catch (error) {
    console.error("Google Sheets database formatting failed:", error);
  }
}

async function formatOrderDatabaseSheetsWithClient(client: GoogleSheetsClient) {
  const [sheetIds, ...sheetValues] = await Promise.all([
    readSheetIds(client.config.spreadsheetId, client.accessToken),
    ...DATABASE_SHEET_FORMATS.map((sheet) =>
      readSheetValues(client.config.spreadsheetId, sheet.range, client.accessToken),
    ),
  ]);

  const requests = DATABASE_SHEET_FORMATS.flatMap((sheet, index) => {
    const sheetId = sheetIds.get(sheet.title);
    if (sheetId === undefined) return [];

    const rowCount = Math.max(sheetValues[index]?.length ?? 0, 1);
    return databaseSheetFormatRequests(sheetId, rowCount, sheet.columnCount);
  });

  await batchUpdateSpreadsheet(client.config.spreadsheetId, requests, client.accessToken);
}

function databaseSheetFormatRequests(
  sheetId: number,
  rowCount: number,
  columnCount: number,
): RepeatCellRequest[] {
  const requests: RepeatCellRequest[] = [
    repeatCellRequest(
      sheetId,
      0,
      rowCount,
      columnCount,
      {
        textFormat: {
          foregroundColor: DATABASE_TEXT_COLOR,
        },
      },
      "userEnteredFormat.textFormat.foregroundColor",
    ),
  ];

  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    requests.push(
      repeatCellRequest(
        sheetId,
        rowIndex,
        rowIndex + 1,
        columnCount,
        {
          backgroundColor: rowIndex % 2 === 1 ? DATABASE_ROW_WHITE : DATABASE_ROW_LIGHT_BLUE,
        },
        "userEnteredFormat.backgroundColor",
      ),
    );
  }

  return requests;
}

function repeatCellRequest(
  sheetId: number,
  startRowIndex: number,
  endRowIndex: number,
  columnCount: number,
  userEnteredFormat: SheetCellFormat,
  fields: string,
): RepeatCellRequest {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex,
        endRowIndex,
        startColumnIndex: 0,
        endColumnIndex: columnCount,
      },
      cell: {
        userEnteredFormat,
      },
      fields,
    },
  };
}

async function loadServiceStatusWithClient(client: GoogleSheetsClient): Promise<ServiceStatus> {
  await ensureServiceStatusSheet(client);

  const values = await readSheetValues(
    client.config.spreadsheetId,
    SERVICE_STATUS_RANGE,
    client.accessToken,
  );
  const [headers = [], statusRow] = values;
  assertHeaders(SERVICE_STATUS_SHEET, headers, SERVICE_STATUS_HEADERS);

  if (!statusRow) {
    const defaultStatus = withServiceStatusDefaults(DEFAULT_SERVICE_STATUS);
    await updateSheetValues(
      client.config.spreadsheetId,
      `${SERVICE_STATUS_SHEET}!A2:E2`,
      [toServiceStatusRow(defaultStatus)],
      client.accessToken,
    );
    return defaultStatus;
  }

  return toServiceStatus(statusRow);
}

async function ensureServiceStatusSheet(client: GoogleSheetsClient) {
  const sheetIds = await readSheetIds(client.config.spreadsheetId, client.accessToken);

  if (!sheetIds.has(SERVICE_STATUS_SHEET)) {
    await batchUpdateSpreadsheet(
      client.config.spreadsheetId,
      [{ addSheet: { properties: { title: SERVICE_STATUS_SHEET } } }],
      client.accessToken,
    );
    await updateSheetValues(
      client.config.spreadsheetId,
      `${SERVICE_STATUS_SHEET}!A1:E2`,
      [Array.from(SERVICE_STATUS_HEADERS), toServiceStatusRow(DEFAULT_SERVICE_STATUS)],
      client.accessToken,
    );
    return;
  }

  const values = await readSheetValues(
    client.config.spreadsheetId,
    SERVICE_STATUS_RANGE,
    client.accessToken,
  );
  const [headers = []] = values;

  if (!headersMatch(headers, SERVICE_STATUS_HEADERS)) {
    await updateSheetValues(
      client.config.spreadsheetId,
      `${SERVICE_STATUS_SHEET}!A1:E1`,
      [Array.from(SERVICE_STATUS_HEADERS)],
      client.accessToken,
    );
  }
}

async function ensureCustomerAccessCodesSheet(client: GoogleSheetsClient) {
  const sheetIds = await readSheetIds(client.config.spreadsheetId, client.accessToken);

  if (!sheetIds.has(CUSTOMER_ACCESS_CODES_SHEET)) {
    await batchUpdateSpreadsheet(
      client.config.spreadsheetId,
      [{ addSheet: { properties: { title: CUSTOMER_ACCESS_CODES_SHEET } } }],
      client.accessToken,
    );
    await updateSheetValues(
      client.config.spreadsheetId,
      `${CUSTOMER_ACCESS_CODES_SHEET}!A1:G1`,
      [Array.from(CUSTOMER_ACCESS_CODE_HEADERS)],
      client.accessToken,
    );
    return;
  }

  const values = await readSheetValues(
    client.config.spreadsheetId,
    CUSTOMER_ACCESS_CODES_RANGE,
    client.accessToken,
  );
  const [headers = []] = values;

  if (!headersMatch(headers, CUSTOMER_ACCESS_CODE_HEADERS)) {
    await updateSheetValues(
      client.config.spreadsheetId,
      `${CUSTOMER_ACCESS_CODES_SHEET}!A1:G1`,
      [Array.from(CUSTOMER_ACCESS_CODE_HEADERS)],
      client.accessToken,
    );
  }
}

async function batchUpdateSpreadsheet(
  spreadsheetId: string,
  requests: BatchUpdateRequest[],
  accessToken: string,
) {
  if (requests.length === 0) return;

  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets batch update failed: ${await readGoogleError(response)}`);
  }
}

function deleteRowRequest(sheetId: number, rowNumber: number): DeleteDimensionRequest {
  return {
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: rowNumber - 1,
        endIndex: rowNumber,
      },
    },
  };
}

async function createNumericAccessCode() {
  const { randomInt } = await import("node:crypto");
  return String(randomInt(100000, 1000000));
}

async function hashCustomerAccessCode(email: string, code: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update(`${customerAccessCodeSecret()}:${email}:${code}`)
    .digest("hex");
}

function customerAccessCodeSecret() {
  return (
    process.env.CUSTOMER_ORDER_ACCESS_SECRET?.trim() ||
    process.env.ORDER_REMINDER_SECRET?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "blue-nile-customer-order-local-secret"
  );
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
    sheetText(order.id),
    sheetText(order.submittedAt),
    sheetText(new Date().toISOString()),
    sheetText(order.status),
    sheetText(order.payment.status),
    sheetText(order.customer.name),
    sheetText(order.customer.phone),
    sheetText(order.customer.email),
    sheetText(order.event.date),
    sheetText(order.event.time),
    sheetText(order.event.deliveryAddress),
    sheetText(order.event.deliveryAddressLine2),
    sheetText(order.event.zipCode),
    order.event.numberOfPeople,
    sheetText(order.event.individuallyWrapped ? "yes" : "no"),
    sheetText(order.event.specialInstructions),
    order.totals.subtotal,
    order.totals.deliveryFee,
    order.totals.tax,
    order.totals.estimatedTotal,
    order.totals.finalTotal ?? "",
    sheetText(order.payment.stripeCheckoutSessionId),
    sheetText(order.payment.stripePaymentIntentId),
    sheetText(order.payment.stripeReceiptUrl),
    sheetText(order.event.paperSupplies ? "yes" : "no"),
  ];
}

function toOrderItemRows(order: DashboardOrder): SheetValue[][] {
  return order.cart.map((line, index) => [
    sheetText(order.id),
    index + 1,
    sheetText(line.item),
    line.quantity,
    sheetText(line.selections.join(" | ")),
    sheetText(line.notes),
    line.unitPrice,
    line.lineTotal,
  ]);
}

function toServiceStatusRow(status: ServiceStatus): SheetValue[] {
  return [
    sheetText(status.suspended ? "yes" : "no"),
    sheetText(status.messageMode),
    sheetText(status.customMessage),
    sheetText(status.resumeDate),
    sheetText(status.updatedAt),
  ];
}

function toServiceStatus(row: SheetValue[]): ServiceStatus {
  const messageMode = cell(row, 1);

  return withServiceStatusDefaults({
    suspended: parseSheetBoolean(cell(row, 0)),
    messageMode: isServiceMessageMode(messageMode) ? messageMode : "default",
    customMessage: cell(row, 2),
    resumeDate: cell(row, 3),
    updatedAt: cell(row, 4),
  });
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

function hasOrderItem(cart: DashboardOrderLine[], itemName: string) {
  return cart.some((line) => line.item.trim().toLowerCase() === itemName.toLowerCase());
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
      paperSupplies: parseSheetBoolean(cell(row, 24)) || hasOrderItem(cart, PAPER_SUPPLIES_ITEM),
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
  const checkedHeaders =
    sheetName === "Orders" && expectedHeaders === ORDER_HEADERS
      ? expectedHeaders.slice(0, -1)
      : expectedHeaders;
  const missingOrMoved = checkedHeaders.filter(
    (expected, index) => cell(actualHeaders, index) !== expected,
  );
  const optionalPaperSuppliesHeader =
    sheetName === "Orders" && expectedHeaders === ORDER_HEADERS
      ? cell(actualHeaders, ORDER_HEADERS.length - 1)
      : "";

  if (
    optionalPaperSuppliesHeader &&
    optionalPaperSuppliesHeader !== ORDER_HEADERS[ORDER_HEADERS.length - 1]
  ) {
    missingOrMoved.push(ORDER_HEADERS[ORDER_HEADERS.length - 1]);
  }

  if (missingOrMoved.length > 0) {
    throw new Error(
      `${sheetName} sheet headers do not match the app schema. Check these columns: ${missingOrMoved.join(
        ", ",
      )}.`,
    );
  }
}

function headersMatch(actualHeaders: SheetValue[], expectedHeaders: readonly string[]) {
  return expectedHeaders.every((expected, index) => cell(actualHeaders, index) === expected);
}

function normalizeRow(row: SheetValue[], length: number) {
  return Array.from({ length }, (_, index) => row[index] ?? "");
}

function cell(row: SheetValue[], index: number) {
  const value = row[index];
  if (value === undefined || value === null) return "";
  return unescapeSheetText(String(value).trim());
}

function numberCell(row: SheetValue[], index: number) {
  return parseSheetNumber(cell(row, index)) ?? 0;
}

function nullableNumberCell(row: SheetValue[], index: number) {
  return parseSheetNumber(cell(row, index));
}

function parseSheetNumber(value: string) {
  if (!value) return null;

  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;

  const accountingValue = value.match(/^\((.*)\)$/)?.[1];
  const normalized = (accountingValue ?? value).replace(/[$,\s]/g, "");
  const normalizedParsed = Number(normalized);

  if (!Number.isFinite(normalizedParsed)) return null;
  return accountingValue === undefined ? normalizedParsed : -normalizedParsed;
}

function parseSheetBoolean(value: string) {
  return ["true", "yes", "1", "y"].includes(value.trim().toLowerCase());
}

function sheetText(value: string) {
  const text = String(value);
  return SHEET_FORMULA_PREFIX.test(text.trimStart()) ? `'${text}` : text;
}

function unescapeSheetText(value: string) {
  return value.replace(/^'(?=[=+\-@])/, "");
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
