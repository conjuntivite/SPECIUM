// Fichas técnicas dos fornecedores de controle de acesso/portaria remota (ONE PORTARIA e SIAM),
// destiladas dos datasheets e manuais oficiais deles (Drive dos fornecedores, set/2026). Cada ficha
// só entra no prompt de auditoria quando o NOME de algum item do orçamento bater com `match` — o
// modelo gratuito tem contexto pequeno, então não dá pra mandar tudo sempre. Só fatos lidos nos
// documentos; ao mudar/estender, mantenha o rótulo do fornecedor no texto ("ONE:" / "SIAM:").
const { callOpenRouter, candidateModels } = require('./openrouter');
const { layoutAndLinkItems } = require('./budgetLinks');

const EQUIPMENT_KNOWLEDGE = [
  // ---------- ONE PORTARIA ----------
  { match: /c[oó]rtex|endpoint|one\s*portaria/i, text: 'ONE (portaria remota/autogerenciada): uma central Córtex + endpoints ligados por rede (precisa de switch). Todo endpoint precisa de fonte 12V (plug P4). Leitor Wiegand só liga em Endpoint 4 Portas ou FULL; Multi-IO, Sound e AquaMonitor não têm porta Wiegand. Endpoints 4 Portas/FULL/Multi-IO/Sound são compatíveis com Córtex 4 e 5. Fechadura/eletroímã liga no relé do endpoint (eletroímã no NF, trava elétrica no NA) com fonte própria — o relé só comuta. Portão pivotante/deslizante/basculante usa o Receptor FULL.' },
  { match: /c[oó]rtex|endpoint|one\s*portaria/i, text: 'ONE (guia de instalação oficial): cabo de leitor Wiegand blindado com no máximo 30 m; ligar cada dispositivo direto no switch/roteador (não cascatear); fontes SEPARADAS para faciais, eletroímãs e endpoints (nunca uma fonte só para todos os endpoints); link de no mínimo 30 Mbps de upload e download, com redundância, e VPN entre o condomínio e a base de monitoramento; equipamento em área externa com IP66 (botoeira de uso interno não vai em área externa); nobreak e baterias dimensionados para a carga total; só equipamentos homologados pela ONE (lista no Blog de Equipamentos da ONE).' },
  { match: /c[oó]rtex|endpoint|one\s*portaria/i, text: 'ONE (planos comerciais do SERVIÇO de portaria remota — é escopo de venda, NÃO exigência técnica de compatibilidade entre equipamentos: um leitor facial/controladora de acesso não exige câmera, por exemplo. Nem todo orçamento precisa de tudo; só aponte falta se o orçamento pretende ser uma portaria remota completa): todos os planos trazem câmeras Full HD, transmissão de dados com redundância, baterias e nobreak para portas e portões, alerta de portão aberto (sensor), notificação de carona, controle remoto veicular e botoeira de saída. Do plano intermediário em diante: leitura facial. Avançado/completo: portas sociais motorizadas, link redundante, interfone de elevador, monitoramento de caixa d\'água. Só no completo: cerca elétrica interligada, antenas veiculares, armário inteligente. Portaria autogerenciada (AG/AG Plus): câmeras Full HD, botoeira de saída, controle remoto veicular, leitura facial, interfonia via app. O hardware ONE costuma ser locado/comodato pelo afiliado, não vendido ao condomínio.' },
  { match: /c[oó]rtex|endpoint|one\s*portaria/i, text: 'ONE (DIAGRAMA DE LIGAÇÕES oficial — norte de instalação; como CONTAR endpoints): o Endpoint 4 Portas tem 4 GRUPOS INDEPENDENTES de bornes — 4 relés (101-104, NA/C/NF), 4 entradas de sensor contato seco (201-204, S0/S1) e 4 entradas Wiegand (1-4, D0/D1) — e fala com o Córtex pela REDE. "4 Portas" = 4 relés de comando; a entrada Wiegand NÃO consome relé (usar leitor Wiegand não tira porta nenhuma). Qualquer relé serve para qualquer comando e qualquer entrada para qualquer sensor. Porta com eletroímã: 1 relé (fonte própria passa pelo relé: C + NF; trava elétrica: C + NA) e, se houver sensor de porta, 1 entrada de sensor. PORTÃO (pivotante, deslizante ou basculante — mesma ligação): 1 relé no BOT (borne de comando da placa do motor, NA + C; é o comando de abrir — não confundir com a botoeira de saída), 1 relé no FOT (opcional, função "manter aberto"), 1 entrada de sensor para o sensor magnético de portão aberto, e o Receptor 433 FULL nas entradas Wiegand/12V (só se houver controle remoto). Fotocélula liga na placa do motor do portão, nunca no Endpoint; sensor de dupla passagem/carona é opcional. Conta: relés = portas + (1 a 2 por portão); sensores = 1 por porta com sensor + 1 por portão + 1 por botoeira de saída (a botoeira liga direto numa entrada de sensor/contato seco do Endpoint, nunca em Wiegand nem em relé); Wiegand = 1 por leitor Wiegand (antena veicular e facial NÃO contam: ficam na rede); nº de Endpoint = o MAIOR entre relés÷4, sensores÷(8 no FULL, 4 no 4 Portas) e Wiegand÷(2 no FULL, 4 no 4 Portas), arredondado para cima. SEMPRE sugira o Endpoint FULL (8 entradas de sensor contra 4); o Endpoint 4 Portas só entra no orçamento se o comercial pediu esse modelo. Multi-IO só se faltar relé/entrada e não precisar de Wiegand. Cada Endpoint tem 1 fonte P4 12V própria (2 endpoints = 2 fontes). BOT/FOT são bornes da placa do motor do portão (já existentes): o portão NÃO leva botoeira de saída no orçamento por causa deles. Ex.: 4 portas + 2 portões com BOT e FOT = 4 + 4 = 8 relés, 6 sensores = 2 Endpoint FULL.' },
  { match: /c[oó]rtex|endpoint|ones*portaria|facial|idu?hf|controls*id/i, text: 'ONE (leitor facial e antena veicular — fluxo confirmado pela ONE): o leitor facial NÃO tem ligação física no Endpoint — fica na rede (switch), lê o rosto e envia ao servidor Córtex, que valida e manda o Endpoint acionar o relé da porta; o Endpoint só tem o relé da fechadura e a entrada de sensor do magnético/contato da porta. Ou seja: facial não ocupa relé, sensor nem Wiegand. Porta com eletroímã + solenoide de backup (a solenoide segura a porta se o magnético falhar) = os DOIS no MESMO relé, cada um com fonte própria, liberando juntos: 1 relé por porta, não 2. Antena veicular Control iD iDUHF (datasheet oficial): leitora UHF IP65, alcance até 15 m (conforme a tag), fonte externa 12V NÃO inclusa (~300 mA), 1 saída Wiegand, Ethernet, RS-485/232, 1 relé 5A e entradas de trigger/sensor; na ONE segue o padrão do facial (confirmado pela ONE): liga na REDE (switch), como os comandos; NÃO tem ligação física no Endpoint, então não ocupa Wiegand, relé nem sensor (4 antenas = 0 Wiegand). Só precisa de fonte 12V própria, que entra no orçamento. O Wiegand físico só vale com controladora de outra marca (ex.: SIAM). O Receptor 433 NÃO substitui a antena (é só para controle remoto 433 MHz).' },
  { match: /c[oó]rtex\s*ag\b/i, text: 'ONE Córtex AG: só portaria AUTO-GERENCIADA, 1 condomínio, no máximo 30 endpoints e 30 leitores IP. LAN 10/100 sem PoE; fonte externa AC 100-240V -> 5V/3A. Só em locação/comodato: é normal ele constar no orçamento sem custo — NÃO aponte a presença dele como erro. Cenário: switch -> Endpoint 4 Portas -> leitores Wiegand, sensores e comandos.' },
  { match: /c[oó]rtex\s*(v\.?\s*)?5\b/i, text: 'ONE Córtex V5: LAN 10/100, fonte AC 100-240V -> 12V/5A, lê QR Code, aceita até 4 câmeras RTSP. Garantia só durante a vigência do contrato: é cedido em comodato e costuma constar no orçamento sem custo (normal, não é erro).' },
  { match: /c[oó]rtex\s*(v\.?\s*)?6\b/i, text: 'ONE Córtex V6: sucessor do V5 (display, web nova), 2GB RAM, LAN 10/100/1000, fonte AC 100-240V -> 12V/5A. Gerencia vários endpoints e vários leitores faciais online. Garantia só durante a vigência do contrato: é cedido em comodato e costuma constar no orçamento sem custo (normal, não é erro).' },
  { match: /endpoint.*4\s*portas|4\s*portas.*endpoint/i, text: 'ONE Endpoint 4 Portas: 4 entradas Wiegand 26/34 bits (independentes dos relés), saída 12V para alimentar os leitores, 4 entradas de contato seco (sensores) e 4 relés NA/NF de 10A (o diagrama do mesmo datasheet cita 15A). Fonte P4 12V.' },
  { match: /endpoint.*full|endpoint\s*full/i, text: 'ONE Endpoint FULL: 2 portas Wiegand 26/34 bits, 8 entradas de contato seco, 4 relés NA/NF de 10A. Fonte P4 12V/5A (mais forte que os outros endpoints).' },
  { match: /multi[\s-]*io|mult[\s-]*io/i, text: 'ONE Endpoint Multi-IO: SEM Wiegand — 4 entradas de contato seco e 4 relés NA/NF de até 15A (automação de portão/motor). Fonte P4 12V.' },
  { match: /endpoint.*sound|one\s*sound/i, text: 'ONE Endpoint Sound: toca áudios (WAV, microSD 16GB) na portaria remota; saída de 8 ohms, máx 30W, então PRECISA de caixa de som. Fonte 12V.' },
  { match: /aqua\s*monitor/i, text: 'ONE Endpoint AquaMonitor: monitora caixa d\'água. 2 relés (bombas, máx 15A), sonda hidrostática 0-100% (sinal 0-10V, vendida à parte do endpoint), 3 entradas para sensores (temperatura, umidade, vibração, corrente). Ethernet ou Wi-Fi. Fonte P4 12V/2A.' },
  { match: /mesa\s*(de\s*)?cadastro/i, text: 'ONE Mesa de Cadastro USB: cadastra tags RFID 13MHz (Mifare) e 125MHz e controles remotos RF 433,92MHz (Linear, Citrox CX-7421, PPA ZAP 2 e 4). Conexão USB (Windows/Linux/iOS). É ferramenta de cadastro, 1 por operação, não por portaria.' },
  { match: /receptor.*433|433.*receptor|(receptor|receptora|recpetora)\s*full/i, text: 'ONE Receptor 433 (Delay/FULL): recebe controles remotos 433,92MHz e entrega Wiegand 26 bits (liga no Endpoint 4 Portas/FULL); alcance ~40m; 12V; 1 unidade atende vários portões. O FULL tem antena externa, limitação de frequência, code learning e delay p/ Nice.' },
  { match: /f(alt|alh)a\s*(de\s*)?energia/i, text: 'ONE Sensor de Falha de Energia: entrada 110/220V, saída contato seco (NF com energia, NA sem). Deve ser ligado direto na rede elétrica, nunca depois do nobreak (senão não detecta a falta).' },

  // ---------- SIAM ----------
  { match: /idbm|\bras\b|siam/i, text: 'SIAM (rede RAS): a central iDBM+ comanda um barramento RAS de dispositivos (controladoras, leitoras de expansão, sensores IMU, atuadores). O manual dá 55-65 dispositivos como limite absoluto e avisa problemas acima de 50 — não passar de ~50 por iDBM+. Cabo recomendado: cobre 0,5mm (CCI 4/6 vias ou UTP CAT5e). Distância máx. do cabo cai com a quantidade de dispositivos: 5 disp = ~190m, 10 = ~95m, 15 = ~63m, 20 = ~47m.' },
  { match: /protetor\s*ras|protetor\s*de\s*linha/i, text: 'SIAM Protetor RAS: protege só a comunicação RAS (não a fonte). Duas saídas protegidas, máx 15 dispositivos por saída; acima de 30 dispositivos exige outro protetor. Indicado quando o cabo RAS sai do painel da iDBM+.' },
  { match: /ptsm|multiplicador|testador\s*ras/i, text: 'SIAM Multiplicador PTSM-6: distribui a alimentação/RAS a vários dispositivos, corrente máx 10A na entrada. Testador RAS: ferramenta de instalação (não é item por obra).' },
  { match: /\bliva\b|cubieboard|servidor\s*siam/i, text: 'SIAM Servidor (mini PC Ubuntu, linhas LIVA/Cubieboard): guarda todo o sistema WSSIAM; cada servidor LIVA atende até 4 iDBM+. Fonte 12V/3A (LIVA X, X2, Concordia) ou 19V/3,42A (LIVA Z, ZE, ZA) — fontes diferentes, não intercambiáveis.' },
  { match: /1p4l|controladora\s*ras/i, text: 'SIAM Controladora RAS 1P4L: controle de acesso de portas/portões com leitoras Wiegand (RFID, senha, biometria); leitoras QR Code e controle remoto entram pela expansão. Até 30.000 chaves, 7.000 usuários e 16 dispositivos simultâneos. Precisa estar na rede RAS (iDBM+).' },
  { match: /ip\s*controller|\bipc\b|dual\s*gate|dualgate/i, text: 'SIAM IP Controller (IPC, RS485): até 65.000 chaves/usuários; aceita leitoras SIAM, Wiegand e integradas via API (RFID, senha, biometria, facial, QR). Dual Gate é EXPANSÃO da IPC (2 gateif, não funciona sozinha; até 8 dispositivos IPC/Dual Gate). Manuais marcados "em desenvolvimento".' },
  { match: /i12o2/i, text: 'SIAM I12O2: filho da IPC via RS485; até 24 sensores (12 zonas duplas) e 2 cargas de até 4A. Configuração só via Postman por enquanto (produto em desenvolvimento).' },
  { match: /i8o2|i802/i, text: 'SIAM i8O2: 2 relés + 8 entradas de zona dupla. Como central de alarme: até 16 sensores em até 4 partições, evento via Contact ID. O firmware é diferente por função — i8O2 de catraca NÃO substitui i8O2 de automação (e vice-versa).' },
  { match: /bruson|digicon|\bfoca\b|alianza|1cxl|stile/i, text: 'SIAM Catracas: a SIAM não fabrica a catraca, integra as de mercado (Digicon Catrax Plus, Bruson, Foca com placa FC-150, Alianza) com controladora 1CXL ou i8O2 Stile + leitoras. Se a catraca já tem placa de comando (ex.: Digicon) a integração é diferente da catraca sem placa (Bruson sem CPU Lite).' },
  { match: /controladora\s*(de\s*)?elevador/i, text: 'SIAM Controladora de Elevador: PCI instalada dentro do painel do elevador, liga nas teclas (chaves ópticas) para limitar os andares por usuário — exige abrir o painel do elevador (serviço de instalação).' },
  { match: /discador/i, text: 'SIAM Discador CID: backup de envio Contact-ID para a central de monitoramento por linha telefônica ou rádio/GPRS. Só funciona com receptores que usam CID (SIGMA, MONI, IRIS).' },
  { match: /\b(q101|le[\s-]?170|kr00\d|r00\d|c00\d)\b/i, text: 'SIAM Leitoras: Q101 e LE 170 são UHF passivo 900MHz (veicular; Q101 até 4m, LE 170 até 12m; Wiegand 26/34, 12V) — acima de 3m de cabo na Q101 usar fonte auxiliar. KR00x = RFID+senha IP68 (área externa); R00x = RFID econômica IP65; C00x = leitoras de controle remoto (alcance 80-100m). Todas usadas com controladora SIAM.' },
  { match: /\bimu\b|imee|no-?break\s*monitor|interface\s*sensor\s*de\s*tens/i, text: 'SIAM Sensores da rede RAS: IMU Discreto (2 sensores NF/NA), IMU Inundação (sonda de água), IMU Tensão (110/220V, avisa falta de energia), IMEE Monofásico (medição de energia), No-Break Monitor (monitora nobreak: 2 tensões DC + rede AC).' },
  { match: /atuador\s*(rel[eé]|triac)|\b1a1r\b/i, text: 'SIAM Atuadores (rede RAS): Atuador Relé 1A1R (motores, bombas, lâmpadas de maior potência) e Atuador TRIAC (só lâmpadas em corrente alternada).' },
  // ---------- INTELBRAS (alarme, CFTV, rede) — datasheets oficiais em backend.intelbras.com ----------
  { match: /amt\s*-?\s*4010/i, text: 'Intelbras AMT 4010 SMART / SMART NET (datasheet oficial): 8 zonas na placa (modo duplicado) + 2 por teclado (o XAT 4000 LCD já vem incluso, daí o "10 zonas" do catálogo); EXPANDE até 64 zonas com fio (4 teclados + até 6 expansores XEZ 4008 de 8 zonas) e até 48 zonas sem fio (precisa do receptor XAR 4000 SMART, até 128 dispositivos). 3 PGM, sirene 1A, 4 teclados + 4 receptores no BUS, 2 destinos IP. Ethernet e GPRS exigem módulo (XE 4000, XG 4000 ou XEG 4000 SMART). Bateria 7Ah/12V.' },
  { match: /amt\s*-?\s*2[01]18/i, text: 'Intelbras AMT 2018 E / EG (datasheet oficial): 16 zonas na placa (modo duplicado) + 2 por teclado = "18 zonas" do catálogo; máximo de 24 zonas com fio (4 teclados). 2 PGM, até 128 dispositivos sem fio (só com receptor XAR 4000 SMART). E = Ethernet; EG = Ethernet + GPRS (2 SIM).' },
  { match: /amt\s*-?\s*8000|xas\s*8000|ivp\s*8000|xss\s*8000|xat\s*8000|xac\s*8000|tx\s*8000/i, text: 'Intelbras Sistema 8000 (datasheet oficial): AMT 8000 é central 100% sem fio (915-928 MHz, criptografada e supervisionada), 64 zonas, 16 partições, até 16 teclados XAT 8000, 16 sirenes XSS 8000 e 98 controles XAC 8000; comunica por Ethernet, Wi-Fi e GPRS. Os acessórios da linha 8000 (XAS 8000, IVP 8000, XSS 8000, XAT 8000, XAC 8000, TX 8000) só funcionam com a AMT 8000 (alcance ~1000 m sem barreira) — não usam receptor XAR nem zona com fio.' },
  { match: /xez\s*4008/i, text: 'Intelbras XEZ 4008 SMART (datasheet oficial): expansor com 8 zonas simples (com tamper e curto), ligado ao barramento AB (RS485, até 1 km); até 6 por central AMT 4010 SMART (48 zonas a mais).' },
  { match: /xar\s*4000|receptora?\s*intelbras/i, text: 'Intelbras XAR 4000 SMART (datasheet oficial): receptor RF 433,92 MHz (FSK/OOK) das centrais AMT 4010 e AMT 2018 (e linha ANM 2000); obrigatório para qualquer sensor/controle sem fio dessas centrais; até 128 dispositivos; ~100 m em campo aberto.' },
  { match: /\bx(e|g|eg)\s*4000|xeg\s*4010|m[oó]dulo.*\b(xg|xeg|xe)\b/i, text: 'Intelbras módulos de comunicação da AMT 4010/2018 (datasheets oficiais): XE 4000 SMART = Ethernet; XG 4000 SMART = GPRS (2 SIM); XEG 4000 SMART = Ethernet + GPRS (2 SIM, antena externa). São módulos de comunicação, não centrais.' },
  { match: /ivp\s*(5001|5002|5311|7001|7000\s*mw)/i, text: 'Intelbras sensores infravermelhos COM FIO (datasheets oficiais): IVP 5001 PET / PET SHIELD (12 m, pet até 20 kg), IVP 5002 PET (12 m, pet até 35 kg), IVP 5311 MW PET (tripla tecnologia, 12 m, pet 20 kg, micro-ondas 10,525 GHz). Alimentação 9 a 16 Vdc; cada um ocupa 1 zona com fio da central.' },
  { match: /xas\s*4010|ivp\s*7000\s*smart|xac\s*(4000|4004)/i, text: 'Intelbras linha SMART sem fio, 433,92 MHz (datasheets oficiais): XAS 4010 SMART (sensor magnético, pilha 3V, ~100 m), IVP 7000 SMART EX (PIR 12 m, pet 30 kg, 3V), XAC 4000 SMART (controle remoto, 3 teclas). Cada um precisa do receptor XAR 4000 SMART na central (AMT 4010/2018); usam zona sem fio, não zona com fio.' },
  { match: /xat\s*(2000|4000)/i, text: 'Intelbras teclados LCD com fio (datasheets oficiais): XAT 2000 LCD (barramento T1T2, 9-16V, 190 mA) e XAT 4000 LCD (barramento longa distância de 1 km, 100 mA); cada teclado soma 2 zonas à central.' },
  { match: /\bvipc?\s*(1220|1230|3250|3430)/i, text: 'Intelbras câmeras IP VIP 1220 B Full Color, VIP 1230 FC+, VIP 3250 AL IA e VIP 3430 B IA (datasheets oficiais): TODAS alimentam por PoE 802.3af ou 12 Vdc (conector P4) — contam como câmera IP PoE. "VIP" é linha IP, nunca analógica (analógica é VHD/VHL).' },
  { match: /nvd\s*(3308|1408|1416|1432)|nvd\s*3032/i, text: 'Intelbras NVRs (datasheets oficiais): a versão "-P" traz portas PoE (NVD 3308-P: 8 canais com 8 portas PoE; NVD 1408-P tem 8 PoE); NVD 1408, 1416, 1432 e iNVD 3032 NÃO têm PoE — câmera PoE nelas exige switch PoE.' },
  { match: /sf\s*800\s*q|sg\s*800\s*q|sf\s*18(11|21|22)/i, text: 'Intelbras switches (datasheets oficiais): SG 800 Q+ = 8 portas Gigabit sem PoE; SF 800 Q+ = 8 portas Fast (10/100) sem PoE de saída — a porta LAN 1 só aceita PoE passivo de ENTRADA para alimentar o próprio switch; SF 1811 PoE = 16 Fast PoE/PoE+ + 1 Gigabit + 1 SFP; SF 1822 Hi-PoE = 16 Fast PoE+ (2 Hi-PoE) + 2 Gigabit + 2 SFP.' },
  { match: /fe\s*21150|bt\s*3000/i, text: "Intelbras controle de acesso (datasheets oficiais): FE 21150 D é fechadura eletroímã de 150 kgf (NÃO é fechadura elétrica comum), 12 Vdc, 400 mA, ~4,8 W, para portas de madeira/alumínio/aço/vidro, com ou sem sensor de porta fechada; BT 3000 IN é acionador de saída (botoeira) inox de sobrepor, para liberar a porta sem identificar o usuário." },
  { match: /xpe\s*1001\s*ip|ipr\s*8000/i, text: "Intelbras porteiros (datasheets oficiais): XPE 1001 IP é porteiro eletrônico IP externo de 1 tecla, viva-voz full-duplex (áudio, sem câmera), SIP (RFC3261), saída para fechadura e cadastro de até 1000 usuários por cartão RFID. IPR 8000 IN é a extensão de áudio do porteiro residencial IPR 8000: até 3 extensões, sem entrada de linha telefônica (não liga em PABX), alimentação 18 Vdc/330 mA no módulo externo." },
  { match: /fxo\s*8000/i, text: "Intelbras FXO 8000 (datasheet oficial): módulo de linha telefônica da AMT 8000 — comunica eventos por linha telefônica (Contact ID, discagem DTMF, 8 memórias de 20 dígitos, detecção de corte de linha, protetor a gás + PTC)." },
  { match: /\bth\s*-?\s*(1000|2000)/i, text: "Intelbras tags RFID (datasheets oficiais): TH 2000 é cartão 125 kHz (86x54 mm, código único de 64 bits); TH 2000 MF é cartão 13,56 MHz (Mifare); TH 1000 é chaveiro/tag passivo 125 kHz; TH 1000 MF é o de 13,56 MHz; TH 1000 DT é dupla tecnologia (125 kHz + 13,56 MHz). O leitor precisa ser da mesma frequência da tag." },
  { match: /w5[\s-]*1200g/i, text: "Intelbras roteador Wi-Force W5-1200G (datasheet oficial): Wi-Fi 5 (802.11ac, 867 Mbps em 5 GHz + 300 Mbps em 2,4 GHz), 4 portas Gigabit (1 internet + 3 LAN), até ~40 dispositivos e ~120 m², para planos de até ~400 Mbps; MU-MIMO e inMesh." },
  { match: /ivp\s*8000/i, text: "Intelbras IVP 8000 (datasheets oficiais, linha 8000 sem fio, só com AMT 8000): IVP 8000 PET é PIR interno com imunidade a pet de até 20 kg e tamper frontal/traseiro; IVP 8000 EX é para área externa/semiaberta (protegido contra poeira e água, imune a luz branca), comunicação bidirecional supervisionada." },
  { match: /universal\s*4020|tx\s*(4020|8000)|transmissor\s*universal|xac\s*3000/i, text: "Intelbras transmissores e controles (datasheets oficiais): TX 4020 SMART e TX 8000 são TRANSMISSORES UNIVERSAIS — transformam um sensor COM fio em sem fio (fio de até 1 m entre eles), não é controle remoto; o TX 4020 usa pilha CR2032 e precisa do receptor XAR 4000 (linha SMART), o TX 8000 só funciona com a AMT 8000. XAC 3000 4K é controle remoto de 4 teclas (bateria 9 V)." },
  // ---------- HIKVISION / HiLook — datasheets oficiais em assets.hikvision.com ----------
  { match: /ds-?\s*2cd\s*\d|hikvis[io]?n\s*ip\b/i, text: "Hikvision câmeras IP DS-2CD1021G0-I, DS-2CD1023G0(E)-I, DS-2CD1027G0-L, DS-2CD1323G0E-I, DS-2CD1327G0-L e DS-2CD2047G2-LU (datasheets oficiais): TODAS aceitam 12 Vdc ou PoE 802.3af (Classe 3, 36-57 V, no máx. ~7,5 W) — contam como câmera IP PoE. Porta Ethernet 10/100 (a 2047G2 tem 4 MP ColorVu, 2688x1520); precisam de NVR/gravação IP. 1323 é dome/turret; as demais são bullet." },
  { match: /ds-?\s*2de\s*\d/i, text: "Hikvision PTZ DS-2DE5425IW-AE (datasheet oficial): speed dome IP 4 MP com zoom 25x e IR de até 150 m; alimenta por 24 VAC (máx. 24 W) ou PoE+ (802.3at) — um switch PoE comum 802.3af NÃO basta; IP66." },
  { match: /ds-?\s*2ce\s*\d|dsce\d|thc-?\s*t\d|hilook|hillok|turbo\s*hd\s*20m/i, text: "Hikvision/HiLook câmeras analógicas Turbo HD (DS-2CE10DF0T, DS-2CE12DF8T, DS-2CE76D0T-EXIPF, THC-T127-P) (datasheets oficiais): alimentam só 12 Vdc ±25% (sem PoE), sinal por cabo coaxial/balun para DVR HDTVI/AHD/CVI. ColorVu = imagem colorida à noite (F1.0). 2 MP." },
  { match: /ds-?\s*7[0-9]{3}h[gq]hi|dvr\s+hikvision/i, text: "Hikvision DVR Turbo HD (ex.: DS-7216HGHI-K1, datasheet oficial): 16 canais analógicos HDTVI/AHD/CVI/CVBS + canais IP, 1 SATA (até 10 TB), saída HDMI 1080p. Gravação das câmeras analógicas Turbo HD; não alimenta câmera." },
  { match: /ds-?\s*7[0-9]{3}n[xi]|nvr\s+hikvision/i, text: "Hikvision NVRs (datasheets oficiais): DS-7632NI-K2 = 32 canais IP, 256 Mbps de entrada, 2 SATA de até 10 TB, 4 entradas/1 saída de alarme, sem PoE (a versão /16P tem 16 portas PoE); DS-7632NXI-K2 = AcuSense (análise de humano/veículo). Modelos \"SEM POE\" precisam de switch PoE para câmeras PoE." },
  { match: /ds-?\s*3e\s*\d|switch\s+hikvision/i, text: "Hikvision switches PoE (datasheets oficiais): DS-3E0518P-E/M = 16 portas Gigabit PoE + 2 SFP, 150 W, 100-240 VAC; DS-3E0105P-E = 4 Fast PoE + 1 uplink, 65 W, 48 VDC; DS-3E1105P-EI = 4 Fast PoE + 1 RJ45, gerenciável (smart), orçamento PoE 60 W; DS-3E0109P-E/M = 8 portas Fast PoE; DS-3E0310P-E/M = switch PoE não gerenciável de 8 portas. PoE até 300 m em modo long range." },
  { match: /ds-?\s*k1t\s*\d|dsk1t/i, text: "Hikvision DS-K1T (671M, 673DX, 342MFWX, 343EWX) é terminal de reconhecimento facial de controle de acesso (datasheets oficiais): K1T673DX 7\" 12-24 VDC/2 A, 10.000 faces; K1T342MFWX 4,3\" 12 VDC/1 A, 1.500 faces, áudio bidirecional com tela interna (indoor station) e Wi-Fi; leem também cartão. Podem operar como porteiro facial, mas a base é controle de acesso." },
  { match: /ds-?\s*kh\s*\d|dskh|ds-?\s*kb8113/i, text: "Hikvision porteiro IP (datasheets oficiais): DS-KH6320-WTE1 e DS-KH6350-TE1 são a tela interna (indoor station) de 7\" touch, ≤ 5 W, com 2 relés de fechadura (30 VDC/0,3 A) e entradas de alarme — NÃO são o porteiro externo; DS-KB8113-IME1 é o porteiro externo (door station) antivandalismo." },
  { match: /dsk3g|ds-?\s*k3g/i, text: "Hikvision DS-K3G411LX (datasheet oficial): catraca tripod (pedestal) em aço SUS304, passagem de 550 mm, mais de 35 pessoas/min; integra com terminal facial/leitor de acesso." },
];

