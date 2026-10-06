"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import api from "@/shared/lib/api";
import { getApiErrorMessage } from "@/shared/lib/apiError";
import { useRouter } from "next/navigation";
import { WebNav } from "@/shared/ui/WebNav";
import { GlassSilhouette } from "@/shared/ui/GlassSilhouette";
import { W, T } from "@/shared/lib/theme";

const Q2_OPTIONS = ["비 오는 창가", "늦은 저녁의 부엌", "도시의 야경", "조용한 서재"] as const;
const Q3_CHIPS = ["산뜻한 시트러스", "깊은 단맛", "약간의 쓴맛", "허브향", "드라이한 끝맛", "플로럴"] as const;
const Q4_HINTS = ["평온", "약간 들뜸", "아련함", "여유롭게"] as const;
const CAPACITY_OPTIONS: { value: Capacity; label: string; sub: string }[] = [
  { value: "VERY_LOW",  label: "거의 못 마셔요", sub: "소주 1~2잔이면 충분해요 · 쉽게 취하는 편" },
  { value: "LOW",       label: "가볍게 한 잔",   sub: "소주 반 병 정도 · 조금씩 천천히 즐겨요" },
  { value: "MEDIUM",    label: "적당히 즐겨요",  sub: "소주 1병 내외 · 보통 정도예요" },
  { value: "HIGH",      label: "꽤 마시는 편",   sub: "소주 1~2병 · 잘 마시는 편이에요" },
  { value: "VERY_HIGH", label: "주량이 강해요",  sub: "소주 2병 이상 · 웬만해선 안 취해요" },
];

const Q4_MIN_LENGTH = 5;
const Q4_SHORT_HINT = "5자 이상 적어주시거나 비워두세요";

type Q2Option = (typeof Q2_OPTIONS)[number];
type Q3Chip = (typeof Q3_CHIPS)[number];
type Capacity = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

interface StepContentProps {
  theme: "dark" | "light";
  step: number;
  q1Value: number;
  setQ1Value: (v: number) => void;
  q2Selected: Q2Option | null;
  setQ2Selected: (v: Q2Option | null) => void;
  q2Other: string;
  setQ2Other: (v: string) => void;
  q3Selected: Set<Q3Chip>;
  toggleQ3: (chip: Q3Chip) => void;
  q3Other: string;
  setQ3Other: (v: string) => void;
  q4Text: string;
  setQ4Text: (v: string) => void;
  drinkingCapacity: Capacity | null;
  setDrinkingCapacity: (v: Capacity) => void;
  error: string | null;
  setError: (v: string | null) => void;
}

