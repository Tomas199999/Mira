import { getLocales } from 'expo-localization';
import { es, type Translations } from './es';
import { en } from './en';
import { pt } from './pt';

const dictionaries: Record<string, Translations> = { es, en, pt };

function resolveLanguage(): string {
  const tag = getLocales()[0]?.languageCode ?? 'es';
  return tag in dictionaries ? tag : 'es';
}

let current = resolveLanguage();

export function setLanguage(lang: string) {
  if (lang in dictionaries) current = lang;
}

export function getLanguage(): string {
  return current;
}

export function t(): Translations {
  return dictionaries[current] ?? es;
}

/**
 * Interpola `{{placeholders}}` y resuelve plural con el sufijo `_one`/`_other`.
 * Suficiente para el MVP; si aparecen idiomas con plurales complejos se cambia
 * por `Intl.PluralRules` sin tocar los llamadores.
 */
export function tp(
  group: Record<string, string>,
  key: string,
  count: number,
  vars: Record<string, string | number> = {},
): string {
  const suffix = count === 1 ? '_one' : '_other';
  const template = group[`${key}${suffix}`] ?? group[key] ?? key;
  return interpolate(template, { count, ...vars });
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{{${name}}}`);
}

export type { Translations };
