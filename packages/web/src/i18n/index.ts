/**
 * Sistema de internacionalización (i18n) de GymBit.
 * Español como idioma principal. Extensible sin cambios estructurales.
 *
 * Requirements: 14.6
 */

import { es } from './es.js';
import type { Translations } from './es.js';

// ── Registro de idiomas ───────────────────────────────────────────────────────

const locales: Record<string, Translations> = {
  es,
  // Para agregar un nuevo idioma:
  // en: en,
  // pt: pt,
};

// ── Idioma activo ─────────────────────────────────────────────────────────────

function detectLocale(): string {
  const stored = localStorage.getItem('gymbit_locale');
  if (stored && stored in locales) return stored;

  const browser = navigator.language.split('-')[0] ?? 'es';
  return browser in locales ? browser : 'es';
}

let _currentLocale = 'es';

export function setLocale(locale: string): void {
  if (locale in locales) {
    _currentLocale = locale;
    localStorage.setItem('gymbit_locale', locale);
  }
}

export function getLocale(): string {
  return _currentLocale;
}

// ── Función de traducción ─────────────────────────────────────────────────────

type NestedKeyOf<T> = T extends object
  ? { [K in keyof T]: K extends string
      ? T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K
      : never
    }[keyof T]
  : never;

export type TranslationKey = NestedKeyOf<Translations>;

export function t(key: string, params?: Record<string, string | number>): string {
  const locale = locales[_currentLocale] ?? locales['es']!;
  const parts = key.split('.');
  let value: unknown = locale;

  for (const part of parts) {
    if (typeof value === 'object' && value !== null && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key; // fallback: devuelve la clave si no se encuentra
    }
  }

  if (typeof value !== 'string') return key;

  // Interpolación de parámetros: {variable}
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  }

  return value;
}

// Inicializar con el idioma detectado
_currentLocale = detectLocale();
