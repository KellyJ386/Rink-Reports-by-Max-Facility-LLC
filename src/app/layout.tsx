import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "RinkReports",
  description: "RinkReports by Max Facility LLC",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "RinkReports" },
  icons: { apple: "/icons/icon-192.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-darkbg text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
