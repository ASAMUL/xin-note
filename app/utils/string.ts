/**
 * 字符串工具函数
 */

/**
 * 把字符串首字母转为大写。
 * - 空字符串会原样返回
 */
export const upperFirst = (str: string) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : str);

