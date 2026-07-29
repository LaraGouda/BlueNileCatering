import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const verifyDashboardPin = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        pin: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const expectedPin = process.env.OWNER_DASHBOARD_PIN?.trim();

    if (!expectedPin) {
      return {
        verified: false,
        reason: "Dashboard passcode is not configured.",
      } as const;
    }

    return data.pin === expectedPin
      ? ({ verified: true } as const)
      : ({
          verified: false,
          reason: "Incorrect passcode.",
        } as const);
  });
