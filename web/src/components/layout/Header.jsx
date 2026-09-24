import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock } from '@fortawesome/free-solid-svg-icons'

// Apresentação do sistema — só aparece na tela de login (a logo fica logo acima, no LoginView).
export function Header() {
  return (
    <header className="text-center">
      <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-4 py-1.5 text-sm font-semibold tracking-wide text-[var(--primary)]">
        <FontAwesomeIcon icon={faLock} className="size-4" />
        Receita de Instalação para o Comercial
      </div>
      <h1 className="mb-4 bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)] bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
        Monte o orçamento do cliente
      </h1>
      <p className="mx-auto max-w-[650px] text-lg leading-relaxed text-muted-foreground">
        Adicione os equipamentos que o cliente vai levar. O sistema sugere o que mais falta para a
        instalação funcionar de verdade — sem esquecer cabo, switch PoE, caixa ou gravação.
      </p>
    </header>
  )
}
