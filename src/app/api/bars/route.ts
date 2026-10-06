import { NextRequest, NextResponse } from "next/server";
import { sanitizeImageUrl } from "@/shared/lib/safeUrl";
import { prisma } from "@/shared/lib/prisma";
import { getUserId } from "@/server/auth/getUser";
import { checkPublicRead, PUBLIC_CACHE_CONTROL } from "@/shared/lib/rateLimit";

export async function GET(req: NextRequest) {
  try {
    const isAnon = !(await getUserId(req));
    const limited = await checkPublicRead(req, isAnon);
    if (limited) return limited;
    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area")?.slice(0, 100);
    const mood = searchParams.get("mood")?.slice(0, 30);

    const bars = await prisma.bar.findMany({
      where: {
        ...(area ? { area: { contains: area, mode: "insensitive" } } : {}),
        ...(mood ? { moodTags: { has: mood } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(
      bars.map((b) => ({ ...b, imageUrl: sanitizeImageUrl(b.imageUrl) })),
      { headers: isAnon ? { "Cache-Control": PUBLIC_CACHE_CONTROL, Vary: "Cookie, Authorization" } : { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[bars GET]", error);
    return NextResponse.json({ error: "바 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}