// Fichas de outros fabricantes (Intelbras, Hikvision/HiLook) levam `brand`: no assistente NÃO vão todas
// a cada mensagem (eram ~2,3 mil tokens a mais por pergunta) — só as do modelo citado na conversa, ou
// todas da marca quando a marca é citada. As ONE/SIAM (foco do assistente) ficam sempre no prompt.
const BRAND_MENTION = { intelbras: /intelbras/i, hikvision: /hikvision|hilook|hik-?connect/i };
for (const k of EQUIPMENT_KNOWLEDGE) {
  if (/^Intelbras/.test(k.text)) k.brand = 'intelbras';
  else if (/^Hikvision/.test(k.text)) k.brand = 'hikvision';
}

function assistantKnowledge(history) {
  const text = history.map((m) => m.content).join('\n');
  return {
    core: EQUIPMENT_KNOWLEDGE.filter((k) => !k.brand),
    cited: EQUIPMENT_KNOWLEDGE.filter((k) => k.brand && (k.match.test(text) || BRAND_MENTION[k.brand].test(text))),
  };
}

function relevantKnowledge(items) {
  const names = items.map((i) => i.name);
  return EQUIPMENT_KNOWLEDGE.filter((k) => names.some((n) => k.match.test(n))).map((k) => `- ${k.text}`).join('\n');
}

