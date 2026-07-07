import { Phone, MapPin } from "lucide-react";
import { BUSINESS } from "@/data/menu";
import logoUrl from "@/assets/logo.png?url";

export function Footer() {
  return (
    <footer
      id="contact"
      className="scroll-mt-20 border-t border-border bg-primary text-primary-foreground"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <img
              src={logoUrl}
              alt=""
              aria-hidden="true"
              className="h-10 w-10 rounded-full bg-primary-foreground/90 object-contain p-0.5"
            />
            <p className="font-display text-lg">{BUSINESS.name}</p>
          </div>
          <p className="mt-3 text-sm text-primary-foreground/80">{BUSINESS.about}</p>
        </div>

        <div>
          <h3 className="font-display text-base">Contact</h3>
          <ul className="mt-3 space-y-2 text-sm text-primary-foreground/85">
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" />
              <a href={BUSINESS.phoneHref} className="hover:underline">
                Call / Text {BUSINESS.phone}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              {BUSINESS.location}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/15 px-4 py-4 text-center text-xs text-primary-foreground/70">
        © {new Date().getFullYear()} {BUSINESS.name}. Family-owned since 2019.
      </div>
    </footer>
  );
}
