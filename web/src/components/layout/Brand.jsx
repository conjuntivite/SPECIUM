// Wordmark do sistema: "RED" na cor primária (vermelho) + "VISION" na cor do texto.
export function Brand({ className = '' }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      <span className="text-primary">RED</span>VISION
    </span>
  )
}
