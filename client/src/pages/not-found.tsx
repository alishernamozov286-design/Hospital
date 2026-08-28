import { Link } from "wouter";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="card-premium flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="surface-tint icon-tile mb-5 h-16 w-16 rounded-2xl">
        <Compass className="h-7 w-7 text-primary" />
      </div>
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-primary">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Sahifa topilmadi</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Siz izlagan manzil mavjud emas yoki ko'chirilgan. Bosh sahifadan davom eting.
      </p>
      <Button asChild className="mt-6">
        <Link href="/home">
          <Home className="mr-2 h-4 w-4" />
          Bosh sahifaga
        </Link>
      </Button>
    </div>
  );
}
