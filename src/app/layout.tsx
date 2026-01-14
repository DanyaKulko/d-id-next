import type { Metadata } from "next";
import "./globals.css";
import Local from "next/font/local";

const nasalization = Local({
  src: "../assets/fonts/Nasalization_regular.otf",
  variable: "--font-nasalization-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Neil avatar",
  description: "AI-powered avatars for personalized interactions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${nasalization.variable}`}>{children}</body>
    </html>
  );
}
