import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons"
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
          <FontAwesomeIcon icon={faCircleInfo} className="size-3.5" />
          <span className="sr-only">Mais informações</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}
