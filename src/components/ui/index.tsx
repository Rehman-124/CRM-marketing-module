import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { createContext, forwardRef, useContext, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Info, FlaskConical, CircleDashed, type LucideIcon } from 'lucide-react'

export const cn = (...v: ClassValue[]) => twMerge(clsx(v))

// ------------------------------------------------------------------ Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'xs' | 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
  danger: 'bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:text-rose-300',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:text-brand-300',
}
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconR, className, children, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === 'xs' ? 'size-3.5' : 'size-4'} strokeWidth={2} />}
      {children}
      {IconR && <IconR className={size === 'xs' ? 'size-3.5' : 'size-4'} strokeWidth={2} />}
    </button>
  )
})

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-500', className)}
      {...rest}
    >
      <Icon className="size-[18px]" strokeWidth={1.8} />
    </button>
  )
}

// ------------------------------------------------------------------ Badge

export type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'violet' | 'sky' | 'orange' | 'teal'
const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
}
const dots: Record<Tone, string> = {
  neutral: 'bg-slate-400', brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500',
  violet: 'bg-violet-500', sky: 'bg-sky-500', orange: 'bg-orange-500', teal: 'bg-teal-500',
}

export function Badge({ tone = 'neutral', dot, icon: Icon, children, className, title }: { tone?: Tone; dot?: boolean; icon?: LucideIcon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full', dots[tone])} />}
      {Icon && <Icon className="size-3" strokeWidth={2.2} />}
      {children}
    </span>
  )
}

/** Marks a value or behaviour that stands in for an open decision in the FRD. */
export function PendingTag({ children = 'Pending decision', title }: { children?: ReactNode; title?: string }) {
  return (
    <span title={title ?? 'Placeholder — this is an open decision in the FRD and not an approved business rule.'} className="inline-flex max-w-full items-center gap-1 rounded-md border border-dashed border-amber-300 bg-amber-50/70 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
      <CircleDashed className="size-3 shrink-0" strokeWidth={2.2} />
      {children}
    </span>
  )
}

/** Marks behaviour that is simulated in the prototype, not a live production capability. */
export function SimTag({ children = 'Simulated', title }: { children?: ReactNode; title?: string }) {
  return (
    <span title={title ?? 'Demonstration behaviour — not a live production integration.'} className="inline-flex max-w-full items-center gap-1 rounded-md bg-fuchsia-50 px-1.5 py-0.5 text-[11px] font-medium text-fuchsia-700 ring-1 ring-fuchsia-200 ring-inset">
      <FlaskConical className="size-3 shrink-0" strokeWidth={2.2} />
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ Card

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl bg-white shadow-card ring-1 ring-slate-200/80', className)} {...rest}>{children}</div>
}

export function CardHeader({ title, description, actions, icon: Icon, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" strokeWidth={2} />}
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ------------------------------------------------------------------ Form fields

/** Lets Input/Select/Textarea inside a Field pick up the label's id automatically. */
const FieldId = createContext<string | undefined>(undefined)

export function Field({ label, hint, error, required, children, htmlFor, extra }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; htmlFor?: string; extra?: ReactNode }) {
  const auto = useId()
  const id = htmlFor ?? auto
  return (
    <FieldId.Provider value={id}>
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
        {extra}
      </div>
      {children}
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
    </FieldId.Provider>
  )
}

const inputBase = 'w-full rounded-lg border-0 bg-white px-3 text-sm text-slate-900 shadow-xs ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, id, ...rest }, ref) {
  const fid = useContext(FieldId)
  return <input ref={ref} id={id ?? fid} aria-invalid={invalid || undefined} className={cn(inputBase, 'h-9', invalid && 'ring-rose-300 focus:ring-rose-500', className)} {...rest} />
})

