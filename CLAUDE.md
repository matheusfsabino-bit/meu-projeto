# Instruções para o Claude Code — Hub Aurex

## Contexto do projeto

Sistema interno da mesa de câmbio **Aurex FX** (Matheus Sabino).  
Projeto em desenvolvimento ativo. Branch: `develop`.

O arquivo principal é `frontend/calculadora-fx.html` — é um single-file app com todas as abas do hub.  
O backend em `backend/server.js` roda na porta 3001 e expõe o endpoint de análise de invoice com IA.

---

## Como retomar o trabalho em um novo computador

Se o usuário pedir para "puxar a última atualização" ou "continuar de onde parou":

1. Verificar se o servidor já está rodando:
   ```powershell
   Invoke-WebRequest http://localhost:3001/api/health -UseBasicParsing
   ```

2. Se não estiver rodando, verificar se o `.env` existe:
   ```powershell
   Test-Path "C:\Matheus\Projetos\backend\.env"
   ```
   - Se não existir → pedir para o usuário criar com `ANTHROPIC_API_KEY=...`
   - Se existir → iniciar o servidor:
     ```powershell
     cd C:\Matheus\Projetos\backend
     npm run dev
     ```

3. Puxar últimas alterações do git:
   ```powershell
   cd C:\Matheus\Projetos
   git pull origin develop
   ```

4. Abrir no navegador: http://localhost:3001/calculadora-fx.html

---

## Regras de desenvolvimento

- **Nunca commitar `.env`** — contém a chave da API Anthropic. Já está no `.gitignore`.
- **Nunca remover `override: true`** do dotenv em `server.js` — o Claude Code define sua própria `ANTHROPIC_API_KEY` no ambiente e sobrepõe a do usuário sem esse flag.
- **Sempre trabalhar no branch `develop`**, nunca direto na `main`.
- **Sempre fazer `git push origin develop`** ao final de cada sessão.
- O arquivo `calculadora-fx.html` é single-file — não criar arquivos separados de CSS/JS.
- Não usar frameworks (React, Vue, etc.) — o projeto é HTML/CSS/JS puro por escolha deliberada.

---

## Arquitetura dos cálculos FX

### IOF "por dentro" (efx_aqbens)
- Taxa efetiva = alíquota / (1 - alíquota)
- Ex: 3,38% por dentro → 3,5% / (1 - 0,035) = 3,626943...%

### IR gross-up
- 15% na lei → 17,64706% (= 15/85)
- 25% na lei → 33,33333% (= 25/75)

### Taxa do cliente
- Sempre com 6 casas decimais
- Sempre calculada como `taxaPTAX * (1 + spread%)`

### Moeda estrangeira (moedaME)
- `moedaME = entrada !== 'BRL' ? entrada : saida`
- Currency e Amount sempre mostram a moeda estrangeira, nunca BRL

---

## Estrutura de arquivos

```
frontend/calculadora-fx.html     ← Hub principal (ARQUIVO PRINCIPAL)
frontend/calculadora-auren.html  ← Fx Delta standalone (menos usado)
backend/server.js                ← Express + invoice analysis endpoint
backend/package.json
backend/.env                     ← NÃO está no git (criar manualmente)
```

---

## Estado atual do hub (calculadora-fx.html)

### Abas disponíveis
- **Fx Aurex** — cotação + invoice IA + resumo cliente + PTAX
- **Fx Delta** — simulação spread máxima/mínima com indicador
- **Clientes** — cadastro persistido em localStorage
- **Relatórios** — impressão de operações
- **Gráficos** — TradingView (USDBRL, EURBRL, EURUSD, GBPBRL, Bitcoin)
- **News Aurex** — feed de notícias de câmbio

### Persistência
- Clientes: `localStorage` key `aurex_clientes`
- Histórico: `localStorage` key `aurex_historico`
- Documentos da invoice: `IndexedDB`

### Variáveis globais JS importantes
- `lastResult` — último cálculo realizado (usado para gerar resumo)
- `clientes[]` — array de clientes carregado do localStorage
- `historico[]` — array de operações

### Funções JS principais
- `calcular()` — executa cálculo principal de câmbio
- `invoiceAplicar()` — aplica resultado da IA nos campos do formulário
- `abrirModalResumo()` — gera imagem do card via html2canvas + copia para clipboard
- `buscarPTAX()` — busca PTAX na API do BCB com retry de até 5 dias úteis
- `salvarCliente()` — salva cliente no array + localStorage + atualiza UI
- `_buildQuoteCard(r)` — monta HTML do card de cotação para o cliente

---

## Endpoint da API

`POST http://localhost:3001/api/invoice/analyze`  
- Aceita: `multipart/form-data` com campo `invoice` (PDF, JPG, PNG, WEBP, máx 20MB)
- Retorna: JSON com `beneficiario`, `pais`, `isParaisoFiscal`, `valor`, `moeda`, `naturezaSugerida`, `irAliquota`, `iofAliquota`, `dataInvoice`, `observacoes`
- 12 naturezas suportadas: `imp_merc`, `imp_serv`, `imp_serv_pf`, `inv_ext`, `manut_res`, `transf_prop`, `emp_ext`, `efx_aqbens`, `exportacao`, `exp_serv`, `ied`, `dividendos`

---

## Sobre o usuário

- Nome: Matheus Sabino
- Contexto: mesa de câmbio FX, conhece bem as regras fiscais (IOF, IR, natureza de operações)
- Prefere que o assistente execute diretamente — não quer tutorial para fazer sozinho
- Respostas curtas e diretas, sem blocos longos de texto
- Quando há dúvida sobre regra fiscal/regulatória: implementar como provisório e confirmar com ele
