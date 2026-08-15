import { NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

/**
 * Serves a sample save file to the browser so the Upload page can offer a
 * one-click "Load sample save" button without bundling a large file into the
 * client.
 *
 * Resolution order (first match wins; portable across Windows/Linux/Vercel):
 *  1. process.env.SAMPLE_SAVE_PATH  — explicit override (single file)
 *  2. ./save.json                   — sibling of project root
 *  3. ./sample-save.json            — sibling of project root
 *  4. ../save-analyzer/_latest/save.json  — sibling project (v1.0 schema)
 *  5. /home/z/my-project/upload/save.json — legacy Linux dev path
 *  6. /home/z/my-project/upload/_latest.json
 *
 * Returns the raw text with `Content-Type: application/json` so the client-side
 * parser can run identically to a manual file upload. If no file is found in
 * any of the above locations, returns 404 with instructions for the user
 * (pointing to the in-app "Load Demo" fallback).
 */
export async function GET() {
  const candidates: { file: string; label: string }[] = []

  // 1. Explicit env override
  const envPath = process.env.SAMPLE_SAVE_PATH?.trim()
  if (envPath) {
    candidates.push({ file: envPath, label: `SAMPLE_SAVE_PATH (${path.basename(envPath)})` })
  }

  // 2-6. Conventional locations — project-relative first, then legacy
  const cwd = process.cwd()
  candidates.push(
    { file: path.join(cwd, 'save.json'), label: `${cwd}/save.json` },
    { file: path.join(cwd, 'sample-save.json'), label: `${cwd}/sample-save.json` },
    { file: path.join(cwd, '..', 'save-analyzer', '_latest', 'save.json'), label: 'sibling save-analyzer/_latest/save.json' },
    { file: '/home/z/my-project/upload/save.json', label: '/home/z/my-project/upload/save.json' },
    { file: '/home/z/my-project/upload/_latest.json', label: '/home/z/my-project/upload/_latest.json' },
  )

  for (const c of candidates) {
    try {
      const [text, st] = await Promise.all([readFile(c.file, 'utf8'), stat(c.file)])
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': String(st.size),
          'Cache-Control': 'no-store',
          'X-Save-Source': c.label,
        },
      })
    } catch {
      // try next candidate
    }
  }

  return NextResponse.json(
    {
      error: 'sample-save-not-found',
      message:
        '未找到範本存檔。請在儲存環境設定 SAMPLE_SAVE_PATH，或將 save.json 放在專案根目錄、上傳自己的 .es3 / .json 存檔，或點「載入 Demo 存檔」使用預設資料。',
      triedPaths: candidates.map((c) => c.file),
    },
    { status: 404 },
  )
}
