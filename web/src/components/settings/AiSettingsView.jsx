import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getAiInstructions, updateAiInstructions } from '@/lib/api'

export function AiSettingsView() {
  const [classification, setClassification] = useState('')
  const [audit, setAudit] = useState('')
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
      await updateAiInstructions({ classification, audit })
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
          Texto que orienta a IA nas etapas de classificação e auditoria do orçamento em PDF (personagem e dicas de domínio).
          O formato de saída e os dados injetados (itens, categorias, achados do motor de regras) continuam fixos no sistema.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading ? (
        <div className="flex flex-col gap-5">
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

          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            {saved ? <span className="text-sm text-muted-foreground">Salvo.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
