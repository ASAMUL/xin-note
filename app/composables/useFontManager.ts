/**
 * 字体管理 composable
 * 负责在运行时将用户选中的字体应用到页面上
 * 通过 CSS 变量 --app-font-family 覆盖 body 的 font-family
 */

import { DEFAULT_FONT_FAMILY, type FontFamily } from '~/composables/useSettings';

/** 系统默认字体的 fallback 栈 */
const SYSTEM_FONT_STACK =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * 根据字体 ID 生成完整的 font-family 值
 */
function resolveFontStack(font: FontFamily): string {
    if (font === 'system') {
        return SYSTEM_FONT_STACK;
    }
    // 用户选中的字体 + 通用 fallback
    return `'${font}', ${SYSTEM_FONT_STACK}`;
}

/**
 * 将字体应用到 document 根元素
 */
function applyFontToDocument(font: FontFamily): void {
    if (typeof document === 'undefined') return;
    const fontStack = resolveFontStack(font);
    document.documentElement.style.setProperty('--app-font-family', fontStack);
}

export function useFontManager() {
    const { fontFamily, isInitialized } = useSettings();

    // 监听设置初始化完成后，立即应用字体
    watch(
        isInitialized,
        (initialized) => {
            if (initialized) {
                applyFontToDocument(fontFamily.value);
            }
        },
        { immediate: true },
    );

    // 监听字体变化，实时生效
    watch(fontFamily, (newFont) => {
        applyFontToDocument(newFont);
    });

    return {
        fontFamily,
    };
}