// Assistente de conversa (aba "Assistente"): a pergunta é livre e não dá pra saber pelo nome do item qual
// ficha importa, então as ONE/SIAM vão sempre; as de outras marcas só quando a conversa cita modelo/marca.
const ASSISTANT_MAX_MESSAGES = 20;
// O limite de 2000 vale só pra pergunta nova (última mensagem). As anteriores são histórico — inclusive
// respostas do próprio assistente, que passam de 2000 (maxTokens 1200) — e entram cortadas em
// ASSISTANT_HISTORY_MAX_CHARS em vez de barrar a pergunta seguinte.
const ASSISTANT_MAX_CHARS = 2000;
const ASSISTANT_HISTORY_MAX_CHARS = 8000;

function validateAssistantMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('Envie ao menos uma pergunta.');
  const recent = messages.slice(-ASSISTANT_MAX_MESSAGES);
  const clean = recent.map((m, i) => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') throw new Error('Mensagem inválida.');
    const content = m.content.trim();
    const isLast = i === recent.length - 1;
    if (!content || (isLast && content.length > ASSISTANT_MAX_CHARS)) throw new Error(`Cada mensagem deve ter de 1 a ${ASSISTANT_MAX_CHARS} caracteres.`);
    return { role: m.role, content: isLast ? content : content.slice(0, ASSISTANT_HISTORY_MAX_CHARS) };
  });
  if (clean[clean.length - 1].role !== 'user') throw new Error('A última mensagem precisa ser uma pergunta.');
  return clean;
}