function StepContent({
  theme, step,
  q1Value, setQ1Value,
  q2Selected, setQ2Selected,
  q2Other, setQ2Other,
  q3Selected, toggleQ3,
  q3Other, setQ3Other,
  q4Text, setQ4Text,
  drinkingCapacity, setDrinkingCapacity,
  error, setError,
}: StepContentProps) {
  const dark = theme === "dark";
  const accent = T.accent;
  const txt = dark ? T.darkText : W.text;
  const txtMuted = dark ? T.darkTextMuted : W.textMuted;
  const txtFaint = dark ? T.darkTextFaint : W.textFaint;
  const surface = dark ? T.darkSurface : W.surface;
  const border1 = dark ? T.darkBorder : W.border;
  const borderS = dark ? T.darkBorderStrong : W.borderStrong;
  const bg = dark ? T.darkBg : W.bg;
  const q4Short = q4Text.trim().length > 0 && q4Text.trim().length < Q4_MIN_LENGTH;
  const sans = T.sans;
  const mono = T.mono;

  if (step === 1) return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.6, color: accent, marginBottom: 14 }}>QUESTION 01</div>
      <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.35, margin: "0 0 10px", color: txt }}>
        오늘 하루,<br />마음의 톤은 어떤가요?
      </h2>
      <p style={{ fontSize: 13, color: txtMuted, lineHeight: 1.6, letterSpacing: -0.2, marginBottom: 48, marginTop: 0 }}>
        정확하지 않아도 괜찮아요. 가까운 쪽으로 옮겨주세요.
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 22, fontSize: 13, fontWeight: 500 }}>
        <span style={{ color: txtMuted }}>차분함</span>
        <span style={{ color: txtMuted }}>활기참</span>
      </div>
      <div style={{ position: "relative", height: 4, background: border1, borderRadius: 2 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${q1Value}%`, background: accent, borderRadius: 2 }} />
        <input
          type="range" min={0} max={100} value={q1Value}
          onChange={e => setQ1Value(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", height: "100%", margin: 0 }}
        />
        <div style={{
          position: "absolute", left: `${q1Value}%`, top: "50%", transform: "translate(-50%,-50%)",
          width: 26, height: 26, borderRadius: 13,
          background: txt, boxShadow: `0 0 0 4px ${bg},0 4px 16px rgba(184,135,82,0.4)`, pointerEvents: "none",
        }} />
      </div>
      <div style={{ marginTop: 24, fontSize: 13, color: txtFaint, textAlign: "center", fontFamily: mono, letterSpacing: 0.3 }}>
        {q1Value < 30 ? "매우 차분한" : q1Value < 50 ? "조금 가라앉은" : q1Value < 70 ? "보통인" : "활기찬"} · {q1Value}
      </div>
    </div>
  );

  if (step === 2) return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.6, color: accent, marginBottom: 14 }}>QUESTION 02</div>
      <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.35, margin: "0 0 10px", color: txt }}>
        지금 가장<br />가까운 풍경은?
      </h2>
      <p style={{ fontSize: 13, color: txtMuted, lineHeight: 1.6, letterSpacing: -0.2, marginBottom: 28, marginTop: 0 }}>
        지금 이 순간 떠오르는 장면을 고르세요.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {Q2_OPTIONS.map(opt => (
          <button key={opt} onClick={() => { setQ2Selected(opt); setQ2Other(""); setError(null); }} style={{
            padding: "20px 18px", borderRadius: 14,
            background: q2Selected === opt ? txt : surface,
            color: q2Selected === opt ? bg : txt,
            border: q2Selected === opt ? "none" : `0.5px solid ${border1}`,
            fontSize: 14, fontWeight: 500, letterSpacing: -0.2,
            cursor: "pointer", textAlign: "left", fontFamily: sans, transition: "all 0.15s",
          }}>{opt}</button>
        ))}
        <div style={{
          gridColumn: "1 / -1", borderRadius: 14, overflow: "hidden",
          border: `0.5px solid ${q2Other ? accent : border1}`, background: surface,
        }}>
          <input
            type="text"
            placeholder="기타 — 직접 입력"
            value={q2Other}
            maxLength={40}
            onChange={e => { setQ2Other(e.target.value); if (e.target.value) { setQ2Selected(null); setError(null); } }}
            style={{
              width: "100%", padding: "18px", background: "transparent", border: "none", outline: "none",
              fontSize: 14, color: txt, fontFamily: sans, letterSpacing: -0.2, boxSizing: "border-box",
            }}
          />
        </div>
      </div>
      {error && <p style={{ marginTop: 16, color: accent, fontSize: 13, letterSpacing: -0.1 }}>{error}</p>}
    </div>
  );

  if (step === 3) return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.6, color: accent, marginBottom: 14 }}>QUESTION 03</div>
      <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.35, margin: "0 0 10px", color: txt }}>
        오늘 어울리는<br />맛은 어떤가요?
      </h2>
      <p style={{ fontSize: 13, color: txtMuted, lineHeight: 1.6, letterSpacing: -0.2, marginBottom: 28, marginTop: 0 }}>
        여러 개 골라도 괜찮아요.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {Q3_CHIPS.map(chip => {
          const sel = q3Selected.has(chip);
          return (
            <button key={chip} onClick={() => toggleQ3(chip)} style={{
              padding: "12px 18px", borderRadius: 100,
              background: sel ? accent : "transparent",
              border: `0.5px solid ${sel ? accent : borderS}`,
              color: sel ? bg : txtMuted,
              fontSize: 13, fontWeight: sel ? 600 : 500, letterSpacing: -0.1,
              cursor: "pointer", fontFamily: sans, transition: "all 0.15s",
            }}>{chip}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 12, borderRadius: 100, overflow: "hidden", border: `0.5px solid ${q3Other ? accent : borderS}`, background: "transparent" }}>
        <input
          type="text"
          placeholder="기타 — 직접 입력 (예: 스모키한, 우디한)"
          value={q3Other}
          maxLength={40}
          onChange={e => { setQ3Other(e.target.value); if (e.target.value) setError(null); }}
          style={{
            width: "100%", padding: "12px 18px", background: "transparent", border: "none", outline: "none",
            fontSize: 13, color: q3Other ? (dark ? T.darkText : W.text) : txtMuted,
            fontFamily: sans, letterSpacing: -0.1, boxSizing: "border-box",
          }}
        />
      </div>
      {error && <p style={{ marginTop: 16, color: accent, fontSize: 13, letterSpacing: -0.1 }}>{error}</p>}
    </div>
  );

  if (step === 4) return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.6, color: accent, marginBottom: 14 }}>QUESTION 04</div>
      <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.35, margin: "0 0 10px", color: txt }}>
        오늘 하루를<br />한 줄로 적어주세요.
      </h2>
      <p style={{ fontSize: 13, color: txtMuted, lineHeight: 1.6, letterSpacing: -0.2, marginBottom: 24, marginTop: 0 }}>
        짧아도, 길어도 괜찮아요. 비워둬도 돼요.
      </p>
      <div style={{ background: surface, border: `0.5px solid ${borderS}`, borderRadius: 14, padding: "18px", minHeight: 140 }}>
        <textarea
          value={q4Text}
          onChange={e => setQ4Text(e.target.value)}
          maxLength={200}
          style={{
            width: "100%", background: "transparent", border: "none", outline: "none",
            resize: "none", fontSize: 15, lineHeight: 1.65, letterSpacing: -0.2,
            color: txt, fontFamily: sans, minHeight: 100,
          }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 11, color: txtFaint, fontFamily: mono, letterSpacing: 0.3 }}>
        <span>한 줄도 충분해요</span>
        <span>{q4Text.length} / 200</span>
      </div>
      <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Q4_HINTS.map(hint => (
          <button key={hint} onClick={() => setQ4Text(q4Text ? q4Text + " " + hint : hint)} style={{
            padding: "8px 14px", borderRadius: 100,
            border: `0.5px solid ${borderS}`, background: "transparent",
            fontSize: 12, color: txtMuted, letterSpacing: -0.1, cursor: "pointer", fontFamily: sans,
          }}>{hint}</button>
        ))}
      </div>
      {q4Short
        ? <p style={{ marginTop: 16, color: accent, fontSize: 13 }}>{Q4_SHORT_HINT}</p>
        : error && <p style={{ marginTop: 16, color: accent, fontSize: 13 }}>{error}</p>}
    </div>
  );

  // step === 5
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.6, color: accent, marginBottom: 14 }}>QUESTION 05</div>
      <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.35, margin: "0 0 10px", color: txt }}>
        오늘은 얼마나<br />드실 것 같아요?
      </h2>
      <p style={{ fontSize: 13, color: txtMuted, lineHeight: 1.6, letterSpacing: -0.2, marginBottom: 28, marginTop: 0 }}>
        주량에 맞는 칵테일을 더 잘 찾아드릴 수 있어요.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CAPACITY_OPTIONS.map(({ value, label, sub }) => {
          const sel = drinkingCapacity === value;
          return (
            <button key={value} onClick={() => { setDrinkingCapacity(value); setError(null); }} style={{
              padding: "18px 20px", borderRadius: 14, textAlign: "left", cursor: "pointer",
              background: sel ? txt : surface,
              color: sel ? bg : txt,
              border: sel ? "none" : `0.5px solid ${border1}`,
              fontFamily: sans, transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{label}</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, letterSpacing: -0.1 }}>{sub}</div>
            </button>
          );
        })}
      </div>
      {error && <p style={{ marginTop: 16, color: accent, fontSize: 13 }}>{error}</p>}
    </div>
  );
}

export default function EmotionPage() {
  const router = useRouter();
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";
  const [drinkingCapacity, setDrinkingCapacity] = useState<Capacity | null>(null);
  const [mounted, setMounted] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem("drinkingCapacity") as Capacity | null;
    if (stored) setDrinkingCapacity(stored);
  }, []);

  const totalSteps = mounted ? (isLoggedIn || drinkingCapacity !== null ? 4 : 5) : 5;
  const [rawStep, setStep] = useState(1);
  // 세션 확인 후 총 단계가 5→4로 줄어도 현재 단계가 범위를 넘지 않도록 보정
  const step = Math.min(rawStep, totalSteps);
  const [q1Value, setQ1Value] = useState(35);
  const [q2Selected, setQ2Selected] = useState<Q2Option | null>(null);
  const [q2Other, setQ2Other] = useState("");
  const [q3Selected, setQ3Selected] = useState<Set<Q3Chip>>(new Set());
  const [q3Other, setQ3Other] = useState("");
  const [q4Text, setQ4Text] = useState("");
  const [error, setError] = useState<string | null>(null);

  function buildEmotionText(): string {
    const moodLabel = q1Value < 30 ? "매우 차분함" : q1Value < 50 ? "차분함" : q1Value < 70 ? "보통" : "활기참";
    const scene = q2Selected ? `가장 가까운 풍경: ${q2Selected}.` : q2Other.trim() ? `가장 가까운 풍경: ${q2Other.trim()}.` : "";
    const tasteList = [...Array.from(q3Selected), ...(q3Other.trim() ? [q3Other.trim()] : [])];
    const tastes = tasteList.length > 0 ? `선호하는 맛: ${tasteList.join(", ")}.` : "";
    const freeText = q4Text.trim() ? `오늘 하루: ${q4Text.trim()}.` : "";
    return [`오늘 기분의 톤: ${moodLabel} (${q1Value}/100).`, scene, tastes, freeText].filter(Boolean).join(" ");
  }

  const analyzeMutation = useMutation({
    mutationFn: (text: string) => api.post<Record<string, number>>("/ai/analyze-emotion", { text }).then(r => r.data),
    onSuccess: (emotionVector) => {
      // navigating=true로 설정해 isPending→false 되어도 로딩화면 유지
      setNavigating(true);
      sessionStorage.removeItem("recommendCache");
      sessionStorage.removeItem("recommendCacheKey");
      sessionStorage.removeItem("recommendBatch");
      sessionStorage.setItem("emotionVector", JSON.stringify(emotionVector));
      if (!isLoggedIn) {
        sessionStorage.setItem("drinkingCapacity", drinkingCapacity ?? "MEDIUM");
      }
      router.push("/recommend");
    },
    onError: (e: unknown) => setError(getApiErrorMessage(e, "감정 분석에 실패했어요. 잠시 후 다시 시도해 주세요.")),
  });

  const loading = analyzeMutation.isPending || navigating;

  function submit() {
    setError(null);
    analyzeMutation.mutate(buildEmotionText());
  }

  function validate(): string | null {
    if (step === 2 && !q2Selected && !q2Other.trim()) return "풍경을 선택하거나 직접 입력해주세요.";
    if (step === 3 && q3Selected.size === 0 && !q3Other.trim()) return "맛을 하나 이상 선택하거나 직접 입력해주세요.";
    if (step === 4 && q4Text.trim().length > 0 && q4Text.trim().length < Q4_MIN_LENGTH) return Q4_SHORT_HINT;
    if (!isLoggedIn && step === 5 && !drinkingCapacity) return "주량을 선택해주세요.";
    return null;
  }

  function next() {
    const msg = validate();
    if (msg) { setError(msg); return; }
    setError(null);
    if (step < totalSteps) setStep(s => s + 1); else submit();
  }
  function prev() { setError(null); if (step > 1) setStep(s => s - 1); else router.back(); }
  function toggleQ3(chip: Q3Chip) {
    setError(null);
    setQ3Selected(prev => { const n = new Set(prev); n.has(chip) ? n.delete(chip) : n.add(chip); return n; });
  }

  const ctaLabel = loading ? "분석 중..." : step < totalSteps ? "다음" : "오늘의 한 잔 찾기";
  const progressWidth = `${(step / totalSteps) * 100}%`;

  const stepProps: Omit<StepContentProps, "theme"> = {
    step, q1Value, setQ1Value,
    q2Selected, setQ2Selected, q2Other, setQ2Other,
    q3Selected, toggleQ3, q3Other, setQ3Other,
    q4Text, setQ4Text,
    drinkingCapacity, setDrinkingCapacity,
    error, setError,
  };

  if (loading) {
    return (
      <>
        <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
          <GlassSilhouette type="rocks" size={160} stroke={W.accent} liquid={W.accent} fillLevel={0.55} strokeWidth={1.3} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: W.mono, fontSize: 11, letterSpacing: 2, color: W.accent, marginBottom: 16, textTransform: "uppercase" }}>ANALYZING</div>
            <h2 style={{ fontSize: 24, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.5, margin: "0 0 10px", color: W.text }}>오늘의 감정을 분석하고 있어요.</h2>
            <p style={{ fontSize: 13, color: W.textMuted, margin: 0 }}>딱 맞는 칵테일을 찾고 있습니다...</p>
          </div>
        </div>
        <div className="cordial-mob">
          <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 40px" }}>
            <GlassSilhouette type="rocks" size={140} stroke={T.accent} liquid={T.accent} fillLevel={0.55} strokeWidth={1.3} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 2, color: T.accent, marginBottom: 16, textTransform: "uppercase" }}>ANALYZING</div>
              <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.5, margin: "0 0 10px" }}>오늘의 감정을 분석하고 있어요.</h2>
              <p style={{ fontSize: 13, color: T.darkTextMuted, margin: 0 }}>딱 맞는 칵테일을 찾고 있습니다...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── WEB ── */}
      <div className="cordial-web" style={{ background: W.bg, minHeight: "100dvh", color: W.text, fontFamily: W.sans }}>
        <WebNav active="/emotion" />
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "56px 40px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 48 }}>
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(n => (
              <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= step ? W.accent : W.border, transition: "background 0.3s" }} />
            ))}
          </div>
          <StepContent theme="light" {...stepProps} />
          <div style={{ marginTop: 40, display: "flex", gap: 12 }}>
            {step > 1 && (
              <button onClick={prev} disabled={loading} style={{
                padding: "0 24px", height: 52, borderRadius: 12,
                border: `0.5px solid ${W.borderStrong}`, background: "transparent",
                fontSize: 14, color: W.textMuted, fontFamily: W.sans,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.4 : 1,
              }}>이전</button>
            )}
            <button onClick={next} disabled={loading} style={{
              flex: 1, height: 52, borderRadius: 12,
              background: W.accent, color: "#FCFBF9",
              border: "none", fontSize: 15, fontWeight: 600,
              fontFamily: W.sans, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            }}>{ctaLabel}</button>
          </div>
        </div>
      </div>

      {/* ── MOBILE ── */}
      <div className="cordial-mob">
        <div style={{ width: "100%", minHeight: "100dvh", background: T.darkBg, color: T.darkText, fontFamily: T.sans, maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column" }}>
          <div style={{ paddingTop: 62, paddingBottom: 16, paddingLeft: 20, paddingRight: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <button onClick={prev} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12 4 L6 10 L12 16" stroke={T.darkText} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: T.darkTextMuted }}>
              {String(step).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
            </div>
            {step === 4 ? (
              <button onClick={next} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: T.darkTextMuted, fontFamily: T.sans }}>건너뛰기</button>
            ) : (
              <div style={{ width: 52 }} />
            )}
          </div>

          <div style={{ padding: "0 24px", marginBottom: 40 }}>
            <div style={{ height: 2, background: T.darkBorder, borderRadius: 1, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: progressWidth, background: T.accent, borderRadius: 1, transition: "width 0.3s" }} />
            </div>
          </div>

          <div style={{ flex: 1, padding: "0 24px" }}>
            <StepContent theme="dark" {...stepProps} />
          </div>

          <div style={{ padding: "20px 24px", paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 20px))" }}>
            <button onClick={next} disabled={loading} style={{
              width: "100%", height: 54, borderRadius: 14,
              background: T.accent, color: "#15110D",
              border: "none", fontSize: 15, fontWeight: 600, letterSpacing: -0.2,
              fontFamily: T.sans, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            }}>{ctaLabel}</button>
          </div>
        </div>
      </div>
    </>
  );
}
