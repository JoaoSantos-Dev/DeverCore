# Operação da DEVER no plano Spark

## Estrutura de publicação

- `public/` contém todo o site entregue pelo GitHub Pages.
- `.github/workflows/pages.yml` publica exclusivamente o conteúdo de `public/`.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, seeds e documentação permanecem na raiz e não entram no artefato público.
- Para testar localmente com Live Server, abra `public/index.html` ou configure `public/` como raiz do servidor.

No GitHub, acesse **Settings > Pages > Build and deployment** e selecione **GitHub Actions** como fonte. O workflow publica automaticamente após pushes na branch `main` que alterem `public/`.

## Publicação inicial

1. Instale a Firebase CLI e autentique a conta proprietária do projeto.
2. Execute `firebase deploy --only firestore:rules,firestore:indexes`.
3. No Firebase Authentication, habilite E-mail/senha e adicione `devercore.com` aos domínios autorizados.
4. Teste login, recuperação de senha, matrícula, abertura do curso, conclusão de aula, acesso ao Grupo VIP e contagem de acessos.

As regras e índices não são publicados automaticamente pelo GitHub Pages. Publique-os sempre que esses arquivos mudarem.

## Cadastro de aluno

1. Crie a conta em Authentication > Users.
2. Copie o UID gerado.
3. No painel administrativo, crie o perfil com o mesmo UID.
4. Entre no curso e crie a matrícula.

A coleção `enrollments` é a única fonte de autorização. O campo legado `users.enrolledCourses` pode ser removido dos documentos antigos depois de confirmar que todos possuem uma matrícula `UID_CURSO` ativa.

## Contador de acessos

O painel administrativo mostra o total de visualizações da página inicial e os acessos registrados nas últimas 24 horas, 7 dias e 30 dias. Clique em **Atualizar acessos** para buscar os números mais recentes. A contagem começa na ativação; não há recuperação de acessos anteriores.

Cada abertura ou recarregamento da página inicial de `https://devercore.com` ou `https://www.devercore.com` grava um documento em `siteVisits`, com apenas `page: "/"` e `createdAt` definido pelo servidor. O contador não usa cookies nem armazena nome, e-mail, IP ou identificador de visitante. São visualizações registradas, não pessoas únicas; bloqueadores, falhas de conexão e visitas automatizadas podem afetar os números. Testes locais e páginas da plataforma não são contabilizados.

Antes de publicar a página com o contador, publique as regras:

```sh
firebase deploy --only firestore:rules --project devercore
```

Depois publique `public/` pelo fluxo habitual do GitHub Pages. As regras permitem criar somente eventos com o formato esperado e data do servidor, negam alterações e exclusões e reservam a leitura e as agregações aos administradores ativos. Não há documento de total que visitantes possam editar.

As consultas usam `getCountFromServer`, sem baixar todos os eventos e sem necessidade de um índice composto adicional. Cada acesso gera uma gravação no Firestore; as agregações também usam a cota do projeto. Referência: [agregações do Firestore](https://firebase.google.com/docs/firestore/query-data/aggregation-queries).

Para conferir após publicar, abra a página inicial em outra aba e atualize o contador no admin. Se aparecer erro de permissão, confirme a publicação das regras e `role: "admin"`, `active: true` no perfil. Erros aparecem como indisponibilidade, nunca como zero acessos.

## Leads

Os contatos antigos permanecem na coleção `leads` e podem ser gerenciados no admin. A landing page atual leva diretamente ao Grupo VIP, sem formulário de captura. Nunca coloque credenciais administrativas no site.

## Limites e monitoramento

- Confira semanalmente o painel Usage do Firestore: leituras, gravações e armazenamento.
- Ative alertas de orçamento no Google Cloud mesmo no plano gratuito.
- O painel administrativo faz consultas amplas. Quando a base se aproximar de centenas de alunos, implemente paginação antes de continuar crescendo.
- Evite atualizar a página administrativa repetidamente durante operações em lote.

## Backup

O GitHub protege apenas o código. Uma vez por semana, exporte usuários, matrículas, leads, certificados e progresso para armazenamento seguro. A exportação gerenciada do Firestore pode exigir faturamento; enquanto permanecer no Spark, faça exportações manuais autenticadas e teste a restauração em um projeto separado.

## Checklist mensal

- Testar as regras no Emulator Suite.
- Revisar usuários administradores e desativar acessos antigos.
- Conferir matrículas sem usuário correspondente.
- Exportar leads e dados acadêmicos.
- Atualizar dependências do Firebase somente após testar login e curso.
- Revisar a Política de Privacidade, os Termos e o canal oficial de contato.
