const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERRO: ANTHROPIC_API_KEY não definida no .env');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Formato não suportado. Use PDF, JPG, PNG ou WEBP.'));
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '..', 'frontend')));

const SYSTEM_PROMPT = `Você é um especialista em câmbio FX e regulamentação fiscal brasileira, com domínio da legislação tributária sobre remessas internacionais, especialmente a IN RFB 1.037/2010 (paraísos fiscais) e a Lei 9.430/1996.`;

const ANALYSIS_PROMPT = `Analise este documento (invoice, fatura, contrato ou recibo) e extraia as informações relevantes para uma operação de câmbio no Brasil.

Retorne APENAS um JSON válido, sem texto adicional antes ou depois, com esta estrutura exata:

{
  "beneficiario": "nome completo da empresa ou pessoa beneficiária (quem receberá o pagamento)",
  "pais": "nome do país do beneficiário em português",
  "isParaisoFiscal": false,
  "motivoParaisoFiscal": null,
  "valor": 0,
  "moeda": "USD",
  "tipoOperacao": "servico",
  "descricaoServico": "descrição resumida do serviço ou mercadoria",
  "dataInvoice": null,
  "naturezaSugerida": "imp_serv",
  "irAliquota": 17.64706,
  "iofAliquota": 3.5,
  "observacoes": null
}

Regras obrigatórias:

1. "isParaisoFiscal": true se o PAÍS DO BENEFICIÁRIO estiver na lista da IN RFB 1.037/2010. Países incluídos: Andorra, Anguilla, Antiga e Barbuda, Aruba, Bahamas, Bahrein, Barbados, Belize, Bermudas, Ilhas Cayman, Ilhas do Canal (Jersey, Guernsey), Ilhas Cook, Chipre, Djibouti, Dominica, Gibraltar, Granada, Hong Kong, Kiribati, Libéria, Liechtenstein, Luxemburgo (para holdings), Macau, Maldivas, Ilhas Marshall, Mônaco, Montserrat, Nauru, Antilhas Holandesas, Niue, Panamá, Samoa, San Marino, São Cristóvão e Nevis, Santa Lúcia, São Vicente e Granadinas, Seychelles, Ilhas Solomon, São Tomé e Príncipe, Tonga, Ilhas Turks e Caicos, Ilhas Virgens Americanas, Ilhas Virgens Britânicas, Vanuatu, Iêmen.

2. "motivoParaisoFiscal": se isParaisoFiscal=true, explique brevemente por que (ex: "Ilhas Cayman consta na lista da IN RFB 1.037/2010"). Se não for, use null.

3. "tipoOperacao": use "mercadoria" para bens físicos/produtos importados, ou "servico" para serviços, licenças, royalties, tecnologia, consultoria, SaaS, etc.

4. "naturezaSugerida": use EXATAMENTE um destes valores, escolhendo o mais adequado ao documento:
   COMPRA (empresa brasileira pagando ao exterior):
   - "imp_merc"    → Importação de Mercadoria: bens físicos, produtos, equipamentos importados (IOF 0%, IR 0%)
   - "imp_serv"    → Importação de Serviço: serviços, consultoria, licença de software, SaaS, tecnologia — país normal (IOF 3,5%, IR 17,64706%)
   - "imp_serv_pf" → Importação de Serviço — Paraíso Fiscal: mesmo acima mas beneficiário em paraíso fiscal (IOF 3,5%, IR 33,33333%)
   - "inv_ext"     → Investimento no Exterior: aporte de capital, participação societária no exterior (IOF 1,1%, IR 0%)
   - "manut_res"   → Manutenção de Residentes no Exterior: remessa para pessoa física brasileira morando fora (IOF 3,5%, IR 0%)
   - "transf_prop" → Transferência Conta Própria no Exterior: transferência entre contas do mesmo titular (IOF 1,1%, IR 0%)
   - "emp_ext"     → Empréstimo Externo: contrato de mútuo, empréstimo recebido ou concedido ao exterior (IOF 3,5%, IR 0%)
   - "efx_aqbens"  → EFX Aquisição de Bens e Serviços: cartão pré-pago internacional, EFX para consumo no exterior (IOF 3,5%, IR 0%)
   VENDA (empresa brasileira recebendo do exterior):
   - "exportacao"  → Exportação de Mercadoria: recebimento por venda de bens físicos ao exterior (IOF 0%, IR 0%)
   - "exp_serv"    → Exportação de Serviço: recebimento por prestação de serviço ao exterior (IOF 0%, IR 0%)
   - "ied"         → Investimento Estrangeiro Direto: ingresso de capital estrangeiro em empresa brasileira (IOF 0,38%, IR 0%)
   - "dividendos"  → Pagamento de Dividendos ao Exterior: remessa de lucros/dividendos a sócio estrangeiro (IOF 0%, IR 0%)

5. "irAliquota": conforme a natureza sugerida — 0, 17.64706 ou 33.33333

6. "iofAliquota": conforme a natureza sugerida — 0, 0.38, 1.1 ou 3.5

7. "moeda": código ISO da moeda do valor na invoice (ex: "USD", "EUR", "GBP")

8. "dataInvoice": data da invoice no formato "YYYY-MM-DD", ou null se não encontrada

9. "valor": valor numérico total da invoice (sem símbolos de moeda), ou null se não encontrado

10. "observacoes": qualquer informação relevante não coberta acima (ex: CNPJ do beneficiário, número da invoice, condições especiais). Use null se não houver.

Se alguma informação não estiver no documento, use null no campo correspondente.`;

