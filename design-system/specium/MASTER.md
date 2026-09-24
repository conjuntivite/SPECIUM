# Design System Master File — SPECIUM

> **LÓGICA:** ao construir uma tela, confira primeiro `design-system/specium/pages/[tela].md`.
> Se existir, as regras de lá **sobrescrevem** este arquivo. Se não, siga as regras abaixo.
>
> **Fonte da verdade dos valores:** `web/src/index.css`. Este arquivo explica *quando* usar cada token;
> se um valor divergir, vale o CSS — atualize aqui.

---

**Projeto:** SPECIUM — ferramenta interna de orçamento/projeto de segurança eletrônica (CFTV, alarme, rede)
**Stack:** React 19 + Vite, Tailwind v4, shadcn/ui (Radix), FontAwesome, `motion`, React Flow, Leaflet
**Base:** gerado com `ui-ux-pro-max` (dials: variance 3, motion 3, density 8) e ajustado à identidade real
**Estilo:** Data-Dense Dashboard + Minimalismo — denso, funcional, sem decoração

---

## Regras globais

### Cores (tokens semânticos shadcn)

Tema escuro é o padrão (`:root`); claro via `[data-theme="light"]` (ver `useTheme.js`).
**Nunca** use hex cru nem `white/N`/`black/N` em componente — use o token; ele troca sozinho com o tema.

| Papel | Escuro | Claro | Classe |
|-------|--------|-------|--------|
| Background | `#09090b` | `#fafafa` | `bg-background` |
| Foreground | `#fafafa` | `#18181b` | `text-foreground` |
| Card | `rgba(24,24,27,.8)` | `#ffffff` | `bg-card` |
| Primary (marca, vermelho) | `#dc2626` | `#dc2626` | `bg-primary` / `text-primary` |
| Destructive | `#f87171` | `#991b1b` | `text-destructive` |
| Muted foreground | `#a1a1aa` | `#71717a` | `text-muted-foreground` |
| Border | `rgba(255,255,255,.08)` | `#e4e4e7` | `border-border` |
| Ring (foco) | `rgba(239,68,68,.5)` | `rgba(220,38,38,.4)` | automático via `outline-ring` |

- **Overlay sutil** (fundo de item, chip, zebra): `bg-foreground/4` … `/10` — nunca `bg-white/N`.
- **Canvas do orçamento:** `flow-canvas`, `flow-grid`, `flow-green|amber|gray|red|orange` (+ `*-text`).
- **Status/score:** `badge-green`, `badge-yellow`.
- **Exceção:** marcadores sobre mapa/planta (Leaflet) podem usar cor fixa — o fundo é imagem, não muda com o tema.
- **Nunca** transmitir significado só pela cor: acompanhe de ícone ou texto.

### Tipografia

- **Sans:** DM Sans (`font-sans`, padrão) · **Mono:** JetBrains Mono (`font-mono`) para preços, quantidades, chaves.
- **Mínimo 12px** (`text-xs`). Nada de `text-[0.65rem]` e similares.
- Escala: `text-xs` (rótulos, metadados) · `text-sm` (corpo/tabelas) · `text-base`+ (títulos).
- Evite tamanhos arbitrários (`text-[0.82rem]`); exceção: nós do canvas (`FlowNode`), cujo layout depende das medidas.
- Números em tabela já saem com `tabular-nums` (global em `td, th`).

### Espaçamento e densidade

Denso (dashboard): gaps de 8–12px (`gap-2`/`gap-3`), padding de card 12–16px, linha de tabela ~36–40px.
Container de página: `max-w-[1100px] px-6 py-7` (em `ViewTabs`).

### Raio e sombra

`--radius: 0.75rem` → `rounded-lg` padrão; `rounded-xl` para cards/diálogos. Sombra elevada: `shadow-elevated`.

---

## Componentes

Use sempre os primitivos de `web/src/components/ui/` antes de criar algo novo.

- **Button:** variantes `default | outline | secondary | ghost | destructive | link`. Foco visível e transição já vêm prontos.
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

- [ ] Conferido nos **dois temas** (escuro e claro)
- [ ] Só tokens do tema, sem hex/`white/N` novos
- [ ] Texto ≥ 12px; valores em `font-mono` ou tabela
- [ ] Botões só-ícone com `aria-label` + `title`
- [ ] Foco visível navegando por Tab
- [ ] Estado de loading/erro perto da ação
- [ ] Listas longas com `stickyHeader`
- [ ] `npm run build` em `web/` (a porta 8000 serve `web/dist`)
