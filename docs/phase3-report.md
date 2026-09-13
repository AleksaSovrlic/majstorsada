# Celina 3 — izveštaj o lokalnoj implementaciji

Datum: 12. septembar 2026. Grana: `codex/dependency-maintenance`. Osnova: `e4b6f8b951d24b2e80628684562242d67b27656a`.

Status: objavljeno i automatski provereno na produkciji 13. septembra 2026. po odobrenju vlasnika. Rezultati i dodatna zaštita SSR runtime limita: [phase3-release.md](phase3-release.md). Vlasnik je potvrdio ručnu proveru i odobrio Git commit/push.

## Šta je postignuto

Ažurirane su povezane biblioteke i dovršena kontrola zavisnosti pri pripremi SSR izdanja. Za korisnika ostaju isti tokovi registracije, prijave, objavljivanja i prihvatanja posla. Nema migracije ili brisanja podataka.

| Grupa | Konačna verzija |
| --- | --- |
| Nuxt / Vue / Vue Router | 4.5.2 / 3.5.42 / 5.3.1 |
| Firebase browser SDK | 12.19.0 |
| Firebase Admin / Functions | 14.4.0 / 7.3.2 |
| Firebase CLI | 15.30.0, lokalno zaključan |
| Pinia / Nuxt integracija | 3.0.4 / 0.11.3 |
| Robots / Sitemap / Schema.org | 6.2.2 / 8.5.0 / 6.3.1 |
| Produkcioni Node | 24; lokalni alat 24.18.0 |

Nisu korišćeni `--force`, `legacy-peer-deps` ili prinudni dependency overrides. Tri eksplicitne razvojne zavisnosti rešavaju zahteve novog alatnog lanca; završni `npm ls --all --json` prolazi bez neusaglašenih zahteva.

`deploy/ssr/package.json` i `package-lock.json` sada čuvaju pregledan SSR skup, uključujući posredne zavisnosti. Običan build proverava manifest i instalira zaključano stablo preko `npm ci`. Promenjen skup zahteva namerno osvežavanje i pregled. I standardna deploy skripta i postojeća Firebase predeploy provera koriste ovu zaštitu. Ponovljivost se odnosi na npm stablo, ne na identične bajtove svakog builda ili upravljanog cloud okruženja.

Promene aplikacionih stranica obuhvataju usklađivanje prvog SSR/browser prikaza privatnog dela aplikacije (opis ispod) i tri JSON-LD reference pružaoca usluge sa `#identity` koji emituje novi Schema.org paket. Novi paket uklanja prethodno duplirani Organization čvor. Naslovi, opisi, canonical adrese, javne rute, sitemap i pravila indeksiranja ostaju očuvani.

API izvorni kod, poslovni composables/stores, Firestore/Storage pravila i `firebase.json` nisu menjani. Ostaju privatnost telefona do prihvatanja, odsustvo emaila klijenta kod majstora, pregled poslova/fotografija sa nula tokena, administratorska dodela tokena i jednokratno zaduženje pri prihvatanju.

## Bezbednosni nalazi

| Npm audit skup | Pre: ukupno (critical/high) | Posle: ukupno (critical/high) |
| --- | ---: | ---: |
| Korenski paket, uključujući alate | 74 (9/27) | 9 (0/0) |
| API | 18 (1/3) | 2 (0/0) |
| Generisani SSR | 18 (2/3) | 2 (0/0) |

Svi preostali nalazi su moderate. Brojevi se preklapaju i nisu broj nezavisnih iskoristivih propusta. API i SSR zadržavaju `gaxios/uuid` upozorenje u podržanom Firebase Storage lancu. Prijavljeni problem tiče se drugih UUID funkcija i prosleđenih izlaznih bafera; pregledani poziv ovde koristi `uuid.v4()` bez takvog bafera. Preostala upozorenja alata takođe imaju pojedinačno obrazloženu primenljivost u [dependency-advisories.md](dependency-advisories.md). To je dokumentovan preostali rizik, a ne tvrdnja da su svi paketi bez grešaka.