// Contas que os comerciais pedem no dia a dia (autonomia, dias de gravação, PoE, bitola, link). O
// modelo roda sem raciocínio e erra aritmética solta — com a fórmula escrita ele segue o passo a
// passo e mostra a conta, que dá pra conferir. Valores típicos são referência de mercado, não ficha.
// ponytail: aritmética ainda é do modelo; se o log (assistant_logs) mostrar contas erradas, trocar
// por tool calling com funções JS.
const SIZING_FORMULAS = [
  'Nobreak: potência útil (W) ≈ VA × fator de potência (0,6 nos nobreaks comuns; conferir etiqueta). Carga acima disso não sustenta. Energia da bateria (Wh) = tensão (V) × Ah × nº de baterias (sem o modelo, supor bateria interna típica de nobreak nacional: até 800VA = 1 × 12V 7Ah; 1200-1500VA = 2 × 12V 7Ah; e avisar para conferir); útil ≈ 70% disso (perdas do inversor e descarga incompleta). Autonomia (h) ≈ Wh útil ÷ carga (W). Carga = soma do CONSUMO dos equipamentos, não da capacidade das fontes (fonte 12V/5A não significa 60W consumidos). Carga alta derruba a autonomia mais que o proporcional.',
  'Gravação (DVR/NVR): GB por dia por câmera ≈ bitrate (Mbps) × 10,8. Dias ≈ capacidade útil (GB; 1 TB ≈ 930 GB úteis) ÷ (nº de câmeras × GB/dia). Bitrate típico em H.265, gravação contínua: 1080p ≈ 2 Mbps, 4MP ≈ 3-4 Mbps, 8MP/4K ≈ 6 Mbps; H.264 ≈ o dobro; gravação só por movimento reduz bastante.',
  'PoE: soma do consumo das câmeras ≤ orçamento PoE total do switch (não só o por porta), com ~20% de folga. Porta 802.3af entrega até 15,4W, 802.3at até 30W. Cabo UTP no máximo 100 m por lance.',
  'Queda de tensão em 12V DC: ΔV = 2 × distância (m) × corrente (A) × 0,0172 ÷ bitola (mm²), para cobre puro. Cabo CCA (cobre-alumínio) ≈ 1,6× mais queda. Equipamento 12V tolera ~10% (1,2V); passou disso, aumentar a bitola, aproximar a fonte ou usar fonte local.',
  'Link de internet (acesso remoto): upload ≈ soma dos bitrates das câmeras vistas ao mesmo tempo (substream ≈ 0,5 Mbps por câmera, stream principal = bitrate de gravação) + 30% de folga.',
];

