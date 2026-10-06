import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function GET(req: NextRequest) {
  try {
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

    return NextResponse.json(bars);
  } catch (error) {
    console.error("[bars GET]", error);
    return NextResponse.json({ error: "바 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}
