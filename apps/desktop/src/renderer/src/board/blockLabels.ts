import type { GridBlock } from '@kkumikkumi/schema'

// 블록 종류 이름. 쓰는 곳마다 말이 조금 달라서 이름을 나눠 둔다.

/** 위젯 갤러리 묶음 이름, 세부 페이지 이름("할 일 — 눌러서 크게 보기") */
export const WIDGET_LABEL: Record<GridBlock['type'], string> = {
  calendar: '캘린더',
  todo: '할 일',
  timer: '타이머',
  image: '이미지',
  memo: '메모',
  timetable: '시간표',
  dday: '디데이',
}

/** 인스펙터 제목("투두 블록") */
export const BLOCK_TYPE_LABEL: Record<GridBlock['type'], string> = {
  calendar: '캘린더',
  todo: '투두',
  timer: '타이머',
  image: '이미지',
  memo: '메모',
  timetable: '시간표',
  dday: '디데이',
}
