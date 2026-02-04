/**
 * RAG 模块内部通用工具
 */

/**
 * 最小 SQL 字符串转义（用于 where 里拼接字符串常量）
 * - LanceDB where 语法是 SQL-like，字符串用单引号包裹
 */
export function escapeSqlString(value: string) {
  return (value || '').replace(/'/g, "''");
}

export function whereEqString(column: string, value: string) {
  const col = (column || '').trim();
  if (!col) throw new Error('whereEqString: column 不能为空');
  return `${col} = '${escapeSqlString(value)}'`;
}