function buildAssistantSystemPrompt(history = []) {
  const { core, cited } = assistantKnowledge(history);
  return [
    'Você é o assistente técnico-comercial do SPECIUM, usado por vendedores de segurança eletrônica.',
    'SEU FOCO PRINCIPAL são os sistemas ONE PORTARIA e SIAM: projeto, o que é preciso, quantidades, ligações, limites e cuidados de instalação. Conhecimento geral de segurança eletrônica (CFTV, rede, energia, cabeamento) vem DEPOIS, como apoio.',
    'Ordem de prioridade das fontes: 1) as fichas ONE/SIAM abaixo (fonte oficial; não invente número, modelo ou limite que não esteja nelas; cada ficha vale só para o modelo que ela nomeia — ex.: os 30 endpoints são do Córtex AG, não do V5/V6); 2) fórmulas de dimensionamento; 3) conhecimento geral, sempre dizendo que é referência de mercado e não dado do fabricante.',
    'Equipamento de terceiros usado junto com ONE/SIAM (ex.: antena UHF de tag veicular, leitor facial, leitora, fechadura, catraca, motor de portão de outra marca): responda pelo lado ONE/SIAM — em qual equipamento ONE/SIAM ele liga, por qual interface (Wiegand, contato seco, relé, rede) e quais limites das fichas se aplicam (ex.: Wiegand só no Endpoint 4 Portas/FULL, cabo Wiegand até 30 m, fonte separada). Na ONE, lembre que só vale equipamento homologado (lista no Blog de Equipamentos da ONE). Especificação do equipamento de terceiros que não está nas fichas: diga o que costuma ser e peça para confirmar no datasheet do fabricante.',
    'Regras que NÃO podem ser quebradas: (a) número que a ficha de um modelo não traz = diga "a ficha não informa, confirmar com a ONE/SIAM" — NUNCA use o limite de outro modelo como estimativa "segura"; (b) não afirme se um equipamento está ou não na lista de homologados da ONE — você não tem a lista, mande conferir; (c) regra de um fornecedor não vale para o outro (ex.: Wiegand até 30 m é do guia ONE, não do SIAM); (d) ONE = Córtex, Endpoints, Receptor 433, Mesa de Cadastro, sensores ONE; SIAM = iDBM+, rede RAS, LIVA, 1P4L, IPC, i8O2, IMU, leitoras Q101/LE 170 etc. — nunca atribua esses produtos a outra marca.',
    'Pergunta fora de ONE/SIAM: responda normalmente com conhecimento geral e, se fizer sentido, conecte com o sistema ONE/SIAM.',
    'Responda em português do Brasil, direto e prático (listas curtas quando ajudar).',
    'Se faltar dado para responder com número (carga em W, nº de câmeras, portas, portões, distância, modelo), PERGUNTE antes. Se der para estimar, estime deixando as premissas explícitas ("considerando X, ...") e diga o que mudaria o resultado.',
    'Em contas de dimensionamento, use as fórmulas e SEMPRE mostre a conta passo a passo, com unidades.',
    'Quando o comercial passar os requisitos de um projeto ou pedir um orçamento, monte um ORÇAMENTO SUGERIDO: uma linha por equipamento, no formato exato "- 2x Nome do equipamento" (quantidade, "x", nome; observação curta entre parênteses se precisar). Use esse formato "- Nx" SOMENTE nas linhas do orçamento — ele vira botão de importar para a tela de Orçamentos. Depois da lista, diga as premissas e o que falta confirmar. Faltando dado essencial (nº de portas, portões, câmeras), pergunte antes de montar.',
    'Endpoint ONE: no orçamento sugerido use SEMPRE o "Endpoint ONE FULL" (4 relés, 8 entradas de sensor, 2 Wiegand). Só escreva "Endpoint ONE 4 Portas" se o comercial pediu esse modelo; se pediu, mantenha o 4 Portas e não troque por FULL.',
    'Botoeira de saída é SUGESTÃO, nunca item automático: o comercial pode sair por facial (2 faciais na mesma porta, um de entrada e outro de saída), controle remoto ou outro meio. Só coloque botoeira na lista se ele pediu; se não pediu, deixe fora da lista e, em "Falta confirmar", pergunte se quer 1 por porta (cada botoeira ocupa 1 entrada de sensor do Endpoint e pode exigir mais 1 endpoint). Se ele disse que a saída é por facial, não pergunte. Quando a botoeira ficou de fora e ele NÃO disse como será a saída, a seção "Falta confirmar" TEM que trazer a pergunta (ex.: "Quer botoeira de saída em cada porta? Cada uma ocupa 1 entrada de sensor do Endpoint."), não só uma nota nas premissas. Regras do orçamento sugerido: (0) ANTES da lista, escreva em 3 linhas a contagem de relés, sensores e Wiegand e o nº de endpoints (ficha DIAGRAMA DE LIGAÇÕES); a quantidade de Endpoint na lista tem de ser IGUAL a essa conta, e faciais e câmeras (rede) não entram nela; (1) quantidade é a sua melhor estimativa pelo que foi pedido (ex.: 4 faciais = 4 faciais), nunca "1" como marcador de "a definir"; (2) dimensione pelo MÍNIMO que atende usando os limites das fichas e a conta do DIAGRAMA DE LIGAÇÕES (relés, sensores e Wiegand separados; o nº de endpoints sai da conta, sem Endpoint extra "de reserva/expansão" e sem Multi-IO/FULL que a conta não exija; sensor só na quantidade pedida — 4 portas + 2 portões com sensor = 6, não 8; Receptor 433 só se o comercial pediu controle remoto) (ex.: 1 Endpoint 4 Portas tem 4 relés e 4 Wiegand — 3 acessos cabem num só); (3) item ONE/SIAM só com nome que existe nas fichas — não invente produto do fornecedor (ex.: não existe "câmera ONE"; câmera é genérica, ex.: "Câmera IP Full HD"); (4) inclua os itens de apoio que as fichas exigem (fonte de cada endpoint, fonte dos eletroímãs, switch, nobreak, cabo).',
    'Conversa com várias rodadas: TUDO que o comercial já respondeu é FATO, vale até ele mudar. Antes de escrever, releia TODAS as mensagens dele e aplique cada resposta ao orçamento. Nunca pergunte de novo nem liste como premissa algo que ele já respondeu (tipo de motor, antena ou controle remoto, função da solenoide, quantidade de câmeras...). Não copie as premissas ou perguntas da sua resposta anterior: reescreva a partir das respostas mais recentes. Se ele disse que o motor é contato seco, o item não leva "se o motor não tiver contato seco"; se disse "sem controle remoto", não liste controle nem receptor. Em "Premissas" entra só o que VOCÊ assumiu sem ele ter confirmado; em "Falta confirmar" só o que ele ainda não respondeu. Se não sobrar nada, escreva "Nada pendente para confirmar." e não invente perguntas.',
    '',
    'Fichas técnicas ONE / SIAM (fonte principal):',
    core.map((k) => `- ${k.text}`).join('\n'),
    ...(cited.length ? ['', 'Fichas de outros fabricantes citados na conversa (datasheets oficiais; valem só para o modelo que nomeiam):', cited.map((k) => `- ${k.text}`).join('\n')] : []),
    '',
    'Fórmulas de dimensionamento (apoio):',
    SIZING_FORMULAS.map((f) => `- ${f}`).join('\n'),
    '',
    // No fim de propósito: modelo sem raciocínio obedece mais o que leu por último.
    'LEMBRETE FINAL: não repita pergunta que o comercial já respondeu nesta conversa; as respostas dele mandam sobre as suas premissas antigas.',
    'FORMATO OBRIGATÓRIO: a tela só mostra texto simples, listas com "-" e **negrito**. PROIBIDO: tabelas (|), LaTeX, títulos com #, linhas "---" e blocos de código. Contas em linha (ex.: 24 V × 7 Ah = 168 Wh).',
  ].join('\n');
}

