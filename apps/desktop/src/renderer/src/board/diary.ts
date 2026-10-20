// 일기 기분(5단계). 1 = 힘듦 … 5 = 최고. 달력 칸과 일기 창이 같이 쓴다.

export const MOODS = [
  { value: 5, emoji: '😆', label: '최고' },
  { value: 4, emoji: '🙂', label: '좋음' },
  { value: 3, emoji: '😐', label: '보통' },
  { value: 2, emoji: '😔', label: '별로' },
  { value: 1, emoji: '😢', label: '힘듦' },
] as const

export const moodEmoji = (mood: number | null | undefined): string | null =>
  MOODS.find((m) => m.value === mood)?.emoji ?? null

export const moodLabel = (mood: number | null | undefined): string | null =>
  MOODS.find((m) => m.value === mood)?.label ?? null
