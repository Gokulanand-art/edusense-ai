"use client";

import { SessionProvider } from "next-auth/react";
import React from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath="/api/auth">{children}</SessionProvider>;
}
