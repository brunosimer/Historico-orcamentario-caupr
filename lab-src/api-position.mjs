import {buildQuery, cents, collect} from './implanta-core.mjs';
import {reconcileSnapshot} from './reconciliation-core.mjs';

const DEMO = 'DemonstrativoEmpenhosPagamentos';
const CENTERS = 'DespesasCentroCusto';
const METRICS = Object.freeze(['orcado', 'empenhado', 'liquidado', 'pago', 'saldoOrc', 'saldoLiq', 'saldoPagar']);
const ACCOUNT_CODE = /^\d+(?:\.\d+)+$/;
const issue = (code, message, details = {}) => ({code, message, ...details});
const sorted = (items) => items.sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', {numeric: true}));

/** Calendar date at the user's accounting timezone, including around UTC midnight. */
export function todaySaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (name) => parts.find((item) => item.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Validates without UTC conversion, rollover, or silently correcting an invalid day. */
export function validatePositionDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Informe uma data no formato AAAA-MM-DD.');
  }
  buildQuery('ExecucaoFinanceira', date, date);
  return date;
}

/** A missing item or an incomplete source must never produce a partial total as complete. */
export function sumPosition(items, key) {
  if (!Array.isArray(items) || !items.length) return null;
  let total = 0n;
  for (const item of items) {
    if (typeof item?.[key] !== 'bigint' || item.issues?.some((entry) => entry.code === 'incomplete_source')) return null;
    total += item[key];
  }
  return total;
}

function reference(month, endpoint) {
  return {start: endpoint === CENTERS ? `${month.slice(0, 4)}-01` : month, end: month};
}

function isoMonth(value) {
  const match = /^(\d{2})\/(\d{4})$/.exec(value || '');
  return match ? `${match[2]}-${match[1]}` : null;
}

function sourceInfo(endpoint, record, month) {
  const expected = reference(month, endpoint);
  const requestedUrl = buildQuery(endpoint, expected.start, expected.end);
  let parsed;
  try { parsed = new URL(record?.url); } catch { /* Metadata remains unavailable. */ }
  const expectedUrl = new URL(requestedUrl);
  const periodStart = parsed ? isoMonth(parsed.searchParams.get('referenciaInicio')) : null;
  const periodEnd = parsed ? isoMonth(parsed.searchParams.get('referenciaTermino')) : null;
  let error = record?.error ? String(record.error) : '';
  if (!error && !record) error = 'Fonte não consultada.';
  if (!error && !Array.isArray(record.data)) error = 'A origem não forneceu uma lista válida de registros.';
  if (!error && record.status !== undefined && record.status !== 200) error = `A origem respondeu HTTP ${record.status}.`;
  if (!error && (!parsed || parsed.origin !== expectedUrl.origin || parsed.pathname !== expectedUrl.pathname)) {
    error = 'A origem da resposta não corresponde à fonte solicitada.';
  }
  if (!error && (periodStart !== expected.start || periodEnd !== expected.end)) {
    error = 'A resposta pertence a outra referência; consulte novamente para o filtro selecionado.';
  }
  return {
    endpoint, url: record?.url || requestedUrl,
    collectedAt: typeof record?.collectedAt === 'string' ? record.collectedAt : null,
    periodStart, periodEnd, granularity: 'monthly', ok: !error,
    ...(error ? {error} : {})
  };
}

function normalizeAccounts(record, issues) {
  // Reuse the audited analytical-account, exact-money and duplicate-code rules.
  // No historical data is supplied: missing_snapshot is not an API data issue.
  const reconciled = reconcileSnapshot({centros: {}}, record.data, [], {});
  const sourceIssues = reconciled.flags.filter((entry) => entry.code !== 'snapshot_rounding_policy');
  issues.push(...sourceIssues.map((entry) => ({...entry, endpoint: DEMO})));
  const incomplete = sourceIssues.length ? [issue('incomplete_source', 'Há registros analíticos excluídos; o total completo desta fonte está indisponível.')] : [];
  return reconciled.accounts.map((account) => ({
    id: account.code, code: account.code, name: String(account.name),
    ...Object.fromEntries(METRICS.map((key) => [key, account.api?.[key] ?? null])),
    issues: [...account.flags, ...incomplete]
  }));
}