async function askEquipmentAssistant(messages) {
  const history = validateAssistantMessages(messages);
  const { content, model } = await callOpenRouter({
    messages: [{ role: 'system', content: buildAssistantSystemPrompt(history) }, ...history],
    temperature: 0.3,
    maxTokens: 1200,
    models: candidateModels(process.env.OPENROUTER_MODEL_AUDIT || process.env.OPENROUTER_MODEL),
    reasoning: { enabled: false },
  });
  return { answer: content.trim(), model };
}

// "Criar orçamento" a partir de uma resposta do assistente: só as linhas "- 2x Item" (formato que o
// prompt pede) viram item — o resto do texto (premissas, observações) não entra. Quem casa o nome
// com a categoria do catálogo é o mesmo classificador da auditoria de PDF (classifyQuoteItems).
// O front usa a mesma regex pra decidir se mostra o botão.
const BUDGET_LINE = /^\s*[-*•]\s*(\d+)\s*x\s+(.+?)\s*$/i;

function extractBudgetLines(answer) {
  return String(answer || '').replace(/\*\*/g, '').split('\n')
    .map((line) => line.match(BUDGET_LINE))
    .filter(Boolean)
    .map((m) => `${m[1]}x ${m[2].replace(/\s*\(.*$/, '').trim()}`);
}

