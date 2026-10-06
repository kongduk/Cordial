"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface IngredientOption {
  id: string;
  name: string;
  nameEn: string | null;
  abv: number;
  category: string | null;
}

interface Props {
  dark?: boolean;
  onSelect: (item: IngredientOption | { name: string; abv: number; isCustom: true }) => void;
  placeholder?: string;
}

const accent = "#B88752";

export function IngredientSearch({ dark, onSelect, placeholder = "재료 검색..." }: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<IngredientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const seqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const bg       = dark ? "#1C1814" : "#FFFFFF";
  const text      = dark ? "#F5EFE6" : "#1A1612";
  const textMuted = dark ? "rgba(245,239,230,0.62)" : "rgba(26,22,18,0.62)";
  const border    = dark ? "rgba(255,246,232,0.14)" : "rgba(40,30,20,0.16)";
  const hoverBg   = dark ? "rgba(255,246,232,0.06)" : "rgba(40,30,20,0.04)";

  const search = useCallback(async (q: string) => {
    const seq = ++seqRef.current; // 오래된 응답이 최신 결과를 덮어쓰지 않도록
    setLoading(true);
    try {
      const res = await fetch(`/api/ingredients/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json() as unknown;
      if (seq !== seqRef.current) return;
      setOptions(Array.isArray(raw) ? (raw as IngredientOption[]) : []);
      setSearchError(false);
    } catch {
      if (seq !== seqRef.current) return;
      setOptions([]);
      setSearchError(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  // 열릴 때와 입력이 바뀔 때 한 번만 검색 (포커스 핸들러에서 중복 호출하지 않음)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void search(query); }, 200);
    return () => clearTimeout(t);
  }, [query, open, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleFocus() {
    setOpen(true);
  }

  function handleSelect(item: IngredientOption) {
    onSelect(item);
    setQuery("");
    setOpen(false);
  }

  function handleAddCustom() {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSelect({ name: trimmed, abv: 0, isCustom: true });
    setQuery("");
    setOpen(false);
  }

  const hasExactMatch = options.some(o => o.name === query.trim());

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 100, border: `0.5px dashed ${border}`, background: "transparent" }}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="8.5" cy="8.5" r="6" stroke={textMuted} strokeWidth="1.4" />
          <path d="M14 14 L18 18" stroke={textMuted} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={e => {
            if (e.key === "Enter" && query.trim() && !hasExactMatch) handleAddCustom();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          style={{
            background: "none", border: "none", outline: "none",
            fontSize: 13, color: text, fontFamily: "inherit", width: "100%",
          }}
        />
        {loading && <span style={{ fontSize: 10, color: textMuted }}>···</span>}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 100,
          background: bg, border: `0.5px solid ${border}`, borderRadius: 12,
          boxShadow: dark ? "0 8px 24px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.12)",
          maxHeight: 260, overflowY: "auto",
        }}>
          {options.length === 0 && !loading && query.length === 0 && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: textMuted }}>재료 이름을 입력하세요</div>
          )}

          {searchError && !loading && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: textMuted }}>검색에 실패했어요. 잠시 후 다시 입력해 주세요.</div>
          )}
          {!searchError && options.length === 0 && !loading && query.trim().length > 0 && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: textMuted }}>검색 결과가 없어요.</div>
          )}

          {options.map(opt => (
            <button
              key={opt.id}
              onMouseDown={() => handleSelect(opt)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", background: "none", border: "none",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: text, fontWeight: 500 }}>{opt.name}</span>
                {opt.nameEn && (
                  <span style={{ fontSize: 11, color: textMuted, marginLeft: 6 }}>{opt.nameEn}</span>
                )}
              </div>
              {opt.abv > 0 && (
                <span style={{ fontSize: 11, color: accent, fontFamily: "monospace", flexShrink: 0 }}>{opt.abv}%</span>
              )}
            </button>
          ))}

          {query.trim().length > 0 && !hasExactMatch && (
            <button
              onMouseDown={handleAddCustom}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", background: "none", border: "none",
                borderTop: options.length > 0 ? `0.5px solid ${border}` : "none",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 12, color: accent }}>+</span>
              <span style={{ fontSize: 13, color: text }}>&ldquo;{query.trim()}&rdquo; 직접 추가</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
