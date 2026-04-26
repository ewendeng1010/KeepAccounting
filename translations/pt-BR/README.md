# KeepAccounting

Um aplicativo de contabilidade simples baseado em Node.js e SQLite, com suporte para:

- Registro e login de usuários
- Adição de registros de receita/despesa
- Exibição de receita total, despesa total e saldo
- Filtragem de registros por intervalo de datas
- Persistência de dados no banco de dados SQLite

## Como iniciar

```bash
node server.js
```

Após iniciar, acesse:

```text
http://localhost:3000
```

## Local do banco de dados

O arquivo de banco de dados padrão será criado em:

```text
data/accounting.db
```

Se quiser personalizar o caminho do arquivo de banco de dados, você pode passar a variável de ambiente `DB_PATH` ao iniciar.