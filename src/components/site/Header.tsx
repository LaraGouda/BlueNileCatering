import { ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import logoUrl from "@/assets/logo.png?url";

const NAV_LINKS = [
  { href: "#menu", label: "Menu" },
  { href: "#order", label: "Order Request" },
  { href: "#contact", label: "Contact" },
];

export function Header() {
  const { itemCount, setOpen } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:flex sm:justify-between">
        <a href="#top" className="flex min-w-0 items-center gap-2.5">
          <img
            src={logoUrl}
            alt="Blue Nile Mediterranean Grill palm tree logo"
            className="h-11 w-11 shrink-0 object-contain"
          />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-lg font-semibold text-primary">
              Blue Nile
            </p>
            <p className="truncate text-xs tracking-wide text-muted-foreground">
              Mediterranean Grill · Catering
            </p>
          </div>
        </a>

        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-5 md:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Button size="sm" onClick={() => setOpen(true)} aria-label="Open cart">
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
    </header>
  );
}
