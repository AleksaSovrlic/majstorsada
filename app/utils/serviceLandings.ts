import type { ServiceTipSlug } from '@/utils/services'

export interface FaqItem {
  question: string
  answer: string
}

export interface ServiceLandingConfig {
  slug: ServiceTipSlug
  /** Public landing route (no trailing slash). */
  path: `/${string}`
  /** Used for the service selector default + CTA deep-link to /zahtev?tip=... */
  tipQuery: ServiceTipSlug
  seo: {
    title: string
    description: string
  }
  hero: {
    badgeText: string
  }
  content: {
    usp: string[]
    commonProblems: string[]
    faq: FaqItem[]
  }
  schema: {
    /** Social proof (used in JSON-LD). */
    ratingValue: number
    ratingCount: number
  }
}

export const vodoinstalaterLanding: ServiceLandingConfig = {
  slug: 'vodoinstalater',
  path: '/vodoinstalater',
  tipQuery: 'vodoinstalater',
  seo: {
    title: 'Vodoinstalateri Beograd | Hitne Intervencije | Stižemo za 30 min',
    description:
      'Vodoinstalateri Beograd - Stižemo za 30 min. Hitne intervencije 00-24h: zapušen odvod, curenje vode, popravka bojlera... Povoljne cene i garancija.'
  },
  hero: {
    badgeText: 'Vodoinstalateri Beograd • Hitne intervencije 00-24h'
  },
  content: {
    usp: [
      'Dolazak za 30 minuta (pokrivamo ceo Beograd)',
      'Izdajemo račun i pisanu garanciju na radove',
      'Fiksna cena i dogovor pre početka radova',
      'Provereni majstori sa visokim ocenama'
    ],
    commonProblems: [
      // NAJČEŠĆI PROBLEMI (Jezik korisnika)
      'Zapušen odvod (WC šolja, sudopera, kada, lavabo)',
      'Voda slabo otiče ili se vraća iz slivnika',
      'Neprijatni mirisi iz kanalizacije u kupatilu',
      'Curenje vode ispod kade ili tuš kabine',
      'Voda curi kod komšije ispod (Hitne intervencije)',

      // HITNE POPRAVKE
      'Pukla cev u zidu ili podu (Sanacija poplave)',
      'Ventil ne drži vodu / ne može da se zatvori',
      'Zamena slavine koja kaplje ili curi',
      'Brza zamena brinox creva (da ne pukne)',

      // BOJLERI
      'Bojler ne greje vodu ili brzo potroši toplu vodu',
      'Bojler curi ili pucketa (čišćenje kamenca)',
      'Montaža novog bojlera (i skidanje starog)',

      // UREĐAJI I MONTAŽA
      'Povezivanje mašine za sudove i veš mašine',
      'Montaža WC šolje, vodokotlića i lavaboa',
      'Silikoniranje kade (da ne curi voda sa strane)'
    ],
    faq: [
      {
        question: 'Koliko brzo može da dođe vodoinstalater?',
        answer:
          'Za većinu beogradskih opština (Novi Beograd, Vračar, Stari Grad, Zemun, Zvezdara...) stižemo za oko 30 minuta. Tačno vreme zavisi od lokacije i gužve.'
      },
      {
        question: 'Da li radite 00-24h?',
        answer:
          'Da – platforma radi 00-24h, a dostupnost majstora zavisi od toga ko je trenutno slobodan u vašem kraju.'
      },
      {
        question: 'Kako se formira cena?',
        answer:
          'Cenu dogovarate direktno sa majstorom nakon što prihvati zahtev i pozove vas – pre izlaska na teren dobijate jasne informacije o okvirnoj ceni.'
      },
      {
        question: 'Da li su majstori provereni?',
        answer:
          'Da – majstori prolaze verifikaciju pre nego što postanu dostupni na platformi.'
      },
      {
        question: 'Šta ako je kvar hitan (pucanje cevi)?',
        answer:
          'U opisu zahteva navedite da je kvar hitan i dodajte što više detalja. Sistem odmah prosleđuje zahtev majstorima u vašoj okolini.'
      },
      {
        question: 'Da li su moji podaci javni?',
        answer:
          'Ne – vaši podaci nisu javni. Majstor dobija informacije tek nakon što prihvati posao, kako bi vas pozvao i dogovorio detalje.'
      }
    ]
  },
  schema: {
    ratingValue: 4.9,
    ratingCount: 320
  }
} as const

