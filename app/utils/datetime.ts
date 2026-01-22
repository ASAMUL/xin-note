/**
 * 时间/日期相关工具函数
 */

/**
 * 格式化“上次保存时间”。
 * 这里返回中文文案，主要用于编辑器顶部的保存状态展示。
 */
export const formatLastSavedTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) {
    return '刚刚保存';
  }
  if (minutes < 60) {
    return `${minutes} 分钟前保存`;
  }
  if (hours < 24) {
    return `${hours} 小时前保存`;
  }

  // 显示具体日期时间
  return `上次编辑 ${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

