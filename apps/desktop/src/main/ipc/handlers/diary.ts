import {
  DateStr,
  DIARY_MAX_CHARS,
  DIARY_MAX_PHOTOS,
  DiaryPhotoSchema,
  type DiaryEntry,
} from '@kkumikkumi/schema'
import { z } from 'zod'
import { DEFAULT_PIPELINE_OPTIONS, processImage } from '../../assets/pipeline'
import { NotFoundError } from '../../db/repos'
import type { HandlerDeps, HandlersOf } from './deps'

const DateIn = z.strictObject({ date: DateStr })
const MAX_RANGE_DAYS = 400

/** 일기(날짜마다 하나): 글, 기분, 사진. 비면(글·기분·사진 모두 없음) 지운다. AI 연결(MCP)에는 열지 않는다. */
export function diaryHandlers(d: HandlerDeps): HandlersOf<'diary'> {
  const { repos, diaryPhotos } = d
  const pipelineOpts = d.pipeline ?? DEFAULT_PIPELINE_OPTIONS

  const importPhoto = async (bytes: Uint8Array) => {
    const { asset, data } = await processImage(bytes, 'image', pipelineOpts)
    const photo = { hash: asset.hash, mime: asset.mime }
    await diaryPhotos.write(photo, data)
    return photo
  }

  return {
    'diary.get': async (i) => repos.diary.get(DateIn.parse(i).date),
    'diary.range': async (i) => {
      const { fromDate, toDate } = z
        .strictObject({ fromDate: DateStr, toDate: DateStr })
        .refine((r) => r.fromDate <= r.toDate)
        .refine(
          (r) => (Date.parse(r.toDate) - Date.parse(r.fromDate)) / 86_400_000 <= MAX_RANGE_DAYS,
          'range_too_long',
        )
        .parse(i)
      return repos.diary.range(fromDate, toDate).map((e) => ({
        date: e.date,
        mood: e.mood,
        hasText: e.body.trim() !== '',
        photoCount: e.photos.length,
      }))
    },
    'diary.save': async (i) => {
      const { date, ...patch } = z
        .strictObject({
          date: DateStr,
          body: z.string().max(DIARY_MAX_CHARS).optional(),
          mood: z.number().int().min(1).max(5).nullable().optional(),
          photos: z
            .array(DiaryPhotoSchema)
            .max(DIARY_MAX_PHOTOS)
            .refine((ps) => new Set(ps.map((p) => p.hash)).size === ps.length, 'duplicate')
            .optional(),
        })
        .parse(i)
      // 사진은 앱이 저장한 파일만 가리킬 수 있다(임의의 해시 참조 방지)
      for (const p of patch.photos ?? [])
        if (!(await diaryPhotos.exists(p))) throw new NotFoundError('diary_photo')
      const cur = repos.diary.get(date)
      const now = d.now()
      const next: DiaryEntry = {
        date,
        body: patch.body ?? cur?.body ?? '',
        mood: patch.mood === undefined ? (cur?.mood ?? null) : patch.mood,
        photos: patch.photos ?? cur?.photos ?? [],
        createdAt: cur?.createdAt ?? now,
        updatedAt: now,
      }
      if (next.body.trim() === '' && next.mood === null && next.photos.length === 0) {
        repos.diary.delete(date)
        return null
      }
      return repos.diary.upsert(next)
    },
    'diary.delete': async (i) => {
      repos.diary.delete(DateIn.parse(i).date)
      return null
    },
    'diary.photoFromDialog': async (i) => {
      z.undefined().parse(i)
      const bytes = await d.pickImageFile('image')
      return bytes ? importPhoto(bytes) : null
    },
    'diary.photoFromBytes': async (i) => {
      const { bytes } = z
        .strictObject({
          bytes: z
            .instanceof(Uint8Array)
            .refine((b) => b.byteLength <= pipelineOpts.maxInputBytes, 'too_large'),
        })
        .parse(i)
      return importPhoto(bytes)
    },
  }
}
