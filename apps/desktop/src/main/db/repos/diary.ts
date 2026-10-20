import { DiaryEntrySchema, DiaryPhotoSchema, type DiaryEntry } from '@kkumikkumi/schema'
import { z } from 'zod'
import type { Db } from '../connection'
import type { Row } from './rows'

const toEntry = (r: Row): DiaryEntry =>
  DiaryEntrySchema.parse({
    date: r['date'],
    body: r['body'],
    mood: r['mood'] ?? null,
    photos: z.array(DiaryPhotoSchema).parse(JSON.parse(String(r['photos']))),
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

/** 일기(날짜마다 하나) */
export class DiaryRepo {
  constructor(private readonly db: Db) {}

  get(date: string): DiaryEntry | null {
    const r = this.db.prepare('SELECT * FROM diary_entries WHERE date = ?').get(date) as
      Row | undefined
    return r ? toEntry(r) : null
  }

  /** [fromDate, toDate] 안의 일기(날짜 순) */
  range(fromDate: string, toDate: string): DiaryEntry[] {
    return (
      this.db
        .prepare('SELECT * FROM diary_entries WHERE date BETWEEN ? AND ? ORDER BY date')
        .all(fromDate, toDate) as Row[]
    ).map(toEntry)
  }

  upsert(entry: DiaryEntry): DiaryEntry {
    const e = DiaryEntrySchema.parse(entry)
    this.db
      .prepare(
        `INSERT INTO diary_entries (date, body, mood, photos, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET body = excluded.body, mood = excluded.mood,
           photos = excluded.photos, updated_at = excluded.updated_at`,
      )
      .run(e.date, e.body, e.mood, JSON.stringify(e.photos), e.createdAt, e.updatedAt)
    return e
  }

  delete(date: string): void {
    this.db.prepare('DELETE FROM diary_entries WHERE date = ?').run(date)
  }

  /** 일기에서 쓰는 사진 해시 전부(남은 파일 정리용) */
  /** 일기가 쓰는 사진 해시. 읽지 못한 행이 하나라도 있으면 null(무엇을 지워도 되는지 모르므로 정리하지 않는다) */
  photoHashes(): Set<string> | null {
    const out = new Set<string>()
    for (const r of this.db.prepare('SELECT photos FROM diary_entries').all() as Row[]) {
      try {
        for (const p of z.array(DiaryPhotoSchema).parse(JSON.parse(String(r['photos']))))
          out.add(p.hash)
      } catch {
        return null
      }
    }
    return out
  }
}
