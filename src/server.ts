import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { handleOrderReminderRequest, sendWebsiteIssueNotification } from "./lib/email.server";
import { renderErrorPage } from "./lib/error-page";
import { handleStripeWebhookRequest } from "./lib/stripe.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const error = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(error);
  await notifyWebsiteIssue("SSR error", error, request);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

async function notifyWebsiteIssue(subject: string, error: unknown, request: Request) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  try {
    const result = await sendWebsiteIssueNotification({
      subject,
      message,
      stack,
      requestUrl: request.url,
    });

    if (!result.sent) {
      console.warn(`[email] website issue notification was not sent: ${result.reason}`);
    }
  } catch (notificationError) {
    console.error("Website issue notification failed:", notificationError);
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/stripe/webhook") {
        return handleStripeWebhookRequest(request);
      }
      if (url.pathname === "/api/order-reminders") {
        return handleOrderReminderRequest(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(request, response);
    } catch (error) {
      console.error(error);
      await notifyWebsiteIssue("Server error", error, request);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
