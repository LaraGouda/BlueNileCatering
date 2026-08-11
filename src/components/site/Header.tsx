import { useState } from "react";
import { Mail, Menu, Phone, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CustomerOrdersDialog } from "@/components/site/CustomerOrdersDialog";
import { BUSINESS } from "@/data/menu";
import { useCart } from "@/lib/cart-context";
import logoUrl from "@/assets/logo.png?url";

const CATERING_EMAIL = "evette@bluenilecatering.net";
const WEBSITE_EMAILS = ["lara@bluenilecatering.net", "laragoudaw@gmail.com"];
const NAV_ITEM_CLASS =
  "text-sm font-medium text-foreground/80 transition-colors hover:text-primary";

const NAV_ITEMS = [
  { type: "link", href: "/#menu", label: "Menu" },
  { type: "contact", label: "Contact" },
  { type: "link", href: "/policies-and-procedures", label: "Policies" },
];

export function Header() {
  const { itemCount, setOpen } = useCart();
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openContactDialog = () => {
    setMobileNavOpen(false);
    setContactDialogOpen(true);
  };

  const openOrdersDialog = () => {
    setMobileNavOpen(false);
    setOrdersDialogOpen(true);
  };

  const openCart = () => {
    setMobileNavOpen(false);
    setOpen(true);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:flex sm:justify-between">
        <a href="/#top" className="flex min-w-0 items-center gap-2.5">
          <img
            src={logoUrl}
            alt="Blue Nile Mediterranean Grill palm tree logo"
            className="h-11 w-11 shrink-0 object-contain"
          />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-lg font-semibold text-primary">Blue Nile</p>
            <p className="truncate text-xs tracking-wide text-muted-foreground">
              Mediterranean Grill · Catering
            </p>
          </div>
        </a>

        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-5 md:flex" aria-label="Main navigation">
            {NAV_ITEMS.map((item) =>
              item.type === "link" ? (
                <a key={item.href} href={item.href} className={NAV_ITEM_CLASS}>
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={openContactDialog}
                  className={`${NAV_ITEM_CLASS} cursor-pointer`}
                >
                  {item.label}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={openOrdersDialog}
              className={`${NAV_ITEM_CLASS} cursor-pointer`}
            >
              My Orders
            </button>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={openCart} aria-label="Open cart">
              <ShoppingBasket className="h-4 w-4" />
              Cart
              {itemCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground">
                  {itemCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-2xl text-primary">Blue Nile</SheetTitle>
            <SheetDescription>Main navigation</SheetDescription>
          </SheetHeader>

          <nav className="mt-8 flex flex-col gap-2" aria-label="Mobile navigation">
            <a
              href="/#top"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-md px-3 py-2 text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-primary"
            >
              Main Page
            </a>
            {NAV_ITEMS.map((item) =>
              item.type === "link" ? (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-md px-3 py-2 text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-primary"
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={openContactDialog}
                  className="rounded-md px-3 py-2 text-left text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-primary"
                >
                  {item.label}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={openOrdersDialog}
              className="rounded-md px-3 py-2 text-left text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-primary"
            >
              My Orders
            </button>
            <button
              type="button"
              onClick={openCart}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-primary"
            >
              <ShoppingBasket className="h-4 w-4" />
              Cart
              {itemCount > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground">
                  {itemCount}
                </span>
              )}
            </button>
          </nav>
        </SheetContent>
      </Sheet>
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="overflow-hidden bg-card p-0 [&>button]:text-white [&>button]:opacity-100 [&>button:hover]:bg-white/10 [&>button:hover]:text-white sm:max-w-md">
          <DialogHeader className="bg-primary px-6 pb-6 pt-7 text-primary-foreground">
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 rounded-full bg-primary-foreground/95 object-contain p-1"
              />
              <div>
                <DialogTitle className="font-display text-2xl">Contact Blue Nile</DialogTitle>
                <DialogDescription className="text-primary-foreground/80">
                  Catering inquiries and website support.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 px-6 py-6">
            <section className="space-y-3">
              <h3 className="font-display text-base text-primary">Catering Inquiries</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={BUSINESS.phoneHref}
                    className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 font-medium transition-colors hover:border-primary/35 hover:bg-secondary"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Phone className="h-4 w-4" />
                    </span>
                    <span>Call or text {BUSINESS.phone}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${CATERING_EMAIL}`}
                    className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 font-medium transition-colors hover:border-primary/35 hover:bg-secondary"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Mail className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 break-all">{CATERING_EMAIL}</span>
                  </a>
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="font-display text-base text-primary">Website Support</h3>
              <ul className="space-y-2 text-sm">
                {WEBSITE_EMAILS.map((email) => (
                  <li key={email}>
                    <a
                      href={`mailto:${email}`}
                      className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 font-medium transition-colors hover:border-primary/35 hover:bg-secondary"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Mail className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 break-all">{email}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <CustomerOrdersDialog open={ordersDialogOpen} onOpenChange={setOrdersDialogOpen} />
    </header>
  );
}
