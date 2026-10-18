import { useMemo } from 'react'
import { useStore, useMe, useAppData } from './store'
import { visibleCompanies, isViewOnlyCompany } from '@/domain/permissions'
import type { AppData, CompanyId } from '@/domain/types'
import type { Result } from '@/domain/engine'
import { toast } from '@/components/ui/overlay'

/** Companies in view: the user's visible companies, narrowed by the top-bar company switcher. */
export function useScope() {
  const me = useMe()
  const data = useAppData()
  const filter = useStore((s) => s.session.companyFilter)
  return useMemo(() => {
    const visible = visibleCompanies(data, me)
    const companies: CompanyId[] = filter === 'all' || !visible.includes(filter) ? visible : [filter]
    return {
      me,
      visible,
      companies,
      filter: filter === 'all' || !visible.includes(filter) ? ('all' as const) : filter,
      inScope: (c: CompanyId) => companies.includes(c),
      viewOnly: (c: CompanyId) => isViewOnlyCompany(me, c),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, filter, data.companies, data.users])
}

/** Run an engine action and report the outcome with a toast. */
export function useAction() {
  const run = useStore((s) => s.run)
  return (fn: (d: AppData) => Result | void, success?: string, successBody?: string): Result => {
    const res = run(fn) ?? { ok: true as const }
    if (!res.ok) toast.error('Action blocked', res.error)
    else if (success) toast.success(success, successBody)
    return res
  }
}
