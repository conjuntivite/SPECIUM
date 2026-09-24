import { useState } from 'react'
import { motion, MotionConfig } from 'motion/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faRightToBracket, faUserPlus, faSpinner, faEye, faEyeSlash, faCheck,
  faVideo, faServer, faNetworkWired, faCarBattery, faFaceSmile,
} from '@fortawesome/free-solid-svg-icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/layout/Brand'
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher'
import { cn } from '@/lib/utils'

// Radar de cobertura (painel da direita, só em tela larga): PULSE_WAVES ondas saem do centro e
// levam PULSE_S pra chegar à borda (expansão linear); cada equipamento "acende" quando uma onda
// chega no raio dele — `angle` em graus no sentido horário a partir do topo, `radius` em % do
// raio. Com as ondas defasadas, uma chega a cada PULSE_S / PULSE_WAVES (ver index.css).
const PULSE_S = 3
const PULSE_WAVES = 3
const DEVICES = [
  { icon: faVideo, label: 'Câmera IP', angle: 35, radius: 78 },
  { icon: faServer, label: 'NVR', angle: 110, radius: 52 },
  { icon: faNetworkWired, label: 'Switch PoE', angle: 170, radius: 84 },
  { icon: faCarBattery, label: 'Nobreak', angle: 240, radius: 60 },
  { icon: faFaceSmile, label: 'Leitor facial', angle: 305, radius: 82 },
]
const HIGHLIGHTS = ['Receita de instalação automática', 'Validação de orçamento com IA', 'Projeto no mapa e na planta baixa']

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}
const pop = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 18 } },
}
const stagger = (delayChildren, staggerChildren) => ({ hidden: {}, show: { transition: { delayChildren, staggerChildren } } })

function CoverageRadar() {
  return (
    <motion.div className="relative size-[420px]" variants={stagger(0.4, 0.12)} initial="hidden" animate="show" aria-hidden="true">
      {[100, 75, 50, 25].map((size) => (
        <div key={size} className="absolute rounded-full border border-border" style={{ inset: `${(100 - size) / 2}%` }} />
      ))}
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {Array.from({ length: PULSE_WAVES }, (_, i) => (
        <div
          key={i}
          className="radar-pulse absolute inset-0 rounded-full"
          style={{ animationDuration: `${PULSE_S}s`, animationDelay: `${(i * PULSE_S) / PULSE_WAVES}s` }}
        />
      ))}

      <motion.div variants={pop} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="radar-core flex size-16 items-center justify-center rounded-full border border-primary/40 bg-background">
          <img src="/logo-cat.png" alt="" width="40" height="40" className="size-10 object-contain" />
        </div>
      </motion.div>

      {DEVICES.map((d) => {
        const rad = (d.angle * Math.PI) / 180
        const x = 50 + (Math.sin(rad) * d.radius) / 2
        const y = 50 - (Math.cos(rad) * d.radius) / 2
        return (
          <div key={d.label} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <motion.div variants={pop} className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 py-1 pr-2.5 pl-1 text-xs font-medium whitespace-nowrap text-foreground shadow-md backdrop-blur">
              <span
                className="radar-blip relative flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                style={{ animationDuration: `${PULSE_S / PULSE_WAVES}s`, animationDelay: `${(d.radius / 100) * PULSE_S}s` }}
              >
                <FontAwesomeIcon icon={d.icon} className="size-2.5" />
              </span>
              {d.label}
            </motion.div>
          </div>
        )
      })}
    </motion.div>
  )
}

export function LoginView({ auth }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const isLogin = mode === 'login'

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await (isLogin ? auth.login(email, password) : auth.register(email, password))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // reducedMotion="user": quem pede menos movimento no sistema vê tudo já no lugar, sem entrada animada.
    <MotionConfig reducedMotion="user">
      <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ThemeSwitcher />

        <main className="flex flex-col px-6 py-8 sm:px-12">
          <Brand icon className="text-2xl" />

          <motion.div
            className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10"
            variants={stagger(0.1, 0.07)}
            initial="hidden"
            animate="show"
          >
            <motion.h1 variants={rise} className="text-3xl font-semibold tracking-tight text-balance text-foreground">
              {isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
            </motion.h1>
            <motion.p variants={rise} className="mt-2 text-sm text-muted-foreground">
              {isLogin ? 'Entre para continuar seus projetos.' : 'Use seu e-mail e uma senha de no mínimo 8 caracteres.'}
            </motion.p>

            {/* Abas Entrar/Criar conta: a pílula desliza entre elas (layoutId). */}
            <motion.div variants={rise} className="mt-8 grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Acesso">
              {[['login', 'Entrar'], ['register', 'Criar conta']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'relative rounded-md py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    mode === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {mode === value ? (
                    <motion.span layoutId="login-mode-pill" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                  ) : null}
                  <span className="relative">{label}</span>
                </button>
              ))}
            </motion.div>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <motion.div variants={rise} className="flex flex-col gap-1.5">
                <label htmlFor="login-email" className="text-sm font-medium">E-mail</label>
                <Input
                  id="login-email" name="email" type="email" autoComplete="email" spellCheck={false} required
                  placeholder="voce@empresa.com.br" className="h-11"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </motion.div>
              <motion.div variants={rise} className="flex flex-col gap-1.5">
                <label htmlFor="login-password" className="text-sm font-medium">Senha</label>
                <div className="relative">
                  <Input
                    id="login-password" name="password" type={showPassword ? 'text' : 'password'} required minLength={8}
                    autoComplete={isLogin ? 'current-password' : 'new-password'} className="h-11 pr-11"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                    title={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                    className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="size-4" />
                  </button>
                </div>
              </motion.div>

              {auth.error ? (
                // key muda a cada tentativa -> o tremor repete mesmo se a mensagem for igual à anterior.
                <motion.p
                  key={auth.error + submitting}
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  initial={{ x: 0 }}
                  animate={{ x: [0, -6, 6, -4, 4, 0] }}
                  transition={{ duration: 0.4 }}
                >
                  {auth.error}
                </motion.p>
              ) : null}

              <motion.div variants={rise} className="mt-2">
                <Button type="submit" disabled={submitting} className="h-11 w-full text-base">
                  <FontAwesomeIcon icon={submitting ? faSpinner : isLogin ? faRightToBracket : faUserPlus} spin={submitting} />
                  {submitting ? (isLogin ? 'Entrando…' : 'Criando conta…') : isLogin ? 'Entrar' : 'Criar conta'}
                </Button>
              </motion.div>
            </form>
          </motion.div>

          <p className="text-xs text-muted-foreground">SPECIUM © 2026 • Intelligent System Design</p>
        </main>

        <aside className="login-dots relative hidden flex-col items-center justify-center gap-10 overflow-hidden border-l border-border bg-card px-12 py-16 lg:flex">
          <div className="login-glow pointer-events-none absolute inset-0" />
          <motion.div className="relative z-10 text-center" variants={stagger(0.15, 0.1)} initial="hidden" animate="show">
            <motion.h2 variants={rise} className="text-4xl font-semibold tracking-tight text-balance text-foreground">
              Projete. <span className="text-primary">Valide.</span> Instale.
            </motion.h2>
            <motion.ul variants={stagger(0, 0.1)} className="mx-auto mt-5 flex w-fit flex-col items-start gap-2 text-sm text-muted-foreground">
              {HIGHLIGHTS.map((h) => (
                <motion.li key={h} variants={rise} className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faCheck} className="size-3 text-primary" /> {h}
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
          <div className="relative z-10">
            <CoverageRadar />
          </div>
        </aside>
      </div>
    </MotionConfig>
  )
}
