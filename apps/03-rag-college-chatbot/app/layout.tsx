import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#090d16",
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`),
  title: "CollegeAI - RAG-Based Campus Information Assistant",
  description:
    "AI-powered college chatbot using Retrieval-Augmented Generation (RAG) to provide verified, grounded answers strictly from official college documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="flex flex-col min-h-screen min-h-[100dvh] antialiased bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white overflow-x-hidden">
        <Providers>
          <Navbar />
          <main className="flex-1 flex flex-col w-full">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
