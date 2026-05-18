# Hub Aurex — Terminal FX Interno

Sistema interno da mesa de câmbio **Aurex FX** para cotações, análise de invoice com IA, gestão de clientes e relatórios.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML/CSS/JS puro — arquivo único `frontend/calculadora-fx.html` |
| Backend | Node.js + Express (`backend/server.js`) na porta **3001** |
| IA | Claude API (`claude-opus-4-7`) via `@anthropic-ai/sdk` |
| Imagens | `html2canvas` (CDN) para gerar resumo da operação |

---

## Setup no primeiro acesso (novo computador)

### 1. Puxar a última versão
```powershell
git pull origin develop
```

### 2. Instalar dependências do backend
```powershell
cd backend
npm install
```

### 3. Criar o arquivo de chave da API (uma vez por máquina)
Crie o arquivo `backend/.env` com o conteúdo:
```
ANTHROPIC_API_KEY=sua_chave_aqui
```
> Este arquivo **nunca vai ao GitHub** (está no `.gitignore`). Você precisa criá-lo manualmente em cada máquina.

### 4. Iniciar o servidor
```powershell
cd backend
npm run dev
```

### 5. Abrir no navegador
- **Hub principal:** http://localhost:3001/calculadora-fx.html
- **Calculadora Aurex:** http://localhost:3001/calculadora-auren.html
- **Health check:** http://localhost:3001/api/health

> **Importante:** sempre abrir via `http://localhost:3001/...` — nunca pelo caminho `file://`, pois o navegador bloqueia chamadas de API locais nesse modo.

---

## Estrutura real do projeto

```
├── frontend/
│   ├── calculadora-fx.html        ← Hub principal (TUDO aqui)
│   └── calculadora-auren.html     ← Calculadora Fx Delta standalone
├── backend/
│   ├── server.js                  ← Express + endpoint de análise de invoice
│   ├── package.json
│   └── .env                       ← NÃO vai ao GitHub (criar manualmente)
└── README.md
```

---

## Funcionalidades do Hub (calculadora-fx.html)

### Aba Fx Aurex
- Cotação de câmbio com cálculo de IOF e IR (por dentro)
- Análise de invoice via IA (PDF/imagem → preenche campos automaticamente)
- PTAX USD/BRL automático via API BCB
- Resumo da operação como imagem (copia direto para o clipboard — cola no WhatsApp)
- Persistência de clientes em localStorage
- Histórico de operações (pendentes / efetivadas)

### Aba Fx Delta
- Simulação de spread com máxima/mínima do dia
- Campo de spread configurável (%)
- Seletor de indicador com % de participação

### Aba Clientes
- Cadastro e listagem de clientes (persistido em localStorage)

### Aba Relatórios
- Impressão de relatório de operações

### Aba Gráficos
- TradingView widgets: USDBRL, EURBRL, EURUSD, GBPBRL, Bitcoin

### Aba News Aurex
- Notícias de câmbio e mercado financeiro

---

## Endpoint da API

### `POST /api/invoice/analyze`
Analisa invoice (PDF, JPG, PNG, WEBP — máx 20MB) e retorna JSON com:
- `beneficiario`, `pais`, `isParaisoFiscal`
- `valor`, `moeda`, `tipoOperacao`
- `naturezaSugerida` (12 tipos: imp_merc, imp_serv, imp_serv_pf, inv_ext, etc.)
- `irAliquota`, `iofAliquota`
- `dataInvoice`, `observacoes`

---

## Regras fiscais implementadas

| Natureza | IOF | IR |
|----------|-----|-----|
| imp_merc | 0% | 0% |
| imp_serv | 3,5% | 17,64706% |
| imp_serv_pf | 3,5% | 33,33333% |
| inv_ext | 1,1% | 0% |
| manut_res | 3,5% | 0% |
| transf_prop | 1,1% | 0% |
| emp_ext | 3,5% | 0% |
| efx_aqbens | 3,5% | 0% |
| exportacao | 0% | 0% |
| exp_serv | 0% | 0% |
| ied | 0,38% | 0% |
| dividendos | 0% | 0% |

IR calculado **por dentro** (gross-up): 15% → 17,64706% / 25% → 33,33333%

---

## Branch de trabalho

```
develop  ←  branch principal de desenvolvimento
```
Sempre commitar e fazer push para `develop`. Nunca trabalhar direto na `main`.
