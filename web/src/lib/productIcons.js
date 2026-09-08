import {
  faVideo, faCamera, faShieldHalved, faBell, faSatelliteDish, faTowerBroadcast,
  faDoorClosed, faKey, faLock, faWifi, faNetworkWired, faEthernet, faServer,
  faHardDrive, faMicrochip, faPlug, faBoltLightning, faBatteryFull, faSolarPanel,
  faFan, faScrewdriverWrench, faToolbox, faBox, faTag, faRulerCombined,
  faHelmetSafety, faFireExtinguisher, faSimCard, faDesktop, faIndustry,
} from '@fortawesome/free-solid-svg-icons'

export const DEFAULT_PRODUCT_ICON = faBox

// Curadoria pro domínio de CFTV/segurança eletrônica/instalação — não o conjunto inteiro do
// Font Awesome, senão o grid de escolha no cadastro de produto vira uma busca em milhares de ícones.
export const PRODUCT_ICON_OPTIONS = [
  { key: 'video', label: 'Câmera / DVR-NVR', icon: faVideo },
  { key: 'camera', label: 'Câmera fotográfica', icon: faCamera },
  { key: 'shield-halved', label: 'Segurança / Alarme', icon: faShieldHalved },
  { key: 'bell', label: 'Sirene / Campainha', icon: faBell },
  { key: 'satellite-dish', label: 'Antena', icon: faSatelliteDish },
  { key: 'tower-broadcast', label: 'Transmissão', icon: faTowerBroadcast },
  { key: 'door-closed', label: 'Porta / Acesso', icon: faDoorClosed },
  { key: 'key', label: 'Chave / Fechadura', icon: faKey },
  { key: 'lock', label: 'Cadeado', icon: faLock },
  { key: 'wifi', label: 'Wi-Fi', icon: faWifi },
  { key: 'network-wired', label: 'Rede cabeada / Switch', icon: faNetworkWired },
  { key: 'ethernet', label: 'Cabo de rede', icon: faEthernet },
  { key: 'server', label: 'Servidor / NVR', icon: faServer },
  { key: 'hard-drive', label: 'HD / Armazenamento', icon: faHardDrive },
  { key: 'microchip', label: 'Placa / Componente', icon: faMicrochip },
  { key: 'plug', label: 'Fonte / Tomada', icon: faPlug },
  { key: 'bolt-lightning', label: 'Energia elétrica', icon: faBoltLightning },
  { key: 'battery-full', label: 'Nobreak / Bateria', icon: faBatteryFull },
  { key: 'solar-panel', label: 'Energia solar', icon: faSolarPanel },
  { key: 'fan', label: 'Ventilação', icon: faFan },
  { key: 'screwdriver-wrench', label: 'Instalação', icon: faScrewdriverWrench },
  { key: 'toolbox', label: 'Kit de acabamento', icon: faToolbox },
  { key: 'box', label: 'Caixa / Produto genérico', icon: faBox },
  { key: 'tag', label: 'Etiqueta', icon: faTag },
  { key: 'ruler-combined', label: 'Estrutura', icon: faRulerCombined },
  { key: 'helmet-safety', label: 'Segurança do trabalho', icon: faHelmetSafety },
  { key: 'fire-extinguisher', label: 'Incêndio', icon: faFireExtinguisher },
  { key: 'sim-card', label: 'Chip / 4G', icon: faSimCard },
  { key: 'desktop', label: 'Monitor', icon: faDesktop },
  { key: 'industry', label: 'Industrial', icon: faIndustry },
]

const ICON_BY_KEY = new Map(PRODUCT_ICON_OPTIONS.map((opt) => [opt.key, opt.icon]))

export function getProductIcon(key) {
  return (key && ICON_BY_KEY.get(key)) || DEFAULT_PRODUCT_ICON
}
