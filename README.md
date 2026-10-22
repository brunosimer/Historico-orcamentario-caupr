# Histórico Orçamentário - CAU/PR

Aplicação estática no Firebase Hosting. O navegador usa Firebase Authentication e Firestore para acesso e armazenamento dos retratos importados. `public/app.js` mantém os cálculos e a importação existente; `public/pdf-import.js` lê a coluna Na Data dos PDFs SISCONT.

## Projeto atual e publicação pela nuvem

O código principal e seu histórico ficam em https://github.com/brunosimer/Historico-orcamentario-caupr.
O site e os dados ficam no projeto Firebase `historico-orcamentario-cau-pr`, administrado por `bruno.simer@gmail.com`.
Endereço do site: https://historico-orcamentario-cau-pr.web.app/.

A publicação é executada pelo GitHub Actions. Uma alteração em `public`, `firebase.json`, `.firebaserc`, `package.json` ou no workflow, salva na branch `main`, executa os testes e publica o site. Também é possível abrir Actions, escolher **Publicar site no Firebase** e usar **Run workflow**. Não é necessário manter este código em um computador específico.

A credencial de publicação fica no segredo `FIREBASE_HOSTING_SERVICE_ACCOUNT` do GitHub Actions. Ela permite publicar somente Hosting; os dados e usuários continuam no Firestore e no Firebase Authentication. O workflow não publica alterações de regras ou contas de usuários.

## Laboratório Implanta

A entrada fica abaixo de Minha conta. `public/lab-bootstrap.js` identifica a conta autorizada e solicita `implantaLab/module` com `getDocFromServer`. O servidor restringe a leitura pelo UID e e-mail presentes no token Firebase. As regras negam listagem e escrita de clientes nessa coleção. O módulo, a documentação e as respostas preservadas não são arquivos de Hosting.

`lab-src/implanta-core.mjs` valida períodos e URLs, consulta doze fontes públicas com timeout/limite de bytes, preserva JSON/bytes/hash e usa centavos BigInt. `lab-src/laboratory.mjs` oferece exploração, gráficos de populações selecionadas e comparação somente leitura com retratos. Consultas novas ficam na sessão; não há sincronização automática ou escrita nos retratos pelo laboratório.

`lab-src/dashboard.mjs` recria a visão inicial com categorias, datas, sete indicadores, cartões de centros e detalhes por orçamento, conta, mês e origem. `lab-src/reconciliation-core.mjs` cruza códigos contábeis e mapeamentos explícitos, separando a API global por conta da execução por centro. Duplicatas e valores incompletos ficam indisponíveis. Filtros de categoria não rateiam a API global. As diferenças seguem API menos upload. Os CSVs de conferência usam valores em reais e neutralizam fórmulas em textos. Os dados oficiais do painel continuam provenientes dos uploads.

O formatador das telas existentes também inclui o prefixo `R$`, agrupamento por ponto e duas casas decimais; percentuais, códigos e datas conservam suas representações próprias.

## Verificação

Execute `npm test` com Node moderno. Os testes sintéticos não precisam de rede. O teste adicional de uma resposta oficial requer `IMPLANTA_AUDIT_FIXTURE` apontando para o JSON preservado da auditoria; sem essa variável ele informa skip. As evidências e a documentação privada não são mantidas neste repositório público.

O teste de cruzamento real requer `IMPLANTA_RECONCILIATION_FIXTURE_DIR` com o diretório privado contendo `firebase-audit.json`, as respostas em `implanta-review-evidence/` e o código de mapeamento em `site/public/app.js`. Esse dump é local à auditoria e não deve ser incluído no repositório ou Hosting. Sem a variável, o teste informa skip; os casos sintéticos de nulos, duplicatas, sinais e precisão continuam executados.

Execute `npm run build:lab` para gerar `build/laboratory.mjs` e seu SHA-256. O módulo gerado deve ser publicado administrativamente no documento `implantaLab/module` com campos string `content`, `sha256` e `version`. O build não faz upload. Não copie o módulo ou as evidências para `public`.

O laboratório também lê os documentos privados `documentation` e `reconciliation` (campo `content`), `contract` (`content` do Swagger), `index` (`content` contendo uma lista JSON de `{id,asset,label}`) e os documentos de evidência apontados pelo índice (`url`, `endpoint`, `raw`, `sha256`, `collectedAt`, `status`, `kind`). Os hashes de evidência precisam corresponder aos bytes UTF-8 originais. O administrador publica esses documentos usando IAM; um cliente do aplicativo não pode alterá-los.

## Publicação e reversão

Revise as alterações e execute os testes antes de usar `npx -y firebase-tools@latest deploy --only firestore:rules,hosting --project historico-orcamentario-cau-pr --account bruno.simer@gmail.com`. Confira as regras publicadas e a release de Hosting antes da alteração e preserve seus identificadores. Uma nova publicação de Hosting não publica automaticamente os documentos privados do laboratório.

`firebase.json` serve `public` e configura revalidação dos arquivos de inicialização do laboratório. `index.html` inclui uma referência versionada a `app.js` para atualização da sessão existente. Nenhuma regra pode ser substituída por uma cópia antiga sem verificar as coleções em uso: o painel utiliza `snapshotsDetalhe`, `config/categorias`, `config/apelidosContas` e `users`.

Uma release anterior pode ser restaurada no Firebase Hosting. Reversão de código não restaura retratos apagados ou substituídos. O backup do aplicativo exporta parte dos dados do domínio; a documentação privada descreve o alcance e as lacunas de recuperação.

O laboratório também aceita uma posição privada opcional em `implantaLab/comparisonSnapshot` (campo `content` com JSON de `date`, `centros` e `origem`). Ela aparece marcada como teste privado somente no painel do laboratório e não é gravada em retratos oficiais. Datas impossíveis, centros/contas malformados e leituras posteriores ao logout são rejeitados. `implantaLab/comparisonReport` contém a conciliação preservada em Markdown, exibida em uma aba própria. Essas evidências são publicadas administrativamente e permanecem fora do repositório público.
