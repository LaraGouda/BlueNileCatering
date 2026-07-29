import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Phone,
  Truck,
  Utensils,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CartSheet } from "@/components/site/CartSheet";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ServiceSuspensionBanner } from "@/components/site/ServiceSuspensionBanner";
import { BUSINESS, formatPrice } from "@/data/menu";
import cateringBgUrl from "@/assets/catering-bg.png?url";

export const Route = createFileRoute("/policies-and-procedures")({
  component: PoliciesAndProcedures,
});

const QUICK_POLICIES = [
  {
    icon: Users,
    label: "Minimum order",
    text: `${BUSINESS.minimumPeople} people per catering order.`,
  },
  {
    icon: Clock,
    label: "Advance notice",
    text: `${BUSINESS.advanceNoticeHours} hours minimum notice is required.`,
  },
  {
    icon: Truck,
    label: "Delivery",
    text: `${formatPrice(BUSINESS.deliveryFee)} flat delivery fee on catering orders.`,
  },
  {
    icon: CreditCard,
    label: "Payment",
    text: "Cards are authorized first and charged after kitchen review.",
  },
];

const POLICY_SECTIONS = [
  {
    title: "Ordering Procedure",
    items: [
      "Browse the catering menu, add items to the cart, then submit the order request with event details, delivery address, guest count, and special instructions.",
      "Every online order is a request until Blue Nile reviews it and confirms it by phone, text, or email.",
      `For custom packages, staffed service requests, tight timing, or questions, call or text ${BUSINESS.phone} before submitting.`,
    ],
  },
  {
    title: "Minimums, Timing, and Availability",
    items: [
      `Catering orders require a minimum of ${BUSINESS.minimumPeople} people.`,
      `Orders must be placed at least ${BUSINESS.advanceNoticeHours} hours before the event time. More notice is recommended for large orders, holidays, and weekends.`,
      "Service may be paused or limited because of availability, holidays, weather, staffing, or supply issues. If that happens, Blue Nile will contact customers with affected orders.",
    ],
  },
  {
    title: "Menu, Pricing, and Customization",
    items: [
      "Menu prices are based on the selections shown online. Final totals may change if the order requires substitutions, custom quantities, special packaging, or added service.",
      `Individually wrapped meals are available in the ${BUSINESS.wrappedRange} range per person and must be selected or requested before confirmation.`,
      "Menu items, ingredients, and availability may change. Blue Nile will review substitutions or adjustments before confirming the order.",
    ],
  },
  {
    title: "Payment Policy",
    items: [
      "Online checkout uses secure Stripe payment authorization. The card is authorized when the request is submitted.",
      "The kitchen reviews the order before charging. If the order is declined or cannot be fulfilled, the card hold is released.",
      "Blue Nile does not store full card details. Payment information is handled through Stripe.",
    ],
  },
  {
    title: "Delivery and Setup",
    items: [
      `Catering orders include a ${formatPrice(BUSINESS.deliveryFee)} flat delivery fee.`,
      `Blue Nile serves South Jersey, Hamilton, Trenton, PA, and the Jersey Shore area. Delivery outside the normal service area must be approved before confirmation.`,
      "Customers are responsible for providing a complete delivery address, phone number, event contact, access instructions, gate codes, parking notes, and setup timing.",
      "Standard catering delivery is drop-off service. Additional setup, serving, or timing requirements must be requested and approved in advance.",
    ],
  },
  {
    title: "Changes and Cancellations",
    items: [
      `Order changes and cancellations must be requested by calling or texting ${BUSINESS.phone}.`,
      "Changes are not confirmed until Blue Nile acknowledges them. Last-minute changes may not be possible once food has been purchased, prepared, or dispatched.",
      "If an order is canceled after preparation has started or after delivery is in progress, charges may apply for completed work, purchased ingredients, or delivery costs.",
    ],
  },
  {
    title: "Allergies and Dietary Requests",
    items: [
      "All allergies, sensitivities, vegetarian needs, and dietary requests should be entered in the special instructions field and confirmed directly with Blue Nile.",
      "The kitchen handles common allergens including wheat, dairy, eggs, sesame, soy, tree nuts, peanuts, seafood, and shellfish.",
      "Blue Nile will try to accommodate requests, but cannot guarantee an allergen-free environment or prevent cross-contact.",
    ],
  },
  {
    title: "Food Safety and Leftovers",
    items: [
      "Food should be served promptly after delivery or kept at safe hot or cold holding temperatures.",
      "After delivery or pickup, the customer is responsible for safe handling, storage, reheating, and disposal of food.",
      "Leftovers are the customer's responsibility after the event. Blue Nile cannot guarantee food quality or safety after food has been left out, transported again, or stored improperly.",
    ],
  },
  {
    title: "Order Accuracy and Event-Day Issues",
    items: [
      "Customers should review the order confirmation carefully and notify Blue Nile quickly if any event details, items, quantities, or contact information need correction.",
      "Delivery issues, missing items, or quality concerns should be reported the same day so Blue Nile can review and respond appropriately.",
      "Photos, order numbers, and event contact details may be requested to help resolve an issue.",
    ],
  },
];

