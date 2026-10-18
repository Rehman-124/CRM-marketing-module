import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { create } from 'zustand'
import { cn } from './index'

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', icon }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode
}) {
  useEscape(open, onClose)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (open) setTimeout(() => panel.current?.querySelector<HTMLElement>('input,select,textarea,button[data-autofocus]')?.focus(), 30)
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="anim-fade absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('anim-pop relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 sm:rounded-2xl', { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size])}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[16px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ open, onClose, title, description, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; width?: string }) {
  useEscape(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('anim-slide absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl', width)}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Anchored popover menu. */
export function Popover({ trigger, children, align = 'right', width = 'w-72' }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cn('anim-pop absolute top-full z-40 mt-2 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10', align === 'right' ? 'right-0' : 'left-0', width)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Toasts

type ToastTone = 'success' | 'error' | 'info' | 'warning'
interface Toast { id: number; tone: ToastTone; title: string; body?: string }
const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    set((s) => ({ items: [...s.items.slice(-3), { ...t, id }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), t.tone === 'error' ? 6000 : 4200)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ tone: 'success', title, body }),
  error: (title: string, body?: string) => useToasts.getState().push({ tone: 'error', title, body }),
  info: (title: string, body?: string) => useToasts.getState().push({ tone: 'info', title, body }),
  warning: (title: string, body?: string) => useToasts.getState().push({ tone: 'warning', title, body }),
}

export function Toaster() {
  const { items, dismiss } = useToasts()
  const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle }
  const colors = { success: 'text-emerald-500', error: 'text-rose-500', info: 'text-sky-500', warning: 'text-amber-500' }
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto">
      {items.map((t) => {
        const Icon = icons[t.tone]
        return (
          <div key={t.id} role="status" className="anim-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-xl ring-1 ring-slate-900/10">
            <Icon className={cn('mt-0.5 size-[18px] shrink-0', colors[t.tone])} strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-900">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[12.5px] text-slate-500">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
          </div>
        )
      })}
    </div>
  )
}
