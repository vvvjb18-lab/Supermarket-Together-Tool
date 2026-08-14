'use client'

import { Suspense, lazy } from 'react'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { useUIStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'
import { PageErrorBoundary } from './page-error-boundary'

// Lazy-load page components so initial bundle stays small.
const Dashboard = lazy(() => import('@/components/lab/dashboard').then((m) => ({ default: m.Dashboard })))
const Upload = lazy(() => import('@/components/lab/upload').then((m) => ({ default: m.Upload })))
const Room = lazy(() => import('@/components/lab/room').then((m) => ({ default: m.Room })))
const Layout = lazy(() => import('@/components/lab/store-layout').then((m) => ({ default: m.StoreLayout })))
const Restock = lazy(() => import('@/components/lab/restock').then((m) => ({ default: m.Restock })))
const Pricing = lazy(() => import('@/components/lab/pricing').then((m) => ({ default: m.Pricing })))
const Skills = lazy(() => import('@/components/lab/skills').then((m) => ({ default: m.Skills })))
const Employees = lazy(() => import('@/components/lab/employees').then((m) => ({ default: m.Employees })))
const Manufacturing = lazy(() => import('@/components/lab/manufacturing').then((m) => ({ default: m.Manufacturing })))
const Seasons = lazy(() => import('@/components/lab/seasons').then((m) => ({ default: m.Seasons })))
const Wiki = lazy(() => import('@/components/lab/wiki').then((m) => ({ default: m.Wiki })))
const Profit = lazy(() => import('@/components/lab/profit').then((m) => ({ default: m.Profit })))
const Salt = lazy(() => import('@/components/lab/salt').then((m) => ({ default: m.Salt })))
const Simulator = lazy(() => import('@/components/lab/simulator').then((m) => ({ default: m.Simulator })))
const Containers = lazy(() => import('@/components/lab/containers').then((m) => ({ default: m.Containers })))
const Exploits = lazy(() => import('@/components/lab/exploits').then((m) => ({ default: m.Exploits })))
const Achievements = lazy(() => import('@/components/lab/achievements').then((m) => ({ default: m.Achievements })))
const RawData = lazy(() => import('@/components/lab/raw-data').then((m) => ({ default: m.RawData })))
const Atlas = lazy(() => import('@/components/lab/atlas').then((m) => ({ default: m.Atlas })))

function PageFallback() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function AppShell() {
  const view = useUIStore((s) => s.view)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <PageErrorBoundary viewName={view}>
            <Suspense fallback={<PageFallback />}>
              {view === 'dashboard' && <Dashboard />}
              {view === 'upload' && <Upload />}
              {view === 'room' && <Room />}
              {view === 'layout' && <Layout />}
              {view === 'restock' && <Restock />}
              {view === 'pricing' && <Pricing />}
              {view === 'skills' && <Skills />}
              {view === 'employees' && <Employees />}
              {view === 'manufacturing' && <Manufacturing />}
              {view === 'seasons' && <Seasons />}
              {view === 'wiki' && <Wiki />}
              {view === 'profit' && <Profit />}
              {view === 'salt' && <Salt />}
              {view === 'simulator' && <Simulator />}
              {view === 'containers' && <Containers />}
              {view === 'exploits' && <Exploits />}
              {view === 'achievements' && <Achievements />}
              {view === 'rawdata' && <RawData />}
              {view === 'atlas' && <Atlas />}
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}
