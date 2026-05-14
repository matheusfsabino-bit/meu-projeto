# Terminal de Gestão Financeira

Sistema para cotações de câmbio, extratos de receita e cadastro de clientes.

## Tecnologias
- **Frontend:** React
- **Backend:** Node.js
- **Banco de dados:** PostgreSQL

## Estrutura do Projeto
```
├── backend/
│   └── src/
│       ├── controllers/   # Lógica das requisições
│       ├── routes/        # Rotas da API
│       ├── models/        # Modelos do banco de dados
│       └── services/      # Regras de negócio
├── frontend/              # Interface React
└── docs/                  # Documentação
```

## Como rodar
1. Copie `.env.example` para `.env` e preencha os valores
2. Instale as dependências: `npm install`
3. Inicie o backend: `npm run dev`
4. Inicie o frontend: `cd frontend && npm start`
