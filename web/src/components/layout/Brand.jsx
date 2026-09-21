// Wordmark do sistema: "RED" na cor primária (vermelho) + "VISION" na cor do texto.
// `icon` põe o olho da logo (web/public/logo-eye.png) à esquerda do nome.
export function Brand({ className = '', icon = false }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      {icon ? <img src="/logo-eye.png" alt="" className="h-[1.7em] w-auto" /> : null}
      <span><span className="text-primary">RED</span>VISION</span>
    </span>
  )
}
