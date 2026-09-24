// Wordmark do sistema: "SPECIUM" em negrito, com "SPEC" na cor primária (vermelho) e "IUM" na cor do texto.
// `icon` põe o gato da logo (web/public/logo-cat.png) à esquerda do nome.
export function Brand({ className = '', icon = false }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      {icon ? <img src="/logo-cat.png" alt="" className="h-[1.7em] w-auto" /> : null}
      <span><span className="text-primary">SPEC</span>IUM</span>
    </span>
  )
}
