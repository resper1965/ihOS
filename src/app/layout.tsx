import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ihOS — Ionic Health OS",
  description:
    "Compliance intelligence platform. Automate GRC assessments, manage frameworks, and maintain continuous compliance with AI-powered analysis.",
  icons: { icon: "/ionic-icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${plusJakartaSans.variable} dark`}>
      <body className="min-h-screen bg-bg-dark text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
