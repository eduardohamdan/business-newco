import type { Metadata, Viewport } from "next";
import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: "Em 15 minutos você sabe onde sua empresa está. Em 5 minutos por semana, você faz ela evoluir.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: BRAND.themeColor, width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
