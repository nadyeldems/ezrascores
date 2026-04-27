import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Esra Scores",
  description: "A lightweight football scores app made with love by Daddy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
