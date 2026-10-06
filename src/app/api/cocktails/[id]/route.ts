import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { getUserId } from "@/server/auth/getUser";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const cocktail = await prisma.cocktail.findUnique({
      where: { id },
      include: {
        ingredients: {
          include: { ingredient: true },
        },
      },
    });

    if (!cocktail) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 커스텀 칵테일은 작성자 본인만 조회 가능 (IDOR 방지)
    // (createdBy null === 비로그인 uid null 우회 방지)
    const uid = cocktail.isCustom ? await getUserId(req) : null;
    if (cocktail.isCustom && (!uid || cocktail.createdBy !== uid)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(cocktail);
  } catch (error) {
    console.error("[cocktail detail]", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
