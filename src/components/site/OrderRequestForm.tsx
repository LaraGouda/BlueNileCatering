import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Mail, MessageSquareText, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "@/lib/cart-context";
import {
  createDashboardOrder,
  saveDashboardOrder,
  type NewDashboardOrder,
} from "@/lib/order-store";
import { submitOrderToGoogleSheets } from "@/lib/google-sheets.functions";
import { createStripeCheckoutSession } from "@/lib/stripe.functions";
import { BUSINESS, formatPrice } from "@/data/menu";

interface FormState {
  name: string;
  phone: string;
  email: string;
  eventDate: string;
  eventTime: string;
  address: string;
  addressLine2: string;
  zipCode: string;
  people: string;
  individuallyWrapped: string;
  instructions: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  eventDate: "",
  eventTime: "",
  address: "",
  addressLine2: "",
  zipCode: "",
  people: "",
  individuallyWrapped: "no",
  instructions: "",
};

export function OrderRequestForm() {
  const { lines, subtotal, deliveryFee, total, clear } = useCart();
  const submitOrderToSheets = useServerFn(submitOrderToGoogleSheets);
  const createCheckoutSession = useServerFn(createStripeCheckoutSession);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<{
    status: "success" | "cancelled";
    orderId: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const orderId = params.get("order") ?? "";

    if (checkout === "success" || checkout === "cancelled") {
      setCheckoutResult({ status: checkout, orderId });
    }
  }, []);

  const closeCheckoutDialog = () => {
    setCheckoutResult(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("order");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const confirmationMessage = useMemo(() => {
    const orderLine = checkoutResult?.orderId
      ? `My Blue Nile catering order ID is ${checkoutResult.orderId}.`
      : "I just submitted a Blue Nile catering order.";

    return `${orderLine} Please send me a confirmation when the kitchen reviews it.`;
  }, [checkoutResult?.orderId]);

  const confirmationEmailHref = `mailto:?subject=${encodeURIComponent(
    "Blue Nile catering order confirmation",
  )}&body=${encodeURIComponent(confirmationMessage)}`;
  const confirmationTextHref = `sms:?&body=${encodeURIComponent(confirmationMessage)}`;

  const set = (field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const peopleNum = Number(form.people);
  const underMinimum =
    form.people !== "" && !Number.isNaN(peopleNum) && peopleNum < BUSINESS.minimumPeople;

  const hoursUntilEvent = (): number | null => {
    if (!form.eventDate || !form.eventTime) return null;
    const eventAt = new Date(`${form.eventDate}T${form.eventTime}`);
    if (Number.isNaN(eventAt.getTime())) return null;
    return (eventAt.getTime() - Date.now()) / (1000 * 60 * 60);
  };
  const hours = hoursUntilEvent();
  const tooSoon = hours !== null && hours < BUSINESS.advanceNoticeHours;

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!/^[\d\s()+-]{7,20}$/.test(form.phone.trim())) next.phone = "Enter a valid phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = "Enter a valid email address.";
    if (!form.eventDate) next.eventDate = "Event date is required.";
    if (!form.eventTime) next.eventTime = "Event time is required.";
    if (!form.address.trim()) next.address = "Delivery address is required.";
    if (!/^\d{5}(-\d{4})?$/.test(form.zipCode.trim())) next.zipCode = "Enter a valid ZIP code.";
    if (!form.people || Number.isNaN(peopleNum) || peopleNum < 1)
      next.people = "Enter the number of people.";
    else if (peopleNum < BUSINESS.minimumPeople)
      next.people = `Minimum ${BUSINESS.minimumPeople} people per catering order.`;
    if (hours !== null && hours < BUSINESS.advanceNoticeHours)
      next.eventTime = `We need at least ${BUSINESS.advanceNoticeHours} hours advance notice.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (lines.length === 0) {
      toast.warning("Your cart is empty — add menu items before submitting.");
      return;
    }
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const orderPayload: NewDashboardOrder = {
      submittedAt: new Date().toISOString(),
      business: BUSINESS.name,
      customer: {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      },
      event: {
        date: form.eventDate,
        time: form.eventTime,
        deliveryAddress: form.address.trim(),
        deliveryAddressLine2: form.addressLine2.trim(),
        zipCode: form.zipCode.trim(),
        numberOfPeople: peopleNum,
        individuallyWrapped: form.individuallyWrapped === "yes",
        specialInstructions: form.instructions.trim(),
      },
      cart: lines.map((l) => ({
        item: l.name,
        selections: l.selections,
        notes: l.notes,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.unitPrice * l.qty,
      })),
      totals: {
        subtotal,
        deliveryFee,
        estimatedTotal: total,
      },
    };

    const order = createDashboardOrder(orderPayload);

    try {
      setIsSubmitting(true);
      const result = await submitOrderToSheets({ data: order });
      saveDashboardOrder(order);

      if (!result.savedToGoogleSheets) {
        toast.warning(`Order captured locally only. ${result.reason}`);
        return;
      }

      const checkoutResult = await createCheckoutSession({ data: order });

      if (checkoutResult.createdCheckoutSession) {
        toast.success("Order saved. Opening secure Stripe checkout...");
        setForm(EMPTY_FORM);
        clear();
        window.location.assign(checkoutResult.checkoutUrl);
      } else {
        toast.error(checkoutResult.reason);
      }
    } catch (error) {
      console.error("Order request submission failed:", error);
      toast.error("We couldn't start checkout. Please try again or call us.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = (id: keyof FormState, label: string, input: React.ReactNode) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {errors[id] && <p className="text-xs text-destructive">{errors[id]}</p>}
    </div>
  );

  return (
    <section id="order" className="scroll-mt-20 px-4 py-10">
      <Dialog
        open={checkoutResult !== null}
        onOpenChange={(open) => !open && closeCheckoutDialog()}
      >
        <DialogContent className="max-w-md rounded-xl border-primary/20 bg-card p-6 shadow-xl">
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-800 text-white shadow-sm">
              <CheckCircle2 className="h-7 w-7" />
            </div>

            <DialogHeader className="items-center space-y-2 text-center">
              <DialogTitle className="font-display text-3xl text-primary">
                {checkoutResult?.status === "success"
                  ? "Thank you for your order!"
                  : "Checkout was canceled"}
              </DialogTitle>
              <DialogDescription className="mx-auto max-w-sm text-center text-sm leading-6 text-muted-foreground">
                {checkoutResult?.status === "success"
                  ? "We received your catering request. Your card is only authorized for now, and the kitchen will review everything before charging."
                  : "Your order was not submitted for payment. You can review your cart and try again when you are ready."}
              </DialogDescription>
            </DialogHeader>

            {checkoutResult?.status === "success" && (
              <div className="space-y-3 rounded-lg bg-secondary p-4 text-sm">
                {checkoutResult.orderId && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Order ID
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-primary">
                      {checkoutResult.orderId}
                    </p>
                  </div>
                )}
                <p className="text-muted-foreground">
                  Questions or changes? Text us at{" "}
                  <a href={BUSINESS.phoneHref} className="font-semibold text-primary underline">
                    {BUSINESS.phone}
                  </a>
                  .
                </p>
              </div>
            )}

            <DialogFooter className="grid gap-2 sm:grid-cols-3 sm:space-x-0">
              {checkoutResult?.status === "success" && (
                <>
                  <Button asChild variant="outline">
                    <a href={confirmationEmailHref}>
                      <Mail className="h-4 w-4" />
                      Email Copy
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={confirmationTextHref}>
                      <MessageSquareText className="h-4 w-4" />
                      Text Copy
                    </a>
                  </Button>
                </>
              )}
              <Button onClick={closeCheckoutDialog}>Done</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mx-auto max-w-3xl">
        <h2 className="section-title text-center text-3xl">Request an Order</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          Fill out the form and enter payment securely through Stripe. Your card is only authorized
          now and is charged after the kitchen confirms. You can also call or text us at{" "}
          <a href={BUSINESS.phoneHref} className="font-semibold text-primary underline">
            {BUSINESS.phone}
          </a>
          .
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-6 space-y-4 rounded-2xl border border-border bg-card/95 p-5 shadow-sm sm:p-8"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "name",
              "Full Name *",
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />,
            )}
            {field(
              "phone",
              "Phone *",
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                placeholder="856-555-0123"
                autoComplete="tel"
              />,
            )}
          </div>

          {field(
            "email",
            "Email *",
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />,
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "eventDate",
              "Event Date *",
              <Input
                id="eventDate"
                type="date"
                value={form.eventDate}
                onChange={(e) => set("eventDate")(e.target.value)}
              />,
            )}
            {field(
              "eventTime",
              "Event Time *",
              <Input
                id="eventTime"
                type="time"
                value={form.eventTime}
                onChange={(e) => set("eventTime")(e.target.value)}
              />,
            )}
          </div>

          {tooSoon && (
            <div className="flex items-start gap-2 rounded-md bg-warning p-3 text-sm text-warning-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                This event is less than {BUSINESS.advanceNoticeHours} hours away. We need at least{" "}
                {BUSINESS.advanceNoticeHours} hours advance notice — please pick a later time or
                call us at {BUSINESS.phone}.
              </p>
            </div>
          )}

          {field(
            "address",
            "Delivery Address *",
            <Input
              id="address"
              value={form.address}
              onChange={(e) => set("address")(e.target.value)}
              placeholder="Street address"
              autoComplete="address-line1"
            />,
          )}

          {field(
            "addressLine2",
            "Address Line 2",
            <Input
              id="addressLine2"
              value={form.addressLine2}
              onChange={(e) => set("addressLine2")(e.target.value)}
              placeholder="Apartment, suite, floor, company name, etc. (optional)"
              autoComplete="address-line2"
            />,
          )}

          {field(
            "zipCode",
            "ZIP Code *",
            <Input
              id="zipCode"
              value={form.zipCode}
              onChange={(e) => set("zipCode")(e.target.value)}
              placeholder="08690"
              autoComplete="postal-code"
              inputMode="numeric"
            />,
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "people",
              `Number of People * (min ${BUSINESS.minimumPeople})`,
              <Input
                id="people"
                type="number"
                min={1}
                value={form.people}
                onChange={(e) => set("people")(e.target.value)}
                placeholder="e.g. 25"
              />,
            )}
            <div className="space-y-1">
              <Label htmlFor="individuallyWrapped">Individually Wrapped Meals?</Label>
              <Select value={form.individuallyWrapped} onValueChange={set("individuallyWrapped")}>
                <SelectTrigger id="individuallyWrapped" className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes ({BUSINESS.wrappedRange})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {underMinimum && (
            <div className="flex items-start gap-2 rounded-md bg-warning p-3 text-sm text-warning-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Catering orders require a minimum of {BUSINESS.minimumPeople} people.</p>
            </div>
          )}

          {field(
            "instructions",
            "Special Instructions",
            <Textarea
              id="instructions"
              value={form.instructions}
              onChange={(e) => set("instructions")(e.target.value)}
              placeholder="Allergies, setup notes, gate codes, etc."
              rows={4}
            />,
          )}

          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Cart ({lines.length} item{lines.length === 1 ? "" : "s"})
              </span>
              <span className="font-semibold">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="font-semibold">{formatPrice(deliveryFee)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-bold">
              <span>Estimated total</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            <Send className="h-4 w-4" />
            {isSubmitting ? "Opening Checkout..." : "Submit Order & Authorize Payment"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            The kitchen reviews every order before charging. If the order is declined, the card hold
            is released.
          </p>
        </form>
      </div>
    </section>
  );
}