function normalizeCenters(record, issues) {
  const groups = new Map();
  let invalidSource = false;
  const ensureCenter = (code, name) => {
    if (!groups.has(code)) groups.set(code, {id: code, code, name: name || code, accounts: [], issues: [], rows: new Map()});
    return groups.get(code);
  };
  for (const [index, row] of record.data.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push(issue('invalid_center_record', 'Linha de centros inválida foi excluída; o total completo está indisponível.', {endpoint: CENTERS, index}));
      invalidSource = true;
      continue;
    }
    if (row.ANALITICO === false) continue;
    if (row.ANALITICO !== true) {
      issues.push(issue('invalid_analytic_flag', 'Linha de centros sem marcação analítica válida foi excluída.', {endpoint: CENTERS, index}));
      invalidSource = true;
      if (typeof row.CODIGO_CENTRO_CUSTO === 'string' && row.CODIGO_CENTRO_CUSTO.trim()) {
        ensureCenter(row.CODIGO_CENTRO_CUSTO, row.NOME_CENTRO_CUSTO).issues.push(issue('incomplete_source', 'O centro contém linha sem marcação analítica válida.'));
      }
      continue;
    }
    const code = row.CODIGO_CENTRO_CUSTO;
    const accountCode = row.CODIGO_CONTA;
    if (typeof code !== 'string' || !code.trim() || typeof accountCode !== 'string' || !ACCOUNT_CODE.test(accountCode)) {
      issues.push(issue('missing_center_or_account_code', 'Linha de centros sem códigos válidos foi excluída; não houve junção por nome.', {endpoint: CENTERS, index}));
      invalidSource = true;
      if (typeof code === 'string' && code.trim()) {
        ensureCenter(code, row.NOME_CENTRO_CUSTO).issues.push(issue('incomplete_source', 'O centro contém conta sem código válido.'));
      }
      continue;
    }
    const center = ensureCenter(code, typeof row.NOME_CENTRO_CUSTO === 'string' ? row.NOME_CENTRO_CUSTO : code);
    if (!center.rows.has(accountCode)) center.rows.set(accountCode, []);
    center.rows.get(accountCode).push(row);
  }
  const result = [];
  for (const center of groups.values()) {
    for (const [accountCode, rows] of center.rows) {
      const duplicate = rows.length > 1;
      const value = duplicate ? null : cents(rows[0].VALOR_TOTAL);
      if (duplicate) center.issues.push(issue('duplicate', 'Combinação centro e conta repetida; valores não foram somados.', {accountCode, count: rows.length}));
      else if (value === null) center.issues.push(issue('missing_or_invalid_money', 'Valor ausente ou inválido; não foi convertido em zero.', {accountCode, field: 'VALOR_TOTAL'}));
      center.accounts.push({id: JSON.stringify([center.code, accountCode]), code: accountCode, name: String(rows[0].NOME_CONTA || accountCode), value});
    }
    sorted(center.accounts);
    const value = center.issues.some((entry) => entry.code === 'incomplete_source') ? null : sumPosition(center.accounts, 'value');
    if (invalidSource && !center.issues.some((entry) => entry.code === 'incomplete_source')) {
      center.issues.push(issue('incomplete_source', 'Há linhas de centros excluídas; o total completo da fonte está indisponível.'));
    }
    center.issues.push(issue('unconfirmed_center_stage', 'VALOR_TOTAL é o valor publicado por centro; o estágio contábil não foi homologado.'));
    result.push({id: center.id, code: center.code, name: String(center.name), value, accounts: center.accounts, issues: center.issues});
  }
  if (result.length) issues.push(issue('unconfirmed_center_stage', 'Valores por centro não são identificados como empenhado, liquidado, pago ou dotação; não há rateio da API global.', {endpoint: CENTERS}));
  if (record.data.some((row) => row?.ANALITICO === true && cents(row.ORCAMENTO) === 0n)) {
    issues.push(issue('api_budget_zero_not_used', 'ORCAMENTO zerado na fonte de centros não foi utilizado como dotação.', {endpoint: CENTERS}));
  }
  return sorted(result);
}

/** Pure API-only model. References and source coverage remain separate from upload reconciliation. */
export function normalizeApiPosition(date, demoRecord, centersRecord) {
  validatePositionDate(date);
  const month = date.slice(0, 7);
  const issues = [issue('monthly_cutoff', 'O filtro contém uma data, mas estas fontes oferecem referências mensais; o corte diário não está confirmado.')];
  const sources = [sourceInfo(DEMO, demoRecord, month), sourceInfo(CENTERS, centersRecord, month)];
  for (const source of sources) if (!source.ok) issues.push(issue('source_unavailable', `${source.endpoint}: ${source.error}`, {endpoint: source.endpoint}));
  let accounts = [], centers = [];
  try {
    if (sources[0].ok) accounts = normalizeAccounts(demoRecord, issues);
  } catch (error) {
    sources[0] = {...sources[0], ok: false, error: error.message};
    issues.push(issue('invalid_source', `${DEMO}: ${error.message}`, {endpoint: DEMO}));
  }
  try {
    if (sources[1].ok) centers = normalizeCenters(centersRecord, issues);
  } catch (error) {
    sources[1] = {...sources[1], ok: false, error: error.message};
    issues.push(issue('invalid_source', `${CENTERS}: ${error.message}`, {endpoint: CENTERS}));
  }
  if (sources[0].ok && !accounts.length) issues.push(issue('empty_accounts', 'A fonte não retornou contas analíticas utilizáveis; a ausência não representa saldo zero.', {endpoint: DEMO}));
  if (sources[1].ok && !centers.length) issues.push(issue('empty_centers', 'A fonte não retornou centros analíticos utilizáveis; a ausência não representa saldo zero.', {endpoint: CENTERS}));
  const timestamps = sources.map((source) => source.collectedAt).filter((value) => value && Number.isFinite(Date.parse(value)));
  const collectedAt = timestamps.length ? timestamps.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest) : null;
  return {date, month, collectedAt, accounts, centers, sources, issues, demoRecord: demoRecord || null, centersRecord: centersRecord || null};
}

/** Consult both sources independently. A failed source cannot replace or zero the other. */
export async function loadApiPosition(date, signal, collector = collect) {
  validatePositionDate(date);
  if (typeof collector !== 'function') throw new TypeError('Informe um coletor válido.');
  if (signal?.aborted) throw signal.reason || new DOMException('Consulta cancelada.', 'AbortError');
  const month = date.slice(0, 7);
  const records = await Promise.all([DEMO, CENTERS].map(async (endpoint) => {
    const period = reference(month, endpoint);
    const url = buildQuery(endpoint, period.start, period.end);
    try {
      const record = await collector(endpoint, period.start, period.end, null, '', signal);
      return {...record, endpoint, url: record?.url || url};
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      return {endpoint, url, collectedAt: new Date().toISOString(), error: error?.message || String(error), data: null};
    }
  }));
  if (signal?.aborted) throw signal.reason || new DOMException('Consulta cancelada.', 'AbortError');
  return normalizeApiPosition(date, records[0], records[1]);
}
