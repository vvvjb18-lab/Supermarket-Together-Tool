import { NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

/**
 * Serves the user-provided sample save file
 * (/home/z/my-project/upload/_latest.json) to the browser so the Upload
 * page can offer a one-click "Load sample save" button without bundling
 * the 45 KB file into the client.
 *
 * Returns the raw text with `Content-Type: application/json` so the
 * client-side ES3 parser can run identically to a manual file upload.
 * Falls back to a 404 with a helpful message if the file is missing.
 */
export async function GET() {
  const filePath = path.join('/home/z/my-project/upload', '_latest.json')
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
        'X-Save-Source': 'upload/_latest.json',
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        error: 'sample-save-not-found',
        message:
          '未找到 /home/z/my-project/upload/_latest.json。請透過上傳區選擇自己的 .es3 / .json 存檔。',
        code: e?.code ?? 'unknown',
      },
      { status: 404 },
    )
  }
}
