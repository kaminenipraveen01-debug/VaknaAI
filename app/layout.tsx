import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vakna AI — Your Intelligent Assistant",
  description: "Powerful AI assistant by PraveenKumar Kamineni. Chat, generate images, translate and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
