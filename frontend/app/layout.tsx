import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "MediTrace — AI Clinical Note Engine",
  description:
    "AI-powered clinical note structuring for private clinics in Pakistan. Upload messy records, get structured intelligence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-inter antialiased bg-gray-950 text-gray-100 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
