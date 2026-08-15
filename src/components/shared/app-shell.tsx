'use client'

import { Suspense, lazy, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MobileNavigation, Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { useUIStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'
import { PageErrorBoundary } from './page-error-boundary'
import { StoreLayout as Layout } from '@/components/lab/store-layout'

// Lazy-load page components so initial bundle stays small.
const Dashboard = lazy(() => import('@/components/lab/dashboard').then((m) => ({ default: m.Dashboard })))
const Upload = lazy(() => import('@/components/lab/upload').then((m) => ({ default: m.Upload })))
const Room = lazy(() => import('@/components/lab/room').then((m) => ({ default: m.Room })))
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

// Map view ID to its component (keeps the switch compact).
// `Layout` is eagerly imported (not lazy) so it compiles with the main
// bundle — avoids on-demand chunk compilation OOM on memory-constrained
// dev machines. All other views stay lazy-loaded.
const VIEW_COMPONENTS: Record<string, React.ComponentType<any> | React.LazyExoticComponent<() => any>> = {
  dashboard: Dashboard,
  upload: Upload,
  room: Room,
  layout: Layout,
  restock: Restock,
  pricing: Pricing,
  skills: Skills,
  employees: Employees,
  manufacturing: Manufacturing,
  seasons: Seasons,
  wiki: Wiki,
  profit: Profit,
  salt: Salt,
  simulator: Simulator,
  containers: Containers,
  exploits: Exploits,
  achievements: Achievements,
  rawdata: RawData,
  atlas: Atlas,
}

// Page transition animation variants
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

const pageTransition = {
  type: 'tween' as const,
  ease: 'easeOut' as const,
  duration: 0.15,
}

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
  const mainRef = useRef<HTMLElement>(null)
  const prevView = useRef(view)

  // Scroll to top on view change
  useEffect(() => {
    if (view !== prevView.current) {
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      prevView.current = view
    }
  }, [view])

  const PageComponent = VIEW_COMPONENTS[view]

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <MobileNavigation />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <PageErrorBoundary viewName={view}>
            <Suspense fallback={<PageFallback />}>
              <AnimatePresence mode="wait" initial={false}>
                {PageComponent && (
                  <motion.div
                    key={view}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={pageTransition}
                    className="min-h-full"
                  >
                    <PageComponent />
                  </motion.div>
                )}
              </AnimatePresence>
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}
