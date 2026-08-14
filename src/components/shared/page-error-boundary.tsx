'use client'

import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  viewName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PageErrorBoundary:${this.props.viewName ?? 'page'}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-[800px] space-y-4 p-6">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">此頁面發生錯誤</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            頁面 <code className="rounded bg-muted px-1">{this.props.viewName ?? 'unknown'}</code> 渲染時拋出例外。其他頁面不受影響。請回報此錯誤以便修復。
          </p>
          <pre className="max-h-48 overflow-auto rounded-md border bg-muted/50 p-3 text-xs scrollbar-thin">
            {this.state.error?.message ?? 'unknown error'}
            {this.state.error?.stack ? '\n\n' + this.state.error.stack.slice(0, 1200) : ''}
          </pre>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => this.setState({ hasError: false, error: null })}>
              重試
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              重新載入整頁
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
