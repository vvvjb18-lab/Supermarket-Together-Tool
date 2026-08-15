// Personal auto-sync: reconnect to a remembered room on app load so the
// dashboard always reflects the locally auto-synced game save.
//
// The local watcher (tools/autosync.py) POSTs decoded save.json to
// /api/save under a room code + password. This module remembers that
// room on the device (localStorage) and, on load, joins it via the same
// Supabase backend the multiplayer Room feature uses, pulls the latest
// snapshot into the global `useSaveStore`, and subscribes to Realtime so
// every subsequent game-save upload updates the dashboard live.
//
// This is intentionally separate from the multiplayer Room workspace:
// it does NOT create a `useRoomStore.room` object (that would surface a
// "in room" lobby and double-subscribe). It only drives the save snapshot.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSaveStore, useRoomStore } from './store'
import { getIsSupabaseConfigured } from './backend-config'
import {
  joinRoom,
  fetchSaveRow,
  subscribeSave,
  heartbeat,
} from './backend-sync'
import type { SaveSnapshot } from './types'

export interface AutoSyncCreds {
  code: string
  password: string
  name: string
}

export type AutoSyncStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disabled'

const KEY = 'stl-auto-sync'

export function getAutoSyncCreds(): AutoSyncCreds | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') as AutoSyncCreds | null
  } catch {
    return null
  }
}

export function setAutoSyncCreds(c: AutoSyncCreds | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore quota errors */
  }
}

export function useAutoSync() {
  const [status, setStatus] = useState<AutoSyncStatus>('idle')
  const [code, setCode] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const subsRef = useRef<Array<() => void>>([])
  const hbRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearSubs = useCallback(() => {
    for (const fn of subsRef.current) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
    subsRef.current = []
    if (hbRef.current) {
      clearInterval(hbRef.current)
      hbRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    clearSubs()
    setAutoSyncCreds(null)
    setStatus('idle')
    setCode(null)
    setLastSyncedAt(null)
    setError(null)
  }, [clearSubs])

  const connect = useCallback(
    async (creds: AutoSyncCreds) => {
      setStatus('connecting')
      setError(null)
      try {
        const selfId = useRoomStore.getState().selfId
        await joinRoom({
          code: creds.code,
          password: creds.password,
          memberId: selfId,
          memberName: creds.name,
        })
        const saveRow = await fetchSaveRow(creds.code)
        if (saveRow) {
          useSaveStore.getState().setSnapshot(saveRow.snapshot)
          setLastSyncedAt(saveRow.uploadedAt)
        }

        clearSubs()
        subsRef.current.push(
          subscribeSave(creds.code, (snap: SaveSnapshot) => {
            useSaveStore.getState().setSnapshot(snap)
            setLastSyncedAt(new Date().toISOString())
          }),
        )
        hbRef.current = setInterval(() => {
          heartbeat({ roomCode: creds.code, memberId: selfId }).catch(() => {
            /* ignore */
          })
        }, 20_000)

        setCode(creds.code)
        setStatus('connected')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    },
    [clearSubs],
  )

  // On mount: auto-join if a room is remembered and no manual room is active.
  useEffect(() => {
    if (!getIsSupabaseConfigured()) return
    const creds = getAutoSyncCreds()
    if (!creds) return
    if (useRoomStore.getState().room) return
    void connect(creds)
    return () => clearSubs()
  }, [connect, clearSubs])

  // Pause while the user is in a manual (multiplayer) room — that room's
  // own subscription drives the snapshot instead.
  useEffect(() => {
    return useRoomStore.subscribe((s, prev) => {
      if (s.room && !prev.room) {
        clearSubs()
        setStatus('disabled')
      }
    })
  }, [clearSubs])

  return { status, code, lastSyncedAt, error, disconnect }
}
