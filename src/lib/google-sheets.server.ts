import "@tanstack/react-start/server-only";

import type { DashboardOrder } from "./order-store";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const ORDERS_RANGE = "Orders!A:X";
const ORDER_ITEMS_RANGE = "OrderItems!A:H";

type GoogleSheetsSubmitResult =
  { savedToGoogleSheets: true } | { savedToGoogleSheets: false; reason: string };

type GoogleSheetsConfig = {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
};

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
};

export async function appendOrderToGoogleSheets(
  order: DashboardOrder,
): Promise<GoogleSheetsSubmitResult> {
  const config = readGoogleSheetsConfig();

  if (!config) {
    return {
      savedToGoogleSheets: false,
      reason:
        "Google Sheets is not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID and service account credentials.",
    };
  }

  const accessToken = await getAccessToken(config);

  await appendSheetValues(config.spreadsheetId, ORDERS_RANGE, [toOrderRow(order)], accessToken);

  if (order.cart.length > 0) {
    await appendSheetValues(
      config.spreadsheetId,
      ORDER_ITEMS_RANGE,
      toOrderItemRows(order),
      accessToken,
    );
  }

  return { savedToGoogleSheets: true };
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

async function appendSheetValues(
  spreadsheetId: string,
  range: string,
  values: Array<Array<string | number>>,
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

function toOrderRow(order: DashboardOrder): Array<string | number> {
  return [
    order.id,
    order.submittedAt,
    new Date().toISOString(),
    order.status,
    "unpaid",
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
    "",
    order.totals.estimatedTotal,
    "",
    "",
    "",
    "",
  ];
}

function toOrderItemRows(order: DashboardOrder): Array<Array<string | number>> {
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
