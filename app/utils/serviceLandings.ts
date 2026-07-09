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
}

export const vodoinstalaterLanding: ServiceLandingConfig = {
  slug: 'vodoinstalater',
  path: '/vodoinstalater',
  tipQuery: 'vodoinstalater',
  seo: {
    title: 'Vodoinstalater Beograd 24/7 | Brz dolazak',
    description:
      'Vodoinstalater Beograd 24/7 za curenje vode, zapušen odvod i bojler. Pošaljite zahtev — šaljemo ga dostupnim proverenim majstorima za brz dolazak.'
  },
  hero: {
    badgeText: 'Pošaljite zahtev 24/7 • Vodoinstalateri Beograd'
  },
  content: {
    usp: [
      'Jedan zahtev šaljemo trenutno dostupnim proverenim vodoinstalaterima za brz dolazak',
      'Bez zvanja 10 brojeva i ponavljanja istog problema',
      'Vodoinstalater koji prihvati intervenciju kontaktira vas direktno',
      'Cenu, dolazak i detalje dogovarate pre početka rada'
    ],
    commonProblems: [
      'Zapušen odvod (WC šolja, sudopera, kada, lavabo)',
      'Voda slabo otiče ili se vraća iz slivnika',
      'Neprijatni mirisi iz kanalizacije u kupatilu',
      'Curenje vode ispod kade ili tuš kabine',
      'Voda curi kod komšije ispod (hitna intervencija)',
      'Pukla cev u zidu ili podu',
      'Ventil ne drži vodu / ne može da se zatvori',
      'Zamena slavine koja kaplje ili curi',
      'Zamena fleksibilnog priključnog creva',
      'Bojler ne greje vodu ili brzo potroši toplu vodu',
      'Bojler curi ili pucketa',
      'Montaža novog bojlera i skidanje starog',
      'Povezivanje mašine za sudove i veš mašine',
      'Montaža WC šolje, vodokotlića i lavaboa',
      'Silikoniranje kade ili tuš kabine'
    ],
    faq: [
      {
        question: 'Kako da pošaljem zahtev kada mi hitno treba vodoinstalater u Beogradu?',
        answer:
          'Izaberite vodoinstalatera, opišite kvar i pošaljite zahtev. Prosleđujemo ga trenutno dostupnim proverenim vodoinstalaterima, a majstor koji prihvati intervenciju kontaktira vas direktno.'
      },
      {
        question: 'Da li mogu da pošaljem zahtev za vodoinstalatera 24/7?',
        answer:
          'Da. Zahtev možete poslati u bilo kom trenutku. Sistem ga šalje trenutno dostupnim proverenim vodoinstalaterima za izabranu vrstu kvara.'
      },
      {
        question: 'Koliko brzo može da dođe vodoinstalater?',
        answer:
          'Zahtev odmah šaljemo trenutno dostupnim proverenim vodoinstalaterima. Vodoinstalater koji prihvati intervenciju kontaktira vas direktno da dogovorite brz dolazak, cenu i detalje.'
      },
      {
        question: 'Šta da radim ako curi voda dok čekam odgovor majstora?',
        answer:
          'Ako možete bezbedno, zatvorite najbliži ventil ili glavni ventil za vodu i sklonite stvari od curenja. Ne dirajte mokre električne uređaje.'
      },
      {
        question: 'Da li mogu da pošaljem slike kvara?',
        answer:
          'Da. Ako imate fotografije curenja, odvoda, bojlera ili ventila, dodajte ih uz zahtev kako bi majstor lakše procenio situaciju.'
      },
      {
        question: 'Kako se dogovara cena vodoinstalaterske intervencije?',
        answer:
          'Cenu, dolazak i obim rada dogovarate direktno sa vodoinstalaterom koji prihvati intervenciju, pre početka rada.'
      },
      {
        question: 'Za koje kvarove mogu da pošaljem zahtev?',
        answer:
          'Možete poslati zahtev za curenje vode, zapušen odvod, problem sa bojlerom, ventilom, slavinom, WC šoljom, vodokotlićem ili drugim vodoinstalaterskim kvarom.'
      }
    ]
  }
} as const