const PROCEDURE_STEPS = [
  "Add catering items to the cart.",
  "Submit event details and authorize payment through checkout.",
  "Wait for kitchen review and confirmation.",
  "Respond quickly to any questions about timing, substitutions, delivery, or setup.",
  "Meet the delivery contact at the event location and inspect the order on arrival.",
];

function PoliciesAndProcedures() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundImage: `url(${cateringBgUrl})`,
        backgroundPosition: "-250px 0",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <Header />
      <ServiceSuspensionBanner />
      <main id="top" className="px-4 py-10 sm:py-14">
        <section className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-1 text-xs font-bold uppercase text-primary shadow-sm">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Catering Guidelines
            </div>
            <h1 className="section-title mt-4 text-4xl sm:text-5xl">Policies & Procedures</h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
              These policies explain how Blue Nile catering requests, payment authorization,
              delivery, food safety, changes, and event-day communication work.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <a href="/#order">Start an Order Request</a>
              </Button>
              <Button asChild variant="outline">
                <a href={BUSINESS.phoneHref}>
                  <Phone className="h-4 w-4" />
                  Call / Text {BUSINESS.phone}
                </a>
              </Button>
            </div>
          </div>

          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_POLICIES.map((policy) => (
              <li
                key={policy.label}
                className="rounded-lg border border-border bg-card/95 p-4 shadow-sm"
              >
                <policy.icon className="h-5 w-5 text-accent" aria-hidden="true" />
                <h2 className="mt-3 text-sm font-bold text-primary">{policy.label}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{policy.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-5">
            {POLICY_SECTIONS.map((section) => (
              <article
                key={section.title}
                className="rounded-lg border border-border bg-card/95 p-5 shadow-sm sm:p-6"
              >
                <h2 className="font-display text-2xl text-primary">{section.title}</h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <section className="rounded-lg border border-border bg-card/95 p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Utensils className="h-5 w-5 text-accent" aria-hidden="true" />
                <h2 className="font-display text-xl text-primary">Order Procedure</h2>
              </div>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                {PROCEDURE_STEPS.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-lg border border-border bg-warning p-5 text-warning-foreground shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-xl">Need help?</h2>
                  <p className="mt-2 text-sm leading-6">
                    Call or text before submitting when an event has allergies, complex timing,
                    special setup needs, or less than a full day of notice.
                  </p>
                  <a
                    href={BUSINESS.phoneHref}
                    className="mt-4 inline-flex text-sm font-bold underline underline-offset-4"
                  >
                    {BUSINESS.phone}
                  </a>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </main>
      <Footer />
      <CartSheet />
    </div>
  );
}