async function callClaude(contentBlock, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: ANALYSIS_PROMPT }] }]
      });
    } catch (err) {
      const isRetryable = err.status === 520 || err.status === 529 || err.status === 503 || err.status === 502;
      if (isRetryable && attempt < retries) {
        console.log(`Tentativa ${attempt} falhou (${err.status}), aguardando 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
  }
}

app.post('/api/invoice/analyze', upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const { buffer, mimetype } = req.file;
    const base64 = buffer.toString('base64');
    const isPDF = mimetype === 'application/pdf';

    const contentBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimetype, data: base64 } };

    const message = await callClaude(contentBlock);
    const raw = message.content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'Resposta inválida do Claude. Tente novamente.' });
    }

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);

  } catch (err) {
    console.error('Erro ao analisar invoice:', err.status, err.message);
    if (err.name === 'MulterError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.status === 520 || err.status === 529 || err.status === 503) {
      return res.status(503).json({ error: 'API Anthropic temporariamente indisponível. Aguarde alguns segundos e tente novamente.' });
    }
    if (err.status === 401) {
      return res.status(401).json({ error: 'Chave de API inválida. Verifique o arquivo backend/.env.' });
    }
    res.status(500).json({ error: err.message || 'Erro interno do servidor.' });
  }
});

const NDF_PROMPT = `Você é um especialista em câmbio FX. Analise este PDF de cotações indicativas da XP e extraia a tabela de NDF (Non-Deliverable Forward) de dólar.

Retorne APENAS um JSON válido, sem texto adicional, com esta estrutura:

{
  "dataRef": "YYYY-MM-DD",
  "spotRef": 0.0000,
  "compra": [
    { "vencimento": "YYYY-MM-DD", "dc": 0, "fwd": 0.0000, "fwdPoints": 0.0000 }
  ],
  "venda": [
    { "vencimento": "YYYY-MM-DD", "dc": 0, "fwd": 0.0000, "fwdPoints": 0.0000 }
  ]
}

Regras:
1. "dataRef": data de referência do documento (formato YYYY-MM-DD)
2. "spotRef": taxa spot USD/BRL de referência usada no documento
3. "compra": tabela de compra de dólar (cliente vende USD para o banco), com todos os vencimentos disponíveis
4. "venda": tabela de venda de dólar (cliente compra USD do banco), com todos os vencimentos disponíveis
5. "dc": dias corridos até o vencimento
6. "fwd": taxa forward absoluta (ex: 5.8234)
7. "fwdPoints": pontos forward em relação ao spot (fwd - spotRef), com 4 casas decimais
8. Inclua TODOS os vencimentos da tabela — não resuma nem omita nenhum
9. Se compra e venda forem a mesma tabela, replique em ambos os campos
10. Se não encontrar a tabela NDF, retorne { "erro": "Tabela NDF não encontrada no documento" }`;

app.get('/api/xp-ndf/latest', async (req, res) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Credenciais Gmail não configuradas no .env' });
  }

  const client_imap = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    },
    logger: false
  });

  try {
    await client_imap.connect();
    await client_imap.mailboxOpen('INBOX');

    const since = new Date();
    since.setDate(since.getDate() - 3);

    const messages = await client_imap.search({
      since,
      subject: 'Indicativos',
      from: 'xp'
    });

    if (!messages || messages.length === 0) {
      await client_imap.logout();
      return res.status(404).json({ error: 'Nenhum email da XP encontrado nos últimos 3 dias.' });
    }

    const lastUid = messages[messages.length - 1];
    let pdfBuffer = null;
    let emailDate = null;

    for await (const msg of client_imap.fetch([lastUid], { source: true })) {
      const parsed = await simpleParser(msg.source);

      // Validação extra: confirmar remetente XP e assunto esperado
      const fromAddr = (parsed.from?.text || '').toLowerCase();
      const subject = (parsed.subject || '').toLowerCase();
      const isFromXP = fromAddr.includes('xp') || fromAddr.includes('xpinvestimentos') || fromAddr.includes('xpglobal');
      const hasIndicativos = subject.includes('indicativos');

      if (!isFromXP || !hasIndicativos) {
        continue; // pula emails que não sejam da XP com assunto correto
      }

      emailDate = parsed.date;

      if (parsed.attachments && parsed.attachments.length > 0) {
        const pdfAttach = parsed.attachments.find(a =>
          a.contentType === 'application/pdf' ||
          (a.filename && a.filename.toLowerCase().endsWith('.pdf'))
        );
        if (pdfAttach) {
          pdfBuffer = pdfAttach.content;
        }
      }
    }

    await client_imap.logout();

    if (!pdfBuffer) {
      return res.status(404).json({ error: 'Email encontrado mas sem anexo PDF.' });
    }

    const base64 = pdfBuffer.toString('base64');
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: NDF_PROMPT }
        ]
      }]
    });

    const raw = message.content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Resposta inválida do Claude ao processar PDF.' });
    }

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);

  } catch (err) {
    console.error('Erro XP NDF:', err.message);
    try { await client_imap.logout(); } catch (_) {}
    res.status(500).json({ error: err.message || 'Erro ao buscar cotações XP.' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Calculadora FX:  http://localhost:${PORT}/calculadora-fx.html`);
  console.log(`Calculadora Auren: http://localhost:${PORT}/calculadora-auren.html`);
});
