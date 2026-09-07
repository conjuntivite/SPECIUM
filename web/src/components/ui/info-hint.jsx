import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Bolinha "i" ao lado do rótulo de um campo — hover (ou foco, pra quem navega por teclado) mostra a
// explicação + exemplo prático que antes ficava sempre visível como texto pequeno embaixo do campo.
export function InfoHint({ children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <Info className="size-3.5" />
          <span className="sr-only">Mais informações</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}
