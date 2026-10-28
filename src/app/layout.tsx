import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pretty Smart",
  description: "Pretty looks. Smart picks. Try any look on your own face, find the lipstick, blush, hair color and brows that match it, proven on your face, and save while you play. Built on YouCam APIs.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
