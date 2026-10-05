import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getAiInstructions, updateAiInstructions } from '@/lib/api'

export function AiSettingsView() {
  const [classification, setClassification] = useState('')
  const [audit, setAudit] = useState('')
  const [assistant, setAssistant] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    getAiInstructions()
      .then((data) => {
        setClassification(data.classification || '')
        setAudit(data.audit || '')
        setAssistant(data.assistant || '')
      })
      .catch((err) => setError(err.message || 'Erro ao carregar instruções da IA.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateAiInstructions({ classification, audit, assistant })
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Erro ao salvar instruções da IA.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Instruções da IA</h2>
        <p className="text-sm text-muted-foreground">
          São duas IAs separadas: o <strong>Assistente</strong> (chat) e o <strong>validador de orçamento em PDF</strong>.
          O que se escreve para uma não vale para a outra.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading ? (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-base font-semibold">Assistente (chat)</h3>
            <p className="text-sm text-muted-foreground">
              Personaliza só a tela Assistente: tom, como chamar o usuário, preferências da equipe.
              As regras técnicas ONE/SIAM e o formato do orçamento sugerido continuam fixos no sistema e não são alterados por aqui.
              Deixe em branco para usar só o padrão.
            </p>
            <Textarea
              rows={8}
              className="font-mono text-sm"
              placeholder="Ex.: Chame o usuário de Oscar Lima. Responda de forma bem resumida."
              value={assistant}
              onChange={(e) => { setAssistant(e.target.value); setSaved(false) }}
            />
          </section>

          <section className="flex flex-col gap-5">
            <div>
              <h3 className="text-base font-semibold">Validador de orçamento em PDF</h3>
              <p className="text-sm text-muted-foreground">
                Valem só quando um orçamento em PDF é enviado para auditoria (e para casar os itens com o catálogo).
                Não mudam o Assistente. O formato de saída e os dados injetados (itens, categorias, achados do motor de regras) continuam fixos no sistema.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Classificação de itens do orçamento</label>
              <Textarea
                rows={14}
                className="font-mono text-sm"
                value={classification}
                onChange={(e) => { setClassification(e.target.value); setSaved(false) }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Auditoria técnica do orçamento</label>
              <Textarea
                rows={14}
                className="font-mono text-sm"
                value={audit}
                onChange={(e) => { setAudit(e.target.value); setSaved(false) }}
              />
            </div>
          </section>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            {saved ? <span className="text-sm text-muted-foreground">Salvo.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
