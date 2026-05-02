import Link from "next/link";
import { QrCode, LayoutDashboard, UtensilsCrossed, Sparkles } from "lucide-react";
import { BRAND_NAME } from "@/lib/branding";

export default function Home() {
  return (
    <div className="premium-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      {/* Orb decorativo de fondo */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-[480px] w-[480px] rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, #FF4D6D 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-[360px] w-[360px] rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, #E63946 0%, transparent 70%)" }}
      />

      <div className="animate-fade-in-up relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-5 text-center">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)",
              boxShadow: "0 8px 28px rgba(230, 57, 70, 0.30)",
            }}
          >
            <UtensilsCrossed className="h-9 w-9 text-white" strokeWidth={1.25} />
          </div>

          <div>
            <h1
              className="font-playfair text-[2.25rem] font-bold leading-tight"
              style={{ color: "#1a1c1d", letterSpacing: "-0.02em" }}
            >
              {BRAND_NAME}
            </h1>
            <p
              className="mt-2 text-sm font-medium"
              style={{ color: "#9ca3af", letterSpacing: "0.01em" }}
            >
              Programa de fidelidad
            </p>
          </div>
        </div>

        {/* Card central */}
        <div className="premium-card p-6 space-y-3">
          {/* Badge */}
          <div className="flex justify-center mb-5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
              style={{
                background: "rgba(255, 77, 109, 0.08)",
                color: "#E63946",
                letterSpacing: "0.05em",
              }}
            >
              <Sparkles className="h-3 w-3" strokeWidth={1.5} />
              Registra y gana premios
            </span>
          </div>

          {/* CTA principal */}
          <Link
            href="/check-in"
            className="btn-premium flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl text-base font-semibold"
            style={{ letterSpacing: "-0.01em" }}
          >
            <QrCode className="h-4 w-4" strokeWidth={1.5} />
            Registrar Visita
          </Link>

          {/* CTA secundario */}
          <Link
            href="/dashboard"
            className="btn-secondary-premium flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl text-sm font-medium"
            style={{ color: "#6b7280", letterSpacing: "-0.01em" }}
          >
            <LayoutDashboard className="h-4 w-4" strokeWidth={1.5} />
            Panel Admin
          </Link>
        </div>

        {/* Footer */}
        <p
          className="mt-6 text-center text-xs"
          style={{ color: "#d1d5db" }}
        >
          Escanea el QR en tu mesa para registrar tu visita
        </p>
      </div>
    </div>
  );
}