export const elektricarLanding: ServiceLandingConfig = {
  slug: 'elektricar',
  path: '/elektricar',
  tipQuery: 'elektricar',
  seo: {
    title: 'Električari Beograd | Hitne Intervencije | Stižemo za 30 min',
    description:
      'Električari Beograd - Stižemo za 30 min. Hitne intervencije 00-24h: nestanak struje, iskače osigurač, servis TA peći i bojlera... Povoljne cene i garancija.'
  },
  hero: {
    badgeText: 'Električari Beograd • Hitne intervencije 00-24h'
  },
  content: {
    usp: [
      'Dolazak za 30-45 minuta (ceo Beograd)',
      'Ovlašćeni električari',
      'Račun i garancija na sve elektro radove',
      'Hitne popravke 00-24'
    ],
    commonProblems: [
      'Nestanak struje u stanu ili delu stana',
      'Osigurač stalno iskače ili je pregoreo',
      'Utičnica varniči / miris paljevine iz zida',
      'Servis TA peći (ne duva, ne greje, zamena grejača)',
      'Bojler ne greje vodu',
      'Zamena table sa osiguračima (ugradnja automatskih)',
      'Povezivanje šporeta, rerne i indukcione ploče',
      'Ugradnja LED rasvete, lustera i plafonjera'
    ],
    faq: [
      {
        question: 'Koliko brzo stiže električar u Beogradu?',
        answer:
          'Za većinu beogradskih opština (Novi Beograd, Vračar, Stari Grad, Zemun, Zvezdara...) stižemo za 30–45 minuta. Tačno vreme zavisi od lokacije i gužve.'
      },
      {
        question: 'Da li izdajete račun i garanciju?',
        answer:
          'Da – izdajemo račun i pisanu garanciju na elektro radove, u skladu sa dogovorom i vrstom intervencije.'
      },
      {
        question: 'Da li radite hitne intervencije 00-24?',
        answer:
          'Da – platforma radi 00-24. Dostupnost električara zavisi od toga ko je trenutno slobodan u vašem kraju.'
      },
      {
        question: 'Radite li servis TA peći?',
        answer:
          'Da – radimo dijagnostiku i servis TA peći (grejači, termostati, ventilatori), kao i bezbednu proveru instalacije.'
      }
    ]
  },
  schema: {
    ratingValue: 4.9,
    ratingCount: 320
  }
} as const

export const bravarLanding: ServiceLandingConfig = {
  slug: 'bravar',
  path: '/bravar',
  tipQuery: 'bravar',
  seo: {
    title: 'Bravari Beograd | Hitno Otvaranje Vrata | Stižemo za 20 min',
    description:
      'Bravari Beograd - Stižemo za 20 min. Hitno otvaranje vrata bez oštećenja 00-24h: zaglavljena brava, izgubljen ključ, zamena cilindra. Povoljno i brzo.'
  },
  hero: {
    badgeText: 'Bravari Beograd • Otvaranje bez oštećenja 00-24h'
  },
  content: {
    usp: [
      'Dolazak za 20-30 minuta',
      'Otvaranje vrata BEZ OŠTEĆENJA (specijalni alat)',
      'Zamena brave i cilindra odmah na licu mesta',
      'Dežurni bravari 00-24h (noćne intervencije)'
    ],
    commonProblems: [
      'Hitno otvaranje zaglavljenih vrata (stan, kuća)',
      'Ključ ostao u bravi sa unutrašnje strane',
      'Izgubljeni ključevi (otvaranje + zamena cilindra)',
      'Ključ se polomio u bravi ili neće da se okrene',
      'Vrata neće da se zaključaju (pao jezičak)',
      'Otvaranje sigurnosnih (blindiranih) vrata bez štete',
      'Zamena kvaka, štitnika i sigurnosnih brava',
      'Montaža dodatne "H" brave ili reze'
    ],
    faq: [
      {
        question: 'Koliko brzo stiže bravar u Beogradu?',
        answer:
          'U većini slučajeva možemo da stignemo za 20–30 minuta u Beogradu. Tačno vreme zavisi od lokacije i gužve.'
      },
      {
        question: 'Da li ćete mi oštetiti vrata?',
        answer:
          'Ne. Koristimo specijalne alate za otvaranje bez bušenja i oštećenja vrata, čak i kod sigurnosnih modela.'
      },
      {
        question: 'Da li menjate cilindar/bravu odmah?',
        answer:
          'Da – po potrebi radimo zamenu cilindra i brave odmah na licu mesta, kako biste odmah bili bezbedni.'
      },
      {
        question: 'Da li radite 00-24h?',
        answer:
          'Da – dežurni bravari su dostupni 00-24h. Dostupnost zavisi od toga ko je trenutno slobodan u vašem kraju.'
      }
    ]
  },
  schema: {
    ratingValue: 4.9,
    ratingCount: 320
  }
} as const

