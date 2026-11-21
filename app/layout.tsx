import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["500", "600", "700"] });
const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AegisHolo Health",
  description:
    "Private, hybrid-AI health vault: on-device redaction with Gemini Nano, grounded cloud research with Gemini, and a 3D holographic What-If simulator.",
};

export const viewport: Viewport = {
  themeColor: "#030811",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${chakra.variable} ${hanken.variable} ${jetbrains.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