// Uma linha = um card, mesmo com categoria repetida: duas linhas na mesma categoria (ex.: dois
// Endpoint ONE, ou duas Fontes 12V de amperagens diferentes) somadas esconderiam o que cada card é —
// separado, o comercial escolhe o produto certo em cada um. Nada é descartado em silêncio: linha sem
// categoria no catálogo (ex.: ONE Córtex V6) entra como card livre, com o nome da linha sem o
// comentário entre parênteses, e vem listada em `unclassified` pro aviso na tela. Posições em
// fileiras e ligações saem do motor de recursos: lib/budgetLinks.js.
const FREE_TITLE_MAX = 80;

// Quantos Endpoint ONE o orçamento precisa: o modelo de linguagem erra essa conta, o motor não. O padrão
// é o FULL (8 entradas de sensor contra 4); o 4 Portas só é dimensionado se o comercial já pediu (card no orçamento).
// Demanda = relés, entradas de sensor e Wiegand que os outros cards consomem (requisitos de capacidade
// one.* das categorias); oferta dos FULL/Multi-IO já listados abate antes. Só age em orçamento ONE
// (tem Central ou Endpoint ONE). Devolve avisos pra tela, um por ajuste.
const ONE_ENDPOINT_DEFAULT = 'Endpoint ONE FULL';
const ONE_ENDPOINT_REQUESTED = 'Endpoint ONE 4 Portas';
const ONE_RESOURCE_LABEL = { 'one.relay': 'relés', 'one.sensor_input': 'entradas de sensor', 'one.wiegand_input': 'entradas Wiegand' };

