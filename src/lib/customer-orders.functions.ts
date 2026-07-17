import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sendCustomerOrderAccessCodeEmail } from "@/lib/email.server";
import {
  createCustomerOrderAccessCode,
  verifyCustomerOrderAccessCode,
} from "@/lib/google-sheets.server";
import { normalizeCustomerEmail } from "@/lib/customer-orders";

const emailSchema = z.string().email().transform(normalizeCustomerEmail);
const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

export const requestCustomerOrdersCode = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        email: emailSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const codeResult = await createCustomerOrderAccessCode(data.email);

    if (!codeResult.created) {
      return {
        sent: false,
        reason: codeResult.reason,
      } as const;
    }

    const emailResult = await sendCustomerOrderAccessCodeEmail({
      email: data.email,
      code: codeResult.code,
      expiresAt: codeResult.expiresAt,
    });

    if (!emailResult.sent) {
      return {
        sent: false,
        reason: emailResult.reason,
      } as const;
    }

    return { sent: true } as const;
  });

export const verifyCustomerOrdersCode = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        email: emailSchema,
        code: codeSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return verifyCustomerOrderAccessCode(data.email, data.code);
  });
