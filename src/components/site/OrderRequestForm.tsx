import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useCart } from "@/lib/cart-context";
import {
  createDashboardOrder,
  saveDashboardOrder,
  type NewDashboardOrder,
} from "@/lib/order-store";
import { submitOrderToGoogleSheets } from "@/lib/google-sheets.functions";
import { createStripeCheckoutSession } from "@/lib/stripe.functions";
import { BUSINESS, formatPrice } from "@/data/menu";
import { useServiceStatus } from "@/lib/use-service-status";

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
  paperSupplies: boolean;
  individuallyWrapped: boolean;
  instructions: string;
}

type TextFormField = Exclude<keyof FormState, "paperSupplies" | "individuallyWrapped">;

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
  paperSupplies: false,
  individuallyWrapped: false,
  instructions: "",
};

function requiredLabel(label: string, suffix = "") {
  return (
    <>
      {label}
      <span className="text-red-600">*</span>
      {suffix}
    </>
  );
}

export function OrderRequestForm() {
  const { lines, subtotal, deliveryFee, clear } = useCart();
  const { status: serviceStatus, setServiceStatus, openSuspensionDialog } = useServiceStatus();
  const submitOrderToSheets = useServerFn(submitOrderToGoogleSheets);
  const createCheckoutSession = useServerFn(createStripeCheckoutSession);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<TextFormField, string>>>({});
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

  const set = (field: TextFormField) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };
  const setChecked = (field: "paperSupplies" | "individuallyWrapped") => (checked: boolean) => {
    setForm((prev) => ({ ...prev, [field]: checked }));
  };

  const peopleNum = Number(form.people);
  const addOnPeopleCount =
    form.people !== "" && Number.isFinite(peopleNum) && peopleNum > 0 ? peopleNum : 0;
  const underMinimum =
    form.people !== "" && !Number.isNaN(peopleNum) && peopleNum < BUSINESS.minimumPeople;
  const paperSuppliesFee = form.paperSupplies
    ? addOnPeopleCount * BUSINESS.paperSuppliesFeePerPerson
    : 0;
  const individuallyWrappedFee = form.individuallyWrapped
    ? addOnPeopleCount * BUSINESS.individuallyWrappedFeePerPerson
    : 0;
  const addOnsTotal = paperSuppliesFee + individuallyWrappedFee;
  const orderSubtotal = subtotal + addOnsTotal;
  const orderTotal = orderSubtotal + deliveryFee;

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
    if (!form.people || Number.isNaN(peopleNum) || !Number.isInteger(peopleNum) || peopleNum < 1)
      next.people = "Enter the number of people.";
    else if (peopleNum > 5000) next.people = "Please call us for orders over 5,000 people.";
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

    if (serviceStatus.suspended) {
      openSuspensionDialog();
      return;
    }

    if (lines.length === 0) {
      toast.warning("Your cart is empty — add menu items before submitting.");
      return;
    }
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const addOnLines = [
      ...(form.paperSupplies
        ? [
            {
              item: "Paper Plates, Serving Spoons, Forks, Napkins",
              selections: [],
              notes: "",
              quantity: peopleNum,
              unitPrice: BUSINESS.paperSuppliesFeePerPerson,
              lineTotal: paperSuppliesFee,
            },
          ]
        : []),
      ...(form.individuallyWrapped
        ? [
            {
              item: "Individually Wrapped Meals",
              selections: [],
              notes: "",
              quantity: peopleNum,
              unitPrice: BUSINESS.individuallyWrappedFeePerPerson,
              lineTotal: individuallyWrappedFee,
            },
          ]
        : []),
    ];

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
        paperSupplies: form.paperSupplies,
        individuallyWrapped: form.individuallyWrapped,
        specialInstructions: form.instructions.trim(),
      },
      cart: [
        ...lines.map((l) => ({
          item: l.name,
          selections: l.selections,
          notes: l.notes,
          quantity: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.unitPrice * l.qty,
        })),
        ...addOnLines,
      ],
      totals: {
        subtotal: orderSubtotal,
        deliveryFee,
        estimatedTotal: orderTotal,
      },
    };

    const order = createDashboardOrder(orderPayload);

    try {
      setIsSubmitting(true);
      const result = await submitOrderToSheets({ data: order });

      if (!result.savedToGoogleSheets) {
        if (result.serviceSuspended && result.serviceStatus) {
          setServiceStatus(result.serviceStatus);
          openSuspensionDialog();
          return;
        }

        saveDashboardOrder(order);
        toast.warning(`Order captured locally only. ${result.reason}`);
        return;
      }

      saveDashboardOrder(order);
      const checkoutResult = await createCheckoutSession({ data: order });

      if (checkoutResult.createdCheckoutSession) {
        toast.success("Order saved. Opening secure Stripe checkout...");
        setForm(EMPTY_FORM);
        clear();
        window.location.assign(checkoutResult.checkoutUrl);
      } else {
        if (checkoutResult.serviceSuspended && checkoutResult.serviceStatus) {
          setServiceStatus(checkoutResult.serviceStatus);
          openSuspensionDialog();
          return;
        }

        toast.error(checkoutResult.reason);
      }
    } catch (error) {
      console.error("Order request submission failed:", error);
      toast.error("We couldn't start checkout. Please try again or call us.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = (id: TextFormField, label: React.ReactNode, input: React.ReactNode) => (
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
                  ? "We received your catering request and sent an email confirmation. Please check your inbox and spam folder. Your card is only authorized for now, and the kitchen will review everything before charging."
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

            <DialogFooter className="justify-center sm:justify-center">
              <Button onClick={closeCheckoutDialog}>Done</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mx-auto max-w-3xl">
        <h2 className="section-title text-center text-3xl">Request an Order</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          Fill out the form and enter payment securely through Stripe. Your card is only authorized
          now and is charged after the kitchen confirms.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          You can also call or text us at{" "}
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
              requiredLabel("Full Name"),
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={80}
              />,
            )}
            {field(
              "phone",
              requiredLabel("Phone"),
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone")(e.target.value)}
                placeholder="xxx-xxx-xxxx"
                autoComplete="tel"
                maxLength={24}
              />,
            )}
          </div>

          {field(
            "email",
            requiredLabel("Email"),
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={254}
            />,
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "eventDate",
              requiredLabel("Event Date"),
              <Input
                id="eventDate"
                type="date"
                value={form.eventDate}
                onChange={(e) => set("eventDate")(e.target.value)}
              />,
            )}
            {field(
              "eventTime",
              requiredLabel("Event Time"),
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
            requiredLabel("Delivery Address"),
            <Input
              id="address"
              value={form.address}
              onChange={(e) => set("address")(e.target.value)}
              placeholder="Street address"
              autoComplete="address-line1"
              maxLength={160}
            />,
          )}

          {field(
            "addressLine2",
            "Delivery Address Line 2",
            <Input
              id="addressLine2"
              value={form.addressLine2}
              onChange={(e) => set("addressLine2")(e.target.value)}
              placeholder="Apartment, suite, floor, company name, etc. (optional)"
              autoComplete="address-line2"
              maxLength={120}
            />,
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              "zipCode",
              requiredLabel("ZIP Code"),
              <Input
                id="zipCode"
                value={form.zipCode}
                onChange={(e) => set("zipCode")(e.target.value)}
                placeholder="xxxxx"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={10}
              />,
            )}
            {field(
              "people",
              requiredLabel("Number of People", ` (minimum ${BUSINESS.minimumPeople})`),
              <Input
                id="people"
                type="number"
                min={1}
                max={5000}
                value={form.people}
                onChange={(e) => set("people")(e.target.value)}
              />,
            )}
          </div>

          {underMinimum && (
            <div className="flex items-start gap-2 rounded-md bg-warning p-3 text-sm text-warning-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Catering orders require a minimum of {BUSINESS.minimumPeople} people.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Optional Add-ons</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="paperSupplies"
                    checked={form.paperSupplies}
                    onCheckedChange={(checked) => setChecked("paperSupplies")(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="paperSupplies" className="cursor-pointer font-semibold">
                      Paper Plates, Serving Spoons, Forks, Napkins
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(BUSINESS.paperSuppliesFeePerPerson)} per person.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="individuallyWrapped"
                    checked={form.individuallyWrapped}
                    onCheckedChange={(checked) =>
                      setChecked("individuallyWrapped")(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="individuallyWrapped" className="cursor-pointer font-semibold">
                      Individually Wrapped Meals
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(BUSINESS.individuallyWrappedFeePerPerson)} per person.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {field(
            "instructions",
            "Special Instructions",
            <Textarea
              id="instructions"
              value={form.instructions}
              onChange={(e) => set("instructions")(e.target.value)}
              placeholder="Allergies, setup notes, gate codes, etc."
              rows={4}
              maxLength={800}
            />,
          )}

          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Menu subtotal ({lines.length} item{lines.length === 1 ? "" : "s"})
              </span>
              <span className="font-semibold">{formatPrice(subtotal)}</span>
            </div>
            {form.paperSupplies && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  Paper supplies ({addOnPeopleCount} x{" "}
                  {formatPrice(BUSINESS.paperSuppliesFeePerPerson)})
                </span>
                <span className="font-semibold">{formatPrice(paperSuppliesFee)}</span>
              </div>
            )}
            {form.individuallyWrapped && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  Individually wrapped meals ({addOnPeopleCount} x{" "}
                  {formatPrice(BUSINESS.individuallyWrappedFeePerPerson)})
                </span>
                <span className="font-semibold">{formatPrice(individuallyWrappedFee)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="font-semibold">{formatPrice(deliveryFee)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-bold">
              <span>Estimated total</span>
              <span className="text-primary">{formatPrice(orderTotal)}</span>
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
