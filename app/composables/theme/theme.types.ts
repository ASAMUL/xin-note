export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeVariableMap = Record<string, string>;

export interface ThemePreset {
  id: string;
  name: string;
  lightVars: ThemeVariableMap;
  darkVars?: ThemeVariableMap;
}
