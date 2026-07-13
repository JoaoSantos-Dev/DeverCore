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
4. Teste login, recuperação de senha, matrícula, abertura do curso, conclusão de aula e formulário de interesse.

As regras e índices não são publicados automaticamente pelo GitHub Pages. Publique-os sempre que esses arquivos mudarem.

## Cadastro de aluno

1. Crie a conta em Authentication > Users.
2. Copie o UID gerado.
3. No painel administrativo, crie o perfil com o mesmo UID.
4. Entre no curso e crie a matrícula.

A coleção `enrollments` é a única fonte de autorização. O campo legado `users.enrolledCourses` pode ser removido dos documentos antigos depois de confirmar que todos possuem uma matrícula `UID_CURSO` ativa.

## Leads

Os envios da landing page ficam na coleção `leads`. Exporte-os periodicamente pelo console ou por uma ferramenta local autenticada. Nunca coloque credenciais administrativas no site.

O formulário usa validação, campo-armadilha e regras restritivas, mas uma página pública ainda pode receber spam. Se isso ocorrer, ative Firebase App Check com reCAPTCHA e exija App Check no Firestore depois de validar o fluxo em produção.

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
