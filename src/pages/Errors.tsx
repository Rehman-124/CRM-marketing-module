import { Link } from 'react-router-dom'
import { ShieldOff, Compass } from 'lucide-react'
import { Button, Card, EmptyState } from '@/components/ui'
import { useMe } from '@/store/store'
import { ROLE_LABEL } from '@/domain/permissions'

export function PermissionDenied({ message }: { message?: string }) {
  const me = useMe()
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState
        icon={ShieldOff}
        headingLevel={1}
        title="You don’t have access to this"
        description={message ?? `Your role (${ROLE_LABEL[me.role]}) and company assignments do not allow this screen. Access is scoped by role and company (P3-FR-001).`}
        action={<Link to="/"><Button variant="primary">Go to my home screen</Button></Link>}
      />
    </Card>
  )
}

export function NotFound() {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <EmptyState icon={Compass} headingLevel={1} title="Page not found" description="The page you were looking for does not exist." action={<Link to="/"><Button variant="primary">Back to home</Button></Link>} />
    </Card>
  )
}
