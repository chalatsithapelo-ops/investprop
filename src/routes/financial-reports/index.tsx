import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/financial-reports/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/financial-reports/"!</div>
}
