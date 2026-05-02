import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const securityHeaders = [
      // Previene click-jacking (ajustar a 'none' si no embebes en iframes)
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      // MIME-type sniffing off
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Forzar HTTPS (1 año + subdominios)
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      // No enviar referer cross-origin con path/query
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Limita permisos del navegador
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
      // CSP básico — ajusta frame-ancestors según si embebes dashboard en otro sitio
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ]
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
