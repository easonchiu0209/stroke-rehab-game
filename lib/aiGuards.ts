// LLM 輸出護欄（AI 指引 §5.1/§6）— 週報與即時教練共用。
// 禁用詞白名單：LLM 輸出含任一詞即棄用、退回規則式模板（法遵：不得醫療宣稱）。

export const BANNED_WORDS = ['治癒', '療效', '診斷', '保證', '痊癒', '根治', '治療效果', '用藥', '處方藥', '醫囑', '疾病改善']

export function hasBannedWords(text: string): boolean {
  return BANNED_WORDS.some(w => text.includes(w))
}
