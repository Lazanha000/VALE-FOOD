# Backup automático (grátis, sem computador ligado)

Roda nos servidores do GitHub todo dia às 03:17 e guarda 30 dias de cópias de cada cliente, criptografadas.

## Ligar (uma vez)
1. GitHub > **New repository** > nome `backups-clientes` > marque **Private** > Create.
2. No repositório novo: **Add file > Create new file**, nome `.github/workflows/backup-diario.yml`,
   cole o conteúdo de `backup/backup-diario.yml` > Commit.
3. **Settings > Secrets and variables > Actions > New repository secret**:
   - `SENHA_BACKUP`: uma senha longa. **Anote num lugar seguro: sem ela o backup não abre.**
   - `DB_MODELO`: no Supabase do cliente, botão **Connect** (topo) > **Session pooler** > copie a URI e
     troque `[YOUR-PASSWORD]` pela senha do banco (a que você anotou ao criar o projeto).
4. **Actions > backup-diario > Run workflow**. Deu verde? Está funcionando. Se der vermelho, ele avisa por e-mail.

## Cliente novo
Crie o segredo `DB_NOMEDOCLIENTE` e, no arquivo, acrescente o nome em `cliente: [...]` e a linha
`DB_NOMEDOCLIENTE: ${{ secrets.DB_NOMEDOCLIENTE }}` em `env`.

## Restaurar (se um dia precisar)
Baixe o arquivo em Actions > (uma execução) > Artifacts, e no computador:
`gpg -d CLIENTE-DATA.sql.gz.gpg | gunzip > backup.sql`, depois cole/rode no SQL Editor de um projeto
novo (ou peça ajuda numa sessão do Claude).

Obs.: o GitHub desliga tarefas agendadas de repositórios sem nenhum commit por 60 dias e manda e-mail
avisando; é só clicar em "Enable workflow".
