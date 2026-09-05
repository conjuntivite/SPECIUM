// Portado de static/app.js:389-391 (só **bold**, não é markdown de verdade). Escapa antes de
// aplicar o **bold** — o original não escapava, mas como o resultado vai via dangerouslySetInnerHTML,
// vale a correção (o texto de origem é sempre `summary_insight` gerado pelo próprio backend).
export function formatMarkdownLike(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
}
