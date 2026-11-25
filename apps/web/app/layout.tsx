import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Business Evolution OS", template: "%s · Business Evolution OS" },
  description: "Em 15 minutos você sabe onde sua empresa está. Em 5 minutos por semana, você faz ela evoluir.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#12263a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
