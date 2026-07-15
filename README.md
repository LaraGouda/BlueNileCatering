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
