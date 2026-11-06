# Histórico Orçamentário - CAU/PR

Aplicação estática no Firebase Hosting. O navegador usa Firebase Authentication e Firestore para acesso e armazenamento dos retratos importados. `public/app.js` mantém os cálculos e a importação existente; `public/pdf-import.js` lê a coluna Na Data dos PDFs SISCONT.

## Projeto atual e publicação pela nuvem

O código principal e seu histórico ficam em https://github.com/brunosimer/Historico-orcamentario-caupr.
O site e os dados ficam no projeto Firebase `historico-orcamentario-cau-pr`, administrado por `bruno.simer@gmail.com`.
Endereço do site: https://historico-orcamentario-cau-pr.web.app/.

A publicação é executada pelo GitHub Actions. Uma alteração em `public`, `firebase.json`, `.firebaserc`, `package.json` ou no workflow, salva na branch `main`, executa os testes e publica o site. Também é possível abrir Actions, escolher **Publicar site no Firebase** e usar **Run workflow**. Não é necessário manter este código em um computador específico.

A credencial de publicação fica no segredo `FIREBASE_HOSTING_SERVICE_ACCOUNT` do GitHub Actions. Ela permite publicar somente Hosting; os dados e usuários continuam no Firestore e no Firebase Authentication. O workflow não publica alterações de regras ou contas de usuários.

## Laboratório Implanta

A versão de novembro de 2026 mantém os filtros abertos no topo e consulta a API sem exigir retratos. A apresentação reutiliza o quadro de **Situação atual**: quatro indicadores, visão geral, cartões dos centros e abertura de cada centro com contas, três barras coloridas e saldos. A conciliação com retratos é uma ação separada.

Os estágios globais por conta são informados pelo Demonstrativo. Os estágios de cada centro e de suas contas só são preenchidos quando a resposta contém a combinação explícita de código do centro e código da conta. Na resposta corrente, as contas analíticas do Demonstrativo não têm centro e a fonte de centros fornece somente um valor mensal genérico. Esses estágios aparecem como **Indisponível**, com barras sem preenchimento e identificação da ausência; o valor genérico continua separado. Não há rateio de totais globais, conversão de ausência em zero ou uso de retrato para preencher o quadro da API.

Em **Estudos e comparações**, duas datas compartilham uma única seleção de uma ou várias contas, ou de um ou vários centros. Ausências e duplicatas não viram zero, e totais com cobertura incompleta ficam indisponíveis. As datas são solicitadas pelo usuário; a interface identifica as referências mensais efetivas e não promete corte diário dessas fontes.

O botão **Auditoria** consulta novamente as fontes até a referência do filtro, inicializado em hoje no fuso de São Paulo a cada abertura. O relatório de junho permanece no histórico, separado da execução atual. A auditoria apresenta cobertura, duplicidades e coerência aritmética; não transforma igualdade numérica em homologação do estágio contábil.

A entrada fica abaixo de Minha conta. `public/lab-bootstrap.js` identifica a conta autorizada e solicita `implantaLab/module` com `getDocFromServer`. O servidor restringe a leitura pelo UID e e-mail presentes no token Firebase. As regras negam listagem e escrita de clientes nessa coleção. O módulo, a documentação e as respostas preservadas não são arquivos de Hosting.

`lab-src/implanta-core.mjs` valida períodos e URLs, consulta doze fontes públicas com timeout/limite de bytes, preserva JSON/bytes/hash e usa centavos BigInt. `lab-src/laboratory.mjs` oferece exploração, gráficos de populações selecionadas e comparação somente leitura com retratos. Consultas novas ficam na sessão; não há sincronização automática ou escrita nos retratos pelo laboratório.

`lab-src/api-position.mjs` normaliza as posições mensais, verifica vínculos explícitos entre centro e conta e mantém fontes parciais ou indisponíveis explícitas. `dashboard.mjs` reutiliza as classes visuais do painel existente e mantém a navegação de cartões para o detalhe das contas. `studies.mjs` aplica uma seleção única às duas posições, com listas e resultados paginados. `workspace.mjs` separa consulta, estudos, auditoria nova, conciliação e documentos históricos. `reconciliation-core.mjs` cruza códigos contábeis e mapeamentos explícitos somente na conferência com retratos. Duplicatas e valores incompletos ficam indisponíveis. Filtros de centro ou categoria não rateiam a API global. As diferenças de conciliação seguem API menos retrato; as comparações entre datas seguem B menos A. Os CSVs usam valores em reais e neutralizam fórmulas em textos. O painel oficial fora do laboratório continua usando os uploads.

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