function sizeOneEndpoints(items, categories) {
  if (!items.some((i) => /^(Endpoint|Central) ONE/.test(i.title))) return [];
  const byValue = new Map(categories.map((c) => [c.value, c]));
  const resources = Object.keys(ONE_RESOURCE_LABEL);
  const ONE_ENDPOINT = items.some((i) => i.title === ONE_ENDPOINT_REQUESTED) ? ONE_ENDPOINT_REQUESTED : ONE_ENDPOINT_DEFAULT;
  const add = (map, key, n) => { map[key] = (map[key] || 0) + n; };
  const demand = {};
  const others = {};
  for (const item of items) {
    const category = byValue.get(item.title);
    for (const req of category?.requirements || []) {
      for (const r of req.type === 'anyOf' ? req.options : [req]) {
        if (r.type === 'capacity' && resources.includes(r.resource)) add(demand, r.resource, (r.unitsPerItem || 1) * item.quantity);
      }
    }
    if (item.title !== ONE_ENDPOINT) for (const p of category?.provides || []) if (resources.includes(p.resource)) add(others, p.resource, p.amount * item.quantity);
  }
  const per = Object.fromEntries((byValue.get(ONE_ENDPOINT)?.provides || []).map((p) => [p.resource, p.amount]));
  const needed = Math.max(0, ...resources.filter((r) => per[r]).map((r) => Math.ceil(Math.max(0, (demand[r] || 0) - (others[r] || 0)) / per[r])));
  if (!needed) return [];
  const resumo = resources.filter((r) => demand[r]).map((r) => `${demand[r]} ${ONE_RESOURCE_LABEL[r]}`).join(', ');
  const card = items.find((i) => i.title === ONE_ENDPOINT);
  if (!card) {
    items.push({ id: items.length + 1, title: ONE_ENDPOINT, quantity: needed, icon: byValue.get(ONE_ENDPOINT)?.icon || null, containerId: null, containerOpen: true });
    return [`${ONE_ENDPOINT}: o orçamento não tem, a conta do diagrama de ligações dá ${needed} (${resumo}).`];
  }
  if (card.quantity === needed) return [];
  const before = card.quantity;
  card.quantity = needed;
  return [`${ONE_ENDPOINT}: o orçamento tem ${before}, a conta do diagrama de ligações dá ${needed} (${resumo}).`];
}

function buildBudgetFromClassified(classified, categories) {
  const iconByValue = new Map(categories.map((c) => [c.value, c.icon || null]));
  const items = [];
  const unclassified = [];
  const skipped = [];
  for (const entry of classified) {
    if (entry.category) {
      items.push({ id: items.length + 1, title: entry.category, quantity: entry.quantity, icon: iconByValue.get(entry.category), containerId: null, containerOpen: true });
      continue;
    }
    const title = String(entry.name || '').replace(/\s*\(.*$/, '').trim().slice(0, FREE_TITLE_MAX);
    if (!title) { skipped.push('(sem nome)'); continue; }
    items.push({ id: items.length + 1, title, quantity: entry.quantity, icon: null, containerId: null, containerOpen: true });
    unclassified.push(title);
  }
  const adjustments = sizeOneEndpoints(items, categories);
  const { positions, connections } = layoutAndLinkItems(items, categories);
  return { items, positions, connections, unclassified, skipped, adjustments };
}

module.exports = {
  EQUIPMENT_KNOWLEDGE, SIZING_FORMULAS, relevantKnowledge, validateAssistantMessages, buildAssistantSystemPrompt, askEquipmentAssistant,
  extractBudgetLines, buildBudgetFromClassified,
};