## Dokazi provere

- Čista instalacija korenskog i API stabla iz lockfile-ova i API kompilacija prošle su. Konačni produkcioni Nuxt build završio se instalacijom 105 direktnih SSR zavisnosti iz pregledanog lockfile-a. Ponovljeni redovni build nije zahtevao njegovo osvežavanje.
- Bezbednosna emulator zbirka: **98/98**. Prethodnih 96 scenarija je očuvano; dodata su ponašanja trajnih/privremenih FCM grešaka i produkcionog CORS adaptera.
- Zaštita builda: **13/13**, uključujući odbijanje nedostajućeg lockfile-a, raspona verzija, pogrešnog runtime-a i neodobrenih promena direktnih/posrednih zavisnosti.
- API i browser emulator tokovi prethodno su prošli sa novim aplikacionim SDK-ovima. Ponavljanje sa praznim Vite kešom prošlo je sve poslovne scenarije. Završno ponavljanje sa stabilnim privatnim prikazom prošlo je sve poslovne scenarije, uključujući preusmeravanja između uloga i oporavak greške u proveri naloga, bez izvršnih ili hydration browser grešaka.
- Konačni kompajlirani SSR: **4 javne stranice**, **12 privatnih/kodiranih noindex ruta**, važeće JSON-LD reference, sitemap, robots, 404 za nepostojeću rutu i prazan odgovor isključenog island handlera. Nema detektovanih browser izvršnih ili prijavljenih hydration grešaka; mobilna početna stranica nema horizontalno prelivanje i njen screenshot je vizuelno pregledan.

Testovi rade nad lokalnim demo emulatorima; ne koriste produkcionu bazu. Produkcioni CORS adapter je posebno testiran zato što Firebase emulator dodaje permissive debug CORS sloj. FCM test simulira samo slanje i odgovore dobavljača; nije slao stvarne poruke. Postupak ponavljanja nalazi se u [dependency-checks.md](dependency-checks.md).

Lokalni logovi su u ignorisanom `.firebase/`: `phase3-security-final.log`, `phase3-build-final.log` (pre korekcije privatnog prikaza), `phase3-build-release.log` (konačni build), `phase3-e2e-final.log` (neuspelo prvo završno ponavljanje), `phase3-e2e-cold-final.log` (ponavljanje sa eksplicitnim čekanjem hidratacije), `phase3-e2e-hydration-final.log` (dijagnostika preusmeravanja), `phase3-e2e-account-final.log` (završna provera privatnog prikaza), `phase3-ssr-release.log` i tri `phase3-*-final-audit.json` datoteke. Testovi nisu garancija odsustva svih grešaka, niti potvrda produkcionog IAM-a, stvarne isporuke poruka ili cloud cold start vremena. Build ima upozorenja održavalaca pojedinih zavisnosti; ona nisu predstavljena kao greške aplikacije ili prećutana kao potpuno čist build.

## Dodatna opažanja iz završnog ponavljanja

Prvo završno E2E ponavljanje stalo je na registraciji: automatizacija je popunila SSR polja pre završene Vue hidratacije, a vrednosti nisu opstale. Dodato je eksplicitno čekanje Nuxt `isHydrating === false`, bez promene poslovnih očekivanja ili aplikacione forme. Provera je ponovljena sa obrisanim isključivo generisanim Vite kešom. I produkcioni SSR browser test sada eksplicitno proverava završenu hidrataciju na javnim stranicama, pored SEO sadržaja.

