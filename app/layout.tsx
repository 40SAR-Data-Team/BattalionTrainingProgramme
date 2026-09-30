import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Training Programme",
  description: "40SAR company training programmes, synced with Google Calendar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
