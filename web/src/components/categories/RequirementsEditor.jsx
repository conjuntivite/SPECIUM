import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpFromBracket, faListCheck } from '@fortawesome/free-solid-svg-icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InfoHint } from '@/components/ui/info-hint'
import { ResourceCombobox } from './ResourceCombobox'

// "O que este item fornece" (seção 4 do documento de arquitetura) — lista de { resource, amount }.
// Normalmente vazio pra uma câmera, preenchido pra switch/DVR/NVR (portas, canais).
export function ProvidesEditor({ provides, onChange, resources, onCreateResource, onDeleteResource }) {
  function update(index, patch) {
    onChange(provides.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }
  function remove(index) {
    onChange(provides.filter((_, i) => i !== index))
  }
  // Insere no começo, não no fim — o botão "+ Adicionar recurso" fica em cima da lista, então a
  // caixa nova aparece logo abaixo dele, sem precisar rolar past o resto da lista pra editá-la.
  function add() {
    onChange([{ resource: '', amount: 1 }, ...provides])
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-flow-green/30 bg-flow-green/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={faArrowUpFromBracket} className="size-3.5 text-flow-green" />
          <span className="text-sm font-medium">O que este item fornece</span>
          <InfoHint>
            Quanto de um recurso nomeado cada unidade desta categoria coloca à disposição no
            orçamento — outras categorias que exigem esse recurso (seção "O que este item exige")
            consomem dessa oferta.
            <br /><br />
            <strong>Exemplo:</strong> "Switch PoE Giga 16 Portas" fornece 16 de "Porta Gigabit" e 16
            de "Porta PoE" — dá pra alimentar/conectar até 16 câmeras com um único switch.
          </InfoHint>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={add}>+ Adicionar recurso</Button>
      </div>
      {provides.length ? (
        <ul className="flex flex-col gap-1.5">
          {provides.map((p, index) => (
            <li key={index} className="flex items-end gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
              <ResourceCombobox
                className="flex-1"
                value={p.resource}
                onChange={(resource) => update(index, { resource })}
                resources={resources}
                onCreateResource={onCreateResource}
                onDeleteResource={onDeleteResource}
              />
              <div className="flex w-24 flex-col gap-1">
                <Input
                  type="number" min="1" value={p.amount}
                  onChange={(e) => update(index, { amount: e.target.value })}
                  placeholder="Qtd."
                />
              </div>
              <button type="button" onClick={() => remove(index)} className="mb-2 text-xs text-destructive transition-colors hover:underline">
                remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum recurso — normal pra maioria das categorias (câmeras, acessórios).</p>
      )}
    </div>
  )
}

function emptyPresenceOption() { return { type: 'presence', candidates: [] } }
function emptyCapacityOption() { return { type: 'capacity', resource: '', unitsPerItem: 1 } }
function emptyRequirement() { return { type: 'presence', label: '', critical: false, candidates: [] } }

// Campos de uma "opção" de requisito — presença (categorias candidatas) ou capacidade (recurso +
// consumo por unidade). Reaproveitado tanto pra um requisito simples quanto pra cada opção de um
// requisito "Alternativas" (anyOf) — mesma forma nos dois casos (ver categoryResourceSeed.js).
function RequirementOptionFields({ option, otherCategories, labelByValue, resources, onCreateResource, onDeleteResource, onChange }) {
  if (option.type === 'capacity') {
    return (
      <div className="flex items-end gap-2">
        <ResourceCombobox
          className="flex-1"
          value={option.resource}
          onChange={(resource) => onChange({ ...option, resource })}
          resources={resources}
          onCreateResource={onCreateResource}
          onDeleteResource={onDeleteResource}
        />
        <div className="flex w-28 flex-col gap-1">
          <label className="text-[0.65rem] text-muted-foreground">Consumo/un.</label>
          <Input
            type="number" min="1" value={option.unitsPerItem}
            onChange={(e) => onChange({ ...option, unitsPerItem: e.target.value })}
          />
        </div>
      </div>
    )
  }

  const candidates = option.candidates || []
  const availableToAdd = otherCategories.filter((c) => !candidates.includes(c.value))
  return (
    <div className="flex flex-col gap-1.5">
      {availableToAdd.length ? (
        <Select value="" onValueChange={(value) => onChange({ ...option, candidates: [...candidates, value] })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="+ Categoria candidata" /></SelectTrigger>
          <SelectContent>
            {availableToAdd.map((c) => (<SelectItem key={c.id} value={c.value}>{c.label}</SelectItem>))}
          </SelectContent>
        </Select>
      ) : null}
      {candidates.length ? (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((value) => (
            <span key={value} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
              {labelByValue[value] || value}
              <button type="button" onClick={() => onChange({ ...option, candidates: candidates.filter((v) => v !== value) })} className="text-muted-foreground transition-colors hover:text-destructive">
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[0.65rem] text-muted-foreground">Nenhuma categoria candidata ainda.</p>
      )}
    </div>
  )
}

function RequirementTypeSelect({ req, onChangeType }) {
  return (
    <Select
      value={req.type}
      onValueChange={(type) => {
        if (type === 'anyOf') onChangeType({ type, options: [emptyCapacityOption(), emptyPresenceOption()] })
        else if (type === 'capacity') onChangeType({ type, ...emptyCapacityOption() })
        else onChangeType({ type, ...emptyPresenceOption() })
      }}
    >
      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="presence">Presença</SelectItem>
        <SelectItem value="capacity">Capacidade</SelectItem>
        <SelectItem value="anyOf">Alternativas (qualquer uma)</SelectItem>
      </SelectContent>
    </Select>
  )
}

// "O que este item exige" (seções 5/6 do documento de arquitetura) — cada requisito é presença,
// capacidade, ou "alternativas" (anyOf: 2+ opções, qualquer uma resolve — ex.: Switch PoE OU Fonte
// 12V pra alimentação). `id` não aparece na tela: é derivado do rótulo na hora de salvar
// (ver slugifyRequirementId em CategoryFormDialog) — o motor de sugestões não depende dele pra casar
// nada, só usa pra bookkeeping interno.
export function RequirementsEditor({ requirements, otherCategories, labelByValue, resources, onCreateResource, onDeleteResource, onChange }) {
  function update(index, patch) {
    onChange(requirements.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  function updateOption(index, optIndex, patch) {
    const req = requirements[index]
    const options = req.options.map((o, i) => (i === optIndex ? patch : o))
    update(index, { options })
  }
  function addOption(index) {
    const req = requirements[index]
    update(index, { options: [...req.options, emptyCapacityOption()] })
  }
  function removeOption(index, optIndex) {
    const req = requirements[index]
    if (req.options.length <= 2) return
    update(index, { options: req.options.filter((_, i) => i !== optIndex) })
  }
  function remove(index) {
    onChange(requirements.filter((_, i) => i !== index))
  }
  // Idem: "+ Adicionar requisito" fica em cima da lista — inserir no fim obrigava rolar por todos
  // os requisitos já cadastrados só pra editar o novo.
  function add() {
    onChange([emptyRequirement(), ...requirements])
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-flow-amber/30 bg-flow-amber/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={faListCheck} className="size-3.5 text-flow-amber" />
          <span className="text-sm font-medium">O que este item exige</span>
          <InfoHint>
            O que uma unidade desta categoria precisa pra funcionar. Três tipos: <strong>Presença</strong>{' '}
            (precisa de alguma categoria específica no orçamento), <strong>Capacidade</strong>{' '}
            (consome uma quantidade de um recurso que outra categoria fornece), ou{' '}
            <strong>Alternativas</strong> (qualquer uma das opções resolve).
            <br /><br />
            <strong>Exemplo:</strong> "Câmera IP PoE" exige Conectividade Gigabit (capacidade) e
            Alimentação via porta PoE OU Fonte 12V (alternativas) — qualquer uma das duas resolve.
          </InfoHint>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={add}>+ Adicionar requisito</Button>
      </div>

      {requirements.length ? (
        <ul className="flex flex-col gap-3">
          {requirements.map((req, index) => (
            <li key={index} className="flex flex-col gap-2 rounded-md bg-muted/50 p-2.5">
              <div className="flex items-center gap-2">
                <Input
                  value={req.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  placeholder="Nome do requisito (ex: Alimentação)"
                  className="flex-1"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={req.critical} onChange={(e) => update(index, { critical: e.target.checked })} />
                  Crítico
                </label>
                <button type="button" onClick={() => remove(index)} className="text-xs text-destructive transition-colors hover:underline">
                  remover
                </button>
              </div>

              <RequirementTypeSelect req={req} onChangeType={(patch) => update(index, patch)} />

              {req.type === 'anyOf' ? (
                <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
                  {req.options.map((option, optIndex) => (
                    <div key={optIndex} className="flex items-start gap-2">
                      <span className="mt-1.5 text-[0.65rem] text-muted-foreground">{optIndex === 0 ? 'Opção 1' : `OU opção ${optIndex + 1}`}</span>
                      <div className="flex-1">
                        <Select
                          value={option.type}
                          onValueChange={(type) => updateOption(index, optIndex, type === 'capacity' ? emptyCapacityOption() : emptyPresenceOption())}
                        >
                          <SelectTrigger className="mb-1.5 h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="presence">Presença</SelectItem>
                            <SelectItem value="capacity">Capacidade</SelectItem>
                          </SelectContent>
                        </Select>
                        <RequirementOptionFields
                          option={option}
                          otherCategories={otherCategories}
                          labelByValue={labelByValue}
                          resources={resources}
                          onCreateResource={onCreateResource}
                          onDeleteResource={onDeleteResource}
                          onChange={(patch) => updateOption(index, optIndex, patch)}
                        />
                      </div>
                      {req.options.length > 2 ? (
                        <button type="button" onClick={() => removeOption(index, optIndex)} className="mt-1.5 text-xs text-destructive transition-colors hover:underline">
                          remover
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => addOption(index)}>
                    + Adicionar opção
                  </Button>
                </div>
              ) : (
                <RequirementOptionFields
                  option={req}
                  otherCategories={otherCategories}
                  labelByValue={labelByValue}
                  resources={resources}
                  onCreateResource={onCreateResource}
                  onDeleteResource={onDeleteResource}
                  onChange={(patch) => update(index, patch)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum requisito ainda.</p>
      )}
    </div>
  )
}
