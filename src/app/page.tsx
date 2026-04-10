import Link from "next/link";
import Image from "next/image";
import { QrCode, LayoutDashboard, Truck, UtensilsCrossed } from "lucide-react";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-red-50 via-white to-red-50/30 p-6">
      <Image
        src="/images/sushi-3.png"
        alt=""
        width={380}
        height={480}
        className="pointer-events-none absolute -right-16 top-8 opacity-[0.06] select-none"
        priority
      />
      <Image
        src="/images/sushi-1.png"
        alt=""
        width={260}
        height={260}
        className="pointer-events-none absolute -left-12 bottom-4 opacity-[0.07] select-none"
      />

      <div className="relative z-10 w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20 shadow-lg shadow-primary/10">
            <UtensilsCrossed className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Sushi Service</h1>
          <p className="text-muted-foreground">
            Programa de fidelidad — registra tu visita y gana premios
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/check-in"
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-primary text-primary-foreground text-lg font-medium transition-all hover:bg-primary/90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
          >
            <QrCode className="h-5 w-5" />
            Registrar Visita
          </Link>

          <Link
            href="/dashboard"
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-border text-lg font-medium transition-all hover:bg-muted/80 backdrop-blur-sm bg-white/70"
          >
            <LayoutDashboard className="h-5 w-5" />
            Panel Admin
          </Link>
        </div>

        <div className="pt-4 text-xs text-muted-foreground">
          <p>Escanea el QR en la mesa para registrar tu visita</p>
          <p className="mt-1 flex items-center justify-center gap-1">
            <Truck className="h-3 w-3" />
            Domicilios se registran automáticamente vía WhatsApp
          </p>
        </div>
      </div>
    </div>
  );
}