U razvojnom emulator toku registrovana su hydration upozorenja pri vraćanju postojeće prijave i direktnom otvaranju stranice druge uloge. Server nema browser Auth stanje; client middleware može pre prve hidratacije promeniti i ceo layout. To je poznata klasa problema u Nuxt SSR/client rutiranju ([upstream reprodukcija](https://github.com/nuxt/nuxt/issues/31228)); lokalni test je potvrdio konkretne pogođene tokove ove aplikacije.

Konačna korekcija je ograničena na `app/app.vue`: privatni ulaz dobija stabilnu serversku poruku „Učitavanje naloga…“, a postojeći privatni layout i stranica montiraju se u browseru posle odluke middleware-a. Početni režim se čuva u Nuxt payload-u kako preusmeravanje ne bi promenilo stablo usred hidratacije. Javne stranice i njihov sadržaj ostaju serverski renderovani/prerenderovani. Privatne stranice ostaju noindex; nalog, tokeni, kontakti i API zaštita se ne menjaju. Nema dodatnog punog učitavanja stranice, novog role lookup-a ili uvođenja serverskih sesija.

Praktična razlika je da pri direktnom otvaranju privatnog URL-a korisnik prvo kratko vidi poruku učitavanja, umesto serverske forme koja još ne zna stanje prijave. Te stranice i ranije zahtevaju JavaScript za funkcionalan rad. E2E sada odbija i console hydration greške, uključujući prelazak između uloga i oporavak posle nedostupne provere naloga. Završno ponavljanje (`phase3-e2e-account-final.log`) prošlo je bez izvršnih i hydration browser grešaka. SSR test dodatno proverava stabilan privatni shell, noindex i očuvan kompletan javni SEO.

## Blaze i performanse

Projektovani dodatak broju aplikacionih Firestore čitanja/upisa/brisanja po istom poslovnom toku je **0**. Nema novih funkcija, zakazanih poslova, SMS-a, servisa ili izmena regiona, min/max instanci i memorijske konfiguracije.

Izmereni JS/CSS fajlovi koje početni HTML referencira porasli su sa **215.631 na 289.741 bajtova gzip**, odnosno **74.110 bajtova (~74 KB, 34%)**. To daje približno **74 MB dodatnog prenosa na 1.000 prvih učitavanja** bez ponovne upotrebe keša. Ovo je poređenje lokalno kompresovanih fajlova, ne kompletan mrežni zapis sesije ili tačan račun: stvarna kompresija, keš, slike i navigacija utiču na prenos.

Lokalni topli SSR odgovori za četiri javne rute u završnom testu bili su 32–68 ms. To nije poređenje cloud cold start-a pre/posle niti garancija istog CPU/memorijskog troška. Upotrebljiv referentni komplet prethodnog serverskog builda nije sačuvan za pouzdano poređenje njegove ukupne veličine. Pre marketinga treba izmeriti stvarne mrežne zahteve i razmotriti odloženo učitavanje Firebase funkcionalnosti na javnim stranicama, bez ugrožavanja prijave.

Ova promena sama ne određuje koliko korisnika ostaje u besplatnim kvotama. Zadržava se postojeći poslovni model potrošnje, uz merljiv dodatak prenosa. Kasniji deploy uključuje Cloud Build/artefakte; produkcionu potrošnju treba pratiti posle objave. Ovim lokalnim testovima nisu dodate aplikacione operacije na produkcionom Blaze projektu.

## Sledeći koraci

1. Posle odobrenja objavljivanja ponovo proveriti izvor i build, pripremiti povratak na kompatibilnu celinu 2, objaviti API/SSR/Hosting i potvrditi identitete izdanja i stvarne runtime postavke. Pravila i baza ne zahtevaju funkcionalnu promenu.
2. Proveriti javne/privatne rute i ključne API odgovore uživo. Vlasnik zatim proverava prijavu, objavu sa slikom, pregled sa nula tokena, prihvatanje i prikaz telefona, završavanje posla i odjavu. Email klijenta ne sme biti prikazan majstoru.
3. Nakon prihvatanja i zasebnog Git odobrenja napraviti commit i push. Predlog naslova u stilu istorije: `build(platform): refresh dependencies and lock SSR deployment builds`.
4. Sledeća poslovna celina ostaje zaštita od zloupotrebe i kontrola troškova: ograničenja, paginacija, zadržavanje podataka i merenje potrošnje. Za nju pripremiti plan pre implementacije, zatim OTP, pa završna spremnost za marketing.