export const elektricarLanding: ServiceLandingConfig = {
  slug: 'elektricar',
  path: '/elektricar',
  tipQuery: 'elektricar',
  seo: {
    title: 'Električar Beograd 24/7 | Brz dolazak',
    description:
      'Električar Beograd 24/7 za nestanak struje, osigurače, bojler i TA peć. Pošaljite zahtev — šaljemo ga dostupnim proverenim električarima za brz dolazak.'
  },
  hero: {
    badgeText: 'Pošaljite zahtev 24/7 • Električari Beograd'
  },
  content: {
    usp: [
      'Jedan zahtev šaljemo trenutno dostupnim proverenim električarima za brz dolazak',
      'Bez zvanja 10 brojeva dok tražite ko je slobodan',
      'Električar koji prihvati intervenciju kontaktira vas direktno',
      'Cenu, dolazak i detalje dogovarate pre početka rada'
    ],
    commonProblems: [
      'Nestanak struje u stanu ili delu stana',
      'Osigurač stalno iskače ili je pregoreo',
      'Utičnica varniči / miris paljevine iz zida',
      'Servis TA peći (ne duva, ne greje, zamena grejača)',
      'Bojler ne greje vodu',
      'Zamena table sa osiguračima',
      'Povezivanje šporeta, rerne i indukcione ploče',
      'Ugradnja LED rasvete, lustera i plafonjera'
    ],
    faq: [
      {
        question: 'Kada treba odmah da pošaljem zahtev električaru?',
        answer:
          'Pošaljite zahtev kada imate nestanak struje, varničenje, miris paljevine, problem sa osiguračima, bojlerom, TA peći ili instalacijom koju ne treba sami da popravljate.'
      },
      {
        question: 'Da li mogu da pošaljem zahtev za električara 24/7?',
        answer:
          'Da. Zahtev možete poslati u bilo kom trenutku, a sistem ga prosleđuje trenutno dostupnim proverenim električarima za tu vrstu intervencije.'
      },
      {
        question: 'Koliko brzo može da dođe električar?',
        answer:
          'Zahtev odmah prosleđujemo trenutno dostupnim proverenim električarima. Električar koji prihvati intervenciju kontaktira vas direktno da dogovorite brz dolazak, cenu i detalje.'
      },
      {
        question: 'Šta da radim ako utičnica varniči ili se oseća miris paljevine?',
        answer:
          'Ne dirajte instalaciju i ne pokušavajte popravku. Ako možete bezbedno, isključite odgovarajući osigurač ili glavni prekidač i pošaljite zahtev električaru.'
      },
      {
        question: 'Da li mogu da pošaljem zahtev za bojler, TA peć ili osigurače?',
        answer:
          'Da. Možete poslati zahtev za bojler, TA peć, osigurače, utičnice, rasvetu, tablu sa osiguračima i druge elektro kvarove.'
      },
      {
        question: 'Kako da opišem električni kvar?',
        answer:
          'Navedite šta ne radi, kada se kvar pojavio, da li iskače osigurač, ima li varničenja ili mirisa paljevine i da li je problem u celom stanu ili samo u jednoj prostoriji.'
      },
      {
        question: 'Kako se dogovara cena električarske intervencije?',
        answer:
          'Cenu, dolazak i obim intervencije dogovarate direktno sa električarom koji prihvati zahtev, pre početka rada.'
      }
    ]
  }
} as const

export const bravarLanding: ServiceLandingConfig = {
  slug: 'bravar',
  path: '/bravar',
  tipQuery: 'bravar',
  seo: {
    title: 'Bravar Beograd 24/7 | Brz dolazak',
    description:
      'Bravar Beograd 24/7 za otvaranje vrata, izgubljen ključ i zaglavljenu bravu. Pošaljite zahtev — šaljemo ga dostupnim proverenim bravarima za brz dolazak.'
  },
  hero: {
    badgeText: 'Pošaljite zahtev 24/7 • Bravari Beograd'
  },
  content: {
    usp: [
      'Jedan zahtev šaljemo trenutno dostupnim proverenim bravarima za brz dolazak',
      'Bez zvanja 10 brojeva dok stojite ispred vrata',
      'Bravar koji prihvati intervenciju kontaktira vas direktno',
      'Cenu, dolazak i način intervencije dogovarate pre početka rada'
    ],
    commonProblems: [
      'Hitno otvaranje zaglavljenih vrata (stan, kuća)',
      'Ključ ostao u bravi sa unutrašnje strane',
      'Izgubljeni ključevi (otvaranje + zamena cilindra)',
      'Ključ se polomio u bravi ili neće da se okrene',
      'Vrata neće da se zaključaju',
      'Otvaranje sigurnosnih vrata',
      'Zamena kvaka, štitnika i sigurnosnih brava',
      'Montaža dodatne brave ili reze'
    ],
    faq: [
      {
        question: 'Kada treba da pošaljem zahtev bravaru za hitnu intervenciju?',
        answer:
          'Pošaljite zahtev ako ste zaključani, izgubili ste ključ, ključ je pukao u bravi, vrata su zaglavljena ili je potrebna zamena cilindra.'
      },
      {
        question: 'Da li mogu da pošaljem zahtev za bravara 24/7?',
        answer:
          'Da. Zahtev možete poslati u bilo kom trenutku, a sistem ga prosleđuje trenutno dostupnim proverenim bravarima za izabranu intervenciju.'
      },
      {
        question: 'Koliko brzo može da dođe bravar?',
        answer:
          'Zahtev odmah šaljemo trenutno dostupnim proverenim bravarima. Bravar koji prihvati intervenciju kontaktira vas direktno da dogovorite brz dolazak, cenu i način otvaranja ili zamene brave.'
      },
      {
        question: 'Može li brava da se otvori bez oštećenja?',
        answer:
          'U mnogim slučajevima moguće je predložiti rešenje sa minimalnim oštećenjem, ali način intervencije zavisi od brave i situacije.'
      },
      {
        question: 'Da li je potrebna potvrda da imam pravo pristupa stanu?',
        answer:
          'Da, bravar može tražiti potvrdu da imate pravo pristupa prostoru, naročito kod hitnog otvaranja stana, kuće ili poslovnog prostora.'
      },
      {
        question: 'Kako se dogovara cena otvaranja vrata ili zamene cilindra?',
        answer:
          'Cenu, dolazak i način intervencije dogovarate direktno sa bravarom koji prihvati zahtev, pre početka rada.'
      },
      {
        question: 'Šta ako je ključ pukao u bravi ili je brava zaglavljena?',
        answer:
          'Opišite šta se desilo i dodajte fotografije ako ih imate. Bravar koji prihvati zahtev kontaktira vas da proceni situaciju i dogovori intervenciju.'
      }
    ]
  }
} as const
