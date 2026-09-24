import { cn } from '@/lib/utils'

// Círculo com a foto do cadastro; sem foto, mostra a inicial do nome (ou do e-mail).
export function UserAvatar({ user, className }) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()
  return user?.avatar ? (
    <img src={user.avatar} alt="" className={cn('size-8 shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground', className)}>
      {initial}
    </span>
  )
}

// Recorta a imagem escolhida no centro e reduz pra 128x128 JPEG — cabe folgado no documento do usuário.
export function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const size = 128
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui ler essa imagem.')) }
    img.src = url
  })
}
