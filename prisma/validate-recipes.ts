/**
 * 기존 칵테일 레시피 검증 스크립트
 * 실행: npx ts-node --project tsconfig.json prisma/validate-recipes.ts
 * 또는: npx tsx prisma/validate-recipes.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const VALIDATE_PROMPT = `당신은 IBA 공인 바텐더입니다. 칵테일 레시피의 정확성을 검증하세요.

다음 정보를 검토하여 JSON으로 반환하세요:
{
  "correct": true/false,
  "score": 0~10 (정확도),
  "issues": ["발견된 문제점 목록"],
  "suggestions": ["개선 제안 목록"]
}

검토 항목:
- 잔(glassType)이 이 칵테일에 적합한지
- 제조법(method)이 올바른지 (예: 마르티니는 stirring, 다이키리는 shaking)
- 재료 조합이 해당 칵테일의 표준에 맞는지
- ABV가 합리적인 범위인지

반드시 JSON만 반환하세요.`;

interface ValidationResult {
  cocktailId: string;
  name: string;
  correct: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
}

async function validateCocktail(cocktail: {
  id: string;
  name: string;
  method: string | null;
  glassType: string | null;
  abv: number;
  ingredients: { ingredient: { name: string }; amount: string | null }[];
}): Promise<ValidationResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: VALIDATE_PROMPT,
    generationConfig: { responseMimeType: "application/json" },
  });

  const ingList = cocktail.ingredients
    .map(ci => `${ci.ingredient.name} ${ci.amount ?? ""}`)
    .join(", ");

  const prompt = `칵테일명: ${cocktail.name}
제조법: ${cocktail.method ?? "없음"}
잔: ${cocktail.glassType ?? "없음"}
재료: ${ingList}
ABV: ${cocktail.abv}%

이 레시피를 검증해주세요.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(clean) as Record<string, unknown>;

    return {
      cocktailId: cocktail.id,
      name: cocktail.name,
      correct: Boolean(parsed.correct),
      score: Number(parsed.score ?? 5),
      issues: Array.isArray(parsed.issues) ? parsed.issues as string[] : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions as string[] : [],
    };
  } catch {
    return {
      cocktailId: cocktail.id,
      name: cocktail.name,
      correct: true,
      score: 5,
      issues: ["검증 실패 (AI 오류)"],
      suggestions: [],
    };
  }
}

async function main() {
  console.log("=== 칵테일 레시피 검증 시작 ===\n");

  const cocktails = await prisma.cocktail.findMany({
    where: { isCustom: false },
    include: { ingredients: { include: { ingredient: true } } },
  });

  console.log(`총 ${cocktails.length}개 칵테일 검증 중...\n`);

  const results: ValidationResult[] = [];
  const issues: ValidationResult[] = [];

  for (const cocktail of cocktails) {
    process.stdout.write(`검증 중: ${cocktail.name}... `);
    const result = await validateCocktail(cocktail);
    results.push(result);

    if (!result.correct || result.score < 7) {
      issues.push(result);
      console.log(`❌ (점수: ${result.score}/10)`);
    } else {
      console.log(`✅ (점수: ${result.score}/10)`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n=== 검증 결과 요약 ===\n");
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  console.log(`평균 점수: ${avgScore.toFixed(1)}/10`);
  console.log(`문제 없음: ${results.filter(r => r.correct && r.score >= 7).length}개`);
  console.log(`개선 필요: ${issues.length}개\n`);

  if (issues.length > 0) {
    console.log("=== 개선 필요 칵테일 ===\n");
    for (const issue of issues) {
      console.log(`📋 ${issue.name} (점수: ${issue.score}/10)`);
      if (issue.issues.length > 0) {
        console.log("  문제점:");
        issue.issues.forEach(i => console.log(`    - ${i}`));
      }
      if (issue.suggestions.length > 0) {
        console.log("  제안:");
        issue.suggestions.forEach(s => console.log(`    → ${s}`));
      }
      console.log();
    }
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
