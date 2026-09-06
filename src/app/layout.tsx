import type { Metadata } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getBrandingForHost } from "@/lib/branding-server";
import { BrandingProvider } from "@/lib/branding-context";
import { brandCssVars } from "@/lib/brand-css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBrandingForHost();
  return {
    title: `${branding.name} — ${branding.tagline}`,
    description: branding.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await getBrandingForHost();
  return (
    // `style` lleva SOLO las variables `--brand-*` que este tenant cambió (§5/§6).
    // Un tenant sin marca propia recibe `{}` y hereda el `:root` de globals.css,
    // que son los valores del sistema de diseño de siempre. Va en <html> y no en
    // <body> para que también alcance a los portales que montan fuera del body
    // principal (los toasts de sonner, por ejemplo).
    <html
      lang="es"
      className={`${inter.variable} ${playfair.variable} ${geistMono.variable} h-full antialiased`}
      style={brandCssVars(branding)}
    >
      <body className="min-h-full flex flex-col">
        <BrandingProvider value={branding}>{children}</BrandingProvider>
      </body>
    </html>
  );
}
