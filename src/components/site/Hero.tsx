import { Phone, Truck, Users, Clock, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/data/menu";
import logoReferenceUrl from "@/assets/logo-reference.png?url";

const INFO_CARDS = [
  {
    icon: Truck,
    title: "Delivery Only — $30",
    text: "Flat delivery fee added to every catering order.",
  },
  {
    icon: Users,
    title: "Minimum 10 People",
    text: "Catering orders serve a minimum of 10 guests.",
  },
  {
    icon: Clock,
    title: "6 Hours Advance Notice",
    text: "Please place orders at least 6 hours ahead.",
  },
  {
    icon: Package,
    title: "Individually Wrapped Meals",
    text: `Any meal can be individually wrapped — ${BUSINESS.wrappedRange}.`,
  },
];

export function Hero() {
  return (
    <section id="top" className="px-4 pt-10 pb-8 sm:pt-14">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card/95 p-6 text-center shadow-sm sm:p-10">
          <img
            src={logoReferenceUrl}
            alt="Blue Nile Mediterranean Grill logo"
            className="mx-auto mb-4 w-full max-w-md object-contain"
          />
          <h1 className="section-title text-3xl sm:text-4xl">
            <span>Let’s cater for your next event.</span>
            <br />
            <span>We will bring the party to you!</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {BUSINESS.about}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a href="#menu">Browse Catering Menu</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={BUSINESS.phoneHref}>
                <Phone className="h-4 w-4" />
                Call / Text {BUSINESS.phone}
              </a>
            </Button>
          </div>
        </div>

        <ul className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INFO_CARDS.map((card) => (
            <li
              key={card.title}
              className="rounded-xl border border-border bg-card/95 p-4 text-center shadow-sm"
            >
              <card.icon className="mx-auto h-6 w-6 text-accent" aria-hidden="true" />
              <h3 className="mt-2 text-sm font-bold text-primary">{card.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{card.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
