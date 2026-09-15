import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { importProducts } from '@/lib/api'

export function ImportProductsDialog({ open, onOpenChange, onImported }) {
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [csvText, setCsvText] = useState('')
  const [errors, setErrors] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  function reset() {
    setFileName('')
    setCsvText('')
    setErrors([])
    setResult(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleOpenChange(next) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    setResult(null)
    setErrors([])
    setError('')
    if (!file) { setFileName(''); setCsvText(''); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setCsvText(String(reader.result || ''))
    reader.onerror = () => setError('Não foi possível ler o arquivo.')
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (!csvText) { setError('Escolha um arquivo .csv preenchido.'); return }
    setImporting(true)
    setError('')
    setErrors([])
    setResult(null)
    try {
      setResult(await importProducts(csvText))
      onImported()
    } catch (err) {
      if (err.errors) setErrors(err.errors)
      else setError(err.message || 'Erro ao importar planilha.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar produtos via planilha</DialogTitle>
          <DialogDescription>
            Baixe a planilha modelo, preencha uma linha por produto e envie de volta.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card/60 p-3 text-sm">
            <p className="mb-2 font-medium">1. Baixe o modelo</p>
            <p className="mb-2 text-muted-foreground">
              O modelo já vem com a lista de categorias cadastradas numerada, do lado das colunas de
              preenchimento. Colunas: <strong>Categoria</strong> (o número dessa lista — evita erro de
              digitação, mas também aceita o nome exato), <strong>Marca</strong> e <strong>Modelo</strong>.
              O ícone é definido uma vez na categoria, não por produto. Abre e salva normalmente
              pelo Excel — só não troque o separador ";" da planilha.
            </p>
            <a href="/api/products/template" download>
              <Button type="button" variant="secondary" size="sm">Baixar planilha modelo (.csv)</Button>
            </a>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-3 text-sm">
            <p className="mb-2 font-medium">2. Envie a planilha preenchida</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
            />
            {fileName ? <p className="mt-1.5 text-xs text-muted-foreground">Selecionado: {fileName}</p> : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {errors.length ? (
            <Alert variant="destructive">
              <AlertTitle>{errors.length} linha(s) com problema — corrija na planilha e envie de novo</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {errors.map((err, i) => (
                    <li key={i}>Linha {err.line}: {err.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {result ? (
            <Alert>
              <AlertDescription>
                {result.imported} produto(s) importado(s)
                {result.skipped ? `, ${result.skipped} ignorado(s) por já estar(em) cadastrado(s)` : ''}.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>Fechar</Button>
          <Button type="button" onClick={handleImport} disabled={importing || !csvText}>
            {importing ? 'Importando...' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
