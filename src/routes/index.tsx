import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { MenuSection } from "@/components/site/MenuSection";
import { OrderRequestForm } from "@/components/site/OrderRequestForm";
import { CartSheet } from "@/components/site/CartSheet";
import { Footer } from "@/components/site/Footer";
import { ServiceSuspensionBanner } from "@/components/site/ServiceSuspensionBanner";
import cateringBgUrl from "@/assets/catering-bg.png?url";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
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
      <main>
        <Hero />
        <MenuSection />
        <OrderRequestForm />
      </main>
      <Footer />
      <CartSheet />
    </div>
  );
}
