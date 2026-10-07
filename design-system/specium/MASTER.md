# Design System Master File — SPECIUM

> **Base:** design system **Trade UI** (fonte global `~/design-systems/trade-ui/`; regras em `CLAUDE.md` e
> `docs/brand-book.md` de lá). Este arquivo só registra como o Trade UI foi aplicado no SPECIUM.
> Se existir `design-system/specium/pages/[tela].md`, as regras de lá sobrescrevem as daqui.

---

**Projeto:** SPECIUM — ferramenta interna de orçamento/projeto de segurança eletrônica (CFTV, alarme, rede)
**Stack:** React 19 + Vite, Tailwind v4, shadcn/ui (Radix), FontAwesome, `motion`, React Flow, Leaflet

---

## Regras globais

### Tokens

- Cópia dos tokens: `web/src/design-system/tokens.css` (não editar à mão; se o Trade UI mudar, copie de novo).
- `web/src/index.css` aponta os tokens do shadcn (`--background`, `--primary`, `--border`...) pros do Trade UI
  e registra os do Trade UI como utilitários com os nomes do preset: `bg-bg-surface`, `bg-bg-elevated`,
  `bg-bg-inverse`, `text-fg-primary|secondary|muted|inverse`, `border-border-subtle|strong`,
  `text-positive|negative|warning|info` (texto) e `bg-*-fill` (preenchimento).
- **Tema:** claro é o padrão; escuro via `data-theme="dark"` no `<html>` (`useTheme.js`). A variante `dark:` do Tailwind segue esse atributo.
- **Nunca** hex cru nem `white/N`/`black/N` em componente. Overlay sutil: `bg-foreground/4` … `/10`.
- **Canvas do orçamento:** `flow-green|amber|red|orange|gray` são só preenchimento (cabeçalho, legenda, borda);
  valor em texto usa `text-positive`/`text-warning`. Card ainda sem vínculo: `bg-bg-inverse text-fg-inverse`.
- **Exceção:** marcadores sobre mapa/planta (Leaflet) e cores de tipo de cabo podem usar cor fixa — o fundo é imagem.
- **Severidade** (sugestões, auditoria de PDF): cor no ícone + texto, nunca borda lateral colorida.

### Tipografia

- Plus Jakarta Sans (`font-sans`) · Space Mono (`font-mono`), carregadas no `web/index.html`.
- Mínimo 12px (`text-xs`). Números em tabela já saem com `tabular-nums` (global em `td, th`, e nos inputs).

### Forma

- Botões, abas, chips e itens do menu lateral em **pílula** (`rounded-full`); aba/item ativo invertido (`bg-bg-inverse`).
- Inputs/selects: `bg-bg-elevated`, borda `border-strong`, `rounded-md`, 40px de altura (`sm`: 32px).
- Cards: `rounded-xl` (24px) com padding 24px; `size="sm"`: `rounded-lg` (16px) com 16px. Diálogos: `rounded-xl`, `p-6`.
- Botão `variant="accent"` (limão) é o CTA de marca: no máximo um por tela.

### Logos

`web/public/brand/` (cópia de `trade-ui/brand/specium`, sem o fundo sólido do lockup). Use `<Brand />`
(logo horizontal) ou `<Brand icon />` (ícone) — já alternam claro/escuro. Favicon por `prefers-color-scheme`.

---

## Componentes

Use sempre os primitivos de `web/src/components/ui/` antes de criar algo novo.

- **Button:** variantes `default | outline | secondary | ghost | destructive | link | accent`. Foco visível e transição já vêm prontos.
- **Botão só-ícone:** obrigatório `aria-label` **e** `title` (tooltip) com o mesmo texto.
- **Table:** listas de página inteira usam `<Table stickyHeader>` (cabeçalho gruda no topo ao rolar).
  Tabelas dentro de card/rolagem lateral (ex.: `CompareTable`) ficam sem.
- **Dialog:** deixe o Radix gerenciar o foco — nada de `.focus()` manual.
- **Cadastro simples só-texto** (grupo, recurso): combobox inline, não CRUD em tela própria.
- **Ícones:** FontAwesome (`@fortawesome/free-solid-svg-icons`) ou `ProductIcon`. **Nunca emoji/caractere** (`★`, `✓`) como ícone.
  Ícone decorativo ao lado de texto: `aria-hidden="true"`.

---

## Interação e movimento

- **Cursor de clique:** global em `index.css` (button, `role=button/tab/menuitem/option`, labels de checkbox). Não precisa de `cursor-pointer` manual — só em `div`/`tr` clicável.
- **Transições:** 150–250ms em hover/foco; nada de mudança de estado instantânea.
- **Hover sem deslocar layout:** prefira cor/sombra a `scale`.
- **Reduzir movimento:** respeitado globalmente (CSS + `MotionConfig reducedMotion="user"` em `main.jsx`). Animação nova com `motion` herda isso; animação CSS nova também.
- **Alvo de clique:** mínimo ~20px em áreas densas (canvas, chips); 32px+ (`size-8`) no resto.
- **Carregamento:** todo botão que dispara requisição mostra estado ("Salvando...") e fica `disabled`.

---

## Anti-padrões (NÃO usar)

- ❌ Hex cru, `bg-white/N`, `border-white/N` em componente (quebra o tema claro)
- ❌ Texto abaixo de 12px
- ❌ Emoji/caractere como ícone
- ❌ Botão só-ícone sem `aria-label`
- ❌ `outline-none` sem substituto `focus-visible:`
- ❌ Cor como único indicador de estado
- ❌ Menu/catálogo lotado — confirme volume antes de encher listas de contexto
- ❌ Padrões de landing page (hero, carrossel de logos, CTA de vendas) — é ferramenta interna

---

## Checklist antes de entregar UI

- [ ] Conferido nos **dois temas** (claro e escuro)
- [ ] Só tokens do tema, sem hex/`white/N` novos
- [ ] Texto ≥ 12px; valores em `font-mono` ou tabela
- [ ] Botões só-ícone com `aria-label` + `title`
- [ ] Foco visível navegando por Tab
- [ ] Estado de loading/erro perto da ação
- [ ] Listas longas com `stickyHeader`
- [ ] `npm run build` em `web/` (a porta 8000 serve `web/dist`)
