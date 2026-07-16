# Blue Nile Catering

A catering order site for Blue Nile Mediterranean Grill.

Customers can browse the catering menu, build a cart, and submit a catering request with Stripe payment authorization.

## Local Setup

Add the required Google Sheets and Stripe keys to `.env`, then run:

```sh
npm run dev
```

For local Stripe webhooks, keep this running in a second terminal:

```sh
stripe listen --forward-to localhost:8080/api/stripe/webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

Orders are stored in Google Sheets and managed from `/dashboard`.

## Email Notifications

This app uses Resend for transactional order emails.

Resend setup:

1. Add and verify your sending domain in Resend.
2. Create a Resend API key.
3. Use a `RESEND_FROM_EMAIL` address on the verified domain.

Required `.env` values:

```sh
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="Blue Nile Catering <orders@yourdomain.com>"
RESEND_REPLY_TO_EMAIL=orders@yourdomain.com
COOK_ORDER_EMAIL=cook@example.com
ORDER_REMINDER_SECRET=use-a-long-random-secret
PUBLIC_SITE_URL=https://your-live-site.com
```

Emails sent:

- After Stripe confirms the card authorization: customer receives a "request received" email and the cook receives a new order review email.
- After the dashboard `Confirm & Charge` action: customer receives an approval/charged email and the cook receives a confirmation email.
- After the dashboard `Decline & Release` action: customer receives a declined/released email and the cook receives a confirmation email.

For 12-hour cook reminders, schedule this endpoint to run every 12 hours:

```sh
curl -X POST "$PUBLIC_SITE_URL/api/order-reminders" \
  -H "Authorization: Bearer $ORDER_REMINDER_SECRET"
```

The reminder endpoint only emails orders that are still `new`, have an `authorized` payment, and were submitted at least 12 hours ago.
