import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ihOS — Ionic Health OS",
  description:
    "Compliance intelligence platform. Automate GRC assessments, manage frameworks, and maintain continuous compliance with AI-powered analysis.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-bg-dark text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
