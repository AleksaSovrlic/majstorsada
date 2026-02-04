export type ServiceTipSlug = 'vodoinstalater' | 'elektricar' | 'bravar'

export interface ServiceOption {
  slug: ServiceTipSlug
  label: string
  /** Accusative case used in CTA: "Zatraži {ctaLabel}" */
  ctaLabel: string
  /** Icon path for a 24x24 viewBox SVG */
  iconPath: string
}

export const serviceOptions = [
  {
    slug: 'vodoinstalater',
    label: 'Vodoinstalater',
    ctaLabel: 'Vodoinstalatera',
    iconPath: 'M12 2.5s5 6 5 10a5 5 0 1 1-10 0c0-4 5-10 5-10z'
  },
  {
    slug: 'elektricar',
    label: 'Električar',
    ctaLabel: 'Električara',
    iconPath: 'M13 2L3 14h7l-1 8l10-12h-7z'
  },
  {
    slug: 'bravar',
    label: 'Bravar',
    ctaLabel: 'Bravara',
    iconPath: 'M17 11V8a5 5 0 0 0-10 0v3H5v10h14V11zm-2 0H9V8a3 3 0 0 1 6 0v3z'
  }
] as const satisfies readonly ServiceOption[]

