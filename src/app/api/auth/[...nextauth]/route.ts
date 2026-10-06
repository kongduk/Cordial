import NextAuth from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import NaverProvider from "next-auth/providers/naver";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/shared/lib/prisma";
import { allowByKey, getClientIp } from "@/shared/lib/rateLimit";

// 존재하지 않는 계정에도 bcrypt 비용을 동일하게 지불해 타이밍 차이로 계정 존재 여부를 알 수 없게 함
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = bcrypt.hash("cordial-dummy-password", 12);
  return dummyHash;
}

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    NaverProvider({
      clientId: process.env.NAVER_CLIENT_ID!,
      clientSecret: process.env.NAVER_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials) return null;
        const { email: rawEmail, password } = credentials;
        if (typeof rawEmail !== "string" || typeof password !== "string") return null;
        const email = rawEmail.trim().toLowerCase();
        if (!email || email.length > 254 || !password || Buffer.byteLength(password) > 72) return null;

        // 계정 단위 + IP 단위 무차별 대입 방어 (계정 15분당 10회 / IP 15분당 30회, 키 접두사로 분리)
        const rawHeaders = req?.headers ?? {};
        const headerValue = (name: string): string | null => {
          const v = (rawHeaders as Record<string, unknown>)[name];
          return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
        };
        const ip = getClientIp({ headers: { get: headerValue } });
        if (!(await allowByKey("login-ip", `ip:${ip}`))) return null;
        if (!(await allowByKey("login", `email:${email}`))) return null;

        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });
        const valid = await bcrypt.compare(password, user?.password ?? (await getDummyHash()));
        if (!user || !user.password || !valid) return null;
        return { id: user.id, email: user.email, name: user.name } as { id: string; email: string | null; name: string | null };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  // @ts-expect-error trustHost exists at runtime but missing from v4 types
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = (token.id ?? token.sub) as string;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
