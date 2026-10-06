"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import axios from "axios";
import { ACCESS_TOKEN_KEY, ACCESS_TOKEN_USER_KEY, clearStoredAccessToken } from "@/shared/lib/logout";

function OAuthTokenBootstrap() {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status === "unauthenticated") {
      clearStoredAccessToken();
      return;
    }
    if (status !== "authenticated" || !userId) return;
    // 같은 사용자의 토큰이 이미 있을 때만 재발급 생략 (계정 전환 시 이전 사용자 토큰 재사용 방지)
    if (localStorage.getItem(ACCESS_TOKEN_KEY) && localStorage.getItem(ACCESS_TOKEN_USER_KEY) === userId) return;

    axios.post<{ accessToken: string }>("/api/auth/token")
      .then(({ data }) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        localStorage.setItem(ACCESS_TOKEN_USER_KEY, userId);
      })
      .catch(() => { /* ignore */ });
  }, [status, userId]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <OAuthTokenBootstrap />
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
