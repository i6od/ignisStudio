import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function PageSection({
  icon,
  title,
  description,
  actions,
  children
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 px-4">
        {icon && <div className="text-primary">{icon}</div>}
        <div className="min-w-0">
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {actions && <div className="ml-auto">{actions}</div>}
      </CardHeader>
      <CardContent className="px-4 pb-1">{children}</CardContent>
    </Card>
  )
}