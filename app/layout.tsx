import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoMail",
  description:
    "Two-way email relay with moderation and notifications. Send a message, get replies back in the UI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
