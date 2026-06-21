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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const saved = localStorage.getItem("darkMode");
                  const isDark = saved !== null ? saved === "true" : true;
                  if (isDark) {
                    document.documentElement.classList.add("dark");
                    document.documentElement.classList.remove("light");
                  } else {
                    document.documentElement.classList.add("light");
                    document.documentElement.classList.remove("dark");
                  }
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg-dark text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