export function Textarea({ className, invalid, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const fid = useContext(FieldId)
  return <textarea id={id ?? fid} aria-invalid={invalid || undefined} className={cn(inputBase, 'min-h-20 py-2', invalid && 'ring-rose-300', className)} {...rest} />
}

export function Select({ className, children, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const fid = useContext(FieldId)
  return (
    <select
      id={id ?? fid}
      className={cn(inputBase, 'h-9 cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2020%2020%27%20fill=%27%2394a3b8%27%3E%3Cpath%20fill-rule=%27evenodd%27%20d=%27M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%27/%3E%3C/svg%3E")] bg-[length:18px] bg-[right_8px_center] bg-no-repeat pr-8', className)}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, disabled, label, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string; size?: 'sm' | 'md' }) {
  const id = useId()
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'bg-brand-600' : 'bg-slate-300',
      )}
    >
      <span className={cn('inline-block rounded-full bg-white shadow transition-transform duration-200', size === 'sm' ? 'size-3' : 'size-4', checked ? (size === 'sm' ? 'translate-x-3.5' : 'translate-x-[18px]') : 'translate-x-0.5')} />
    </button>
  )
}

// ------------------------------------------------------------------ Segmented control

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="scroll-thin inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200/60 ring-inset">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-all',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn('rounded px-1 text-[11px] tabular-nums', value === o.value ? 'bg-slate-100 text-slate-600' : 'text-slate-400')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number; icon?: LucideIcon }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
          )}
        >
          {t.icon && <t.icon className="size-4" strokeWidth={2} />}
          {t.label}
          {t.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', value === t.value ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Misc

export function EmptyState({ icon: Icon, title, description, action, compact, headingLevel }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; compact?: boolean; headingLevel?: 1 | 2 }) {
  const Title = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'p'
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
        <Icon className="size-5 text-slate-400" strokeWidth={1.8} />
      </div>
      <Title className="text-sm font-semibold text-slate-800">{title}</Title>
      {description && <p className="mt-1 max-w-sm text-[13px] text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />
}

const AVATAR_COLORS = ['bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700']

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const s = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-10 text-sm' }[size]
  return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', AVATAR_COLORS[h % AVATAR_COLORS.length], s, className)}>{initials}</span>
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13.5px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Callout({ tone = 'info', title, children, icon: Icon = Info, action, className }: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral'; title?: ReactNode; children?: ReactNode; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  const t = {
    info: 'bg-sky-50/80 ring-sky-200 text-sky-900 [&_svg.ci]:text-sky-500',
    warning: 'bg-amber-50/80 ring-amber-200 text-amber-900 [&_svg.ci]:text-amber-500',
    danger: 'bg-rose-50/80 ring-rose-200 text-rose-900 [&_svg.ci]:text-rose-500',
    success: 'bg-emerald-50/80 ring-emerald-200 text-emerald-900 [&_svg.ci]:text-emerald-500',
    neutral: 'bg-slate-50 ring-slate-200 text-slate-700 [&_svg.ci]:text-slate-400',
  }[tone]
  return (
    <div className={cn('flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ring-inset', t, className)}>
      <Icon className="ci mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, icon: Icon, tone = 'neutral', onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon; tone?: 'neutral' | 'red' | 'amber' | 'green' | 'brand'; onClick?: () => void }) {
  const ring = { neutral: 'text-slate-500 bg-slate-50 ring-slate-200', red: 'text-rose-600 bg-rose-50 ring-rose-200', amber: 'text-amber-600 bg-amber-50 ring-amber-200', green: 'text-emerald-600 bg-emerald-50 ring-emerald-200', brand: 'text-brand-600 bg-brand-50 ring-brand-200' }[tone]
  const Comp = onClick ? 'button' : 'div'
  return (
    <Card className={cn('p-4 text-left', onClick && 'transition hover:shadow-md hover:ring-slate-300')}>
      <Comp onClick={onClick} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
          {Icon && <span className={cn('flex size-7 items-center justify-center rounded-lg ring-1 ring-inset', ring)}><Icon className="size-3.5" strokeWidth={2.2} /></span>}
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </Comp>
    </Card>
  )
}

export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 font-medium break-words text-slate-800">{children}</dd>
    </div>
  )
}

export const th = 'px-4 py-2.5 text-left text-[11.5px] font-semibold tracking-wide text-slate-500 uppercase whitespace-nowrap'
export const td = 'px-4 py-3 text-[13px] text-slate-700 align-middle'
