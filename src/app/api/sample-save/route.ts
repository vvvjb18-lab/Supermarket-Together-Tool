import { NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

/**
 * Serves a sample save file to the browser so the Upload page can offer a
 * one-click "Load sample save" button without bundling a large file into the client.
 *
 * Resolution order (prefers the newest format):
 *  1. /home/z/my-project/upload/save.json        — new pre-extracted structured format (v1.0)
 *  2. /home/z/my-project/upload/_latest.json     — legacy raw EasySave3 text (malformed JSON)
 *
 * Returns the raw text with `Content-Type: application/json` so the client-side
 * parser can run identically to a manual file upload.
 */
export async function GET() {
  const candidates = [
    { file: 'save.json', label: 'upload/save.json (extracted v1.0)' },
    { file: '_latest.json', label: 'upload/_latest.json (raw ES3)' },
  ]
  for (const c of candidates) {
    const filePath = path.join('/home/z/my-project/upload', c.file)
    try {
      const [text, st] = await Promise.all([
        readFile(filePath, 'utf8'),
        stat(filePath),
      ])
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
        '未找到範本存檔（upload/save.json 或 _latest.json）。請透過上傳區選擇自己的 .es3 / .json 存檔。',
    },
    { status: 404 },
  )
}
