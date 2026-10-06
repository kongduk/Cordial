import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/server/auth/getUser";
import { prisma } from "@/shared/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pantry: true },
    });
    return NextResponse.json({ pantry: user?.pantry ?? [] });
  } catch (error) {
    console.error("[pantry GET]", error);
    return NextResponse.json({ error: "술장 정보를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await req.json() as { pantry: unknown };
    if (!Array.isArray(body.pantry) || body.pantry.length > 200 || !body.pantry.every(i => typeof i === "string" && i.length <= 100)) {
      return NextResponse.json({ error: "pantry는 문자열 배열이어야 합니다." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { pantry: body.pantry as string[] },
      select: { pantry: true },
    });

    return NextResponse.json({ pantry: updated.pantry });
  } catch (error) {
    console.error("[pantry PUT]", error);
    return NextResponse.json({ error: "술장 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
