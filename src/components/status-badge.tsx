import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Status-Pills gemäß docs/design-system.md ("Status pill colors").
const STATUS_STYLES = {
  positive: "bg-[#E3EFE7] text-[#1F5138] hover:bg-[#E3EFE7]",
  pending: "bg-[#F6EAD3] text-[#7A4A0E] hover:bg-[#F6EAD3]",
  blocked: "bg-[#F8DDD3] text-[#8A2A0F] hover:bg-[#F8DDD3]",
  neutral: "bg-secondary text-secondary-foreground hover:bg-secondary",
} as const

export type StatusTone = keyof typeof STATUS_STYLES

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("whitespace-nowrap border-transparent font-medium", STATUS_STYLES[tone], className)}
    >
      {children}
    </Badge>
  )
}
