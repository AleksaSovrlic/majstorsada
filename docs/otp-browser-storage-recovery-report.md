# Oporavak OTP prijave posle greške čuvanja sesije

Datum: 16. oktobar 2026. Status: lokalna implementacija, sve navedene provere i produkcijski build završeni; spremno za zasebno odobrenu objavu. Produkcija i Git istorija nisu menjani ovom celinom.

## Problem koji je rešen

Firebase SDK može postaviti korisnika u memoriji, a zatim odbiti prijavu zato što IndexedDB upis nije uspeo. Naš prethodni pokušaj nastavka tumačio je taj korisnički objekat kao promenu naloga i prikazivao „Nalog je promenjen”. Detaljna prethodna analiza je u [dijagnostičkom izveštaju](otp-browser-storage-diagnostic.md).

Posle poznate greške čuvanja sesije korisnik sada vidi razumljivu poruku i može ponovo kliknuti „Dovrši prijavu”. Kod je već potvrđen; ne traži se novi mejl. Ako browser ponovo može da sačuva sesiju, Firebase prijava se dovršava, proverava se klijentska uloga i otvara ciljana stranica.

## Obim i zaštite

Promenjeni aplikacijski fajlovi u ovoj celini:

- `app/utils/clientOtpAuthRecovery.ts`: prepoznavanje određenih Firebase storage grešaka, bezbedno čitanje UID veze iz serverskog tokena i korisnička poruka.
- `app/composables/useClientOtp.ts`: pamćenje tačno određenog delimičnog pokušaja samo u memoriji i ponovni eksplicitni SDK pokušaj.
- `app/components/ClientOtpLogin.vue`: naslov i opis jasno kažu da je kod već potvrđen i da preostaje dovršavanje.

Oporavak zahteva isti korisnički objekat, UID očekivan iz konkretnog serverskog tokena i nepromenjeno praćeno stanje sesije. Stvarna promena korisnika ili odjava/ponovna prijava zaustavljaju dovršavanje kada ih postojeće provere uoče. Provereni su i zamena objekta sa istim UID-om i promene tokom provere uloge.

Čitanje JWT payload-a služi isključivo povezivanju pokušaja; ne potvrđuje potpis niti daje pravo pristupa. Uspešan `signInWithCustomToken` i serverska provera klijentske uloge ostaju obavezni. Prazan segment potpisa podržava zvanični Auth emulator; produkcijski SDK i dalje mora prihvatiti token. [Firebase dokumentacija za custom token prijavu](https://firebase.google.com/docs/auth/web/custom-auth).

Generička interna greška ne otvara izuzetak za delimičnu sesiju. Poznate storage greške proveravaju se preko originalne greške sačuvane u Firebase izuzetku. Kod i custom token se ne upisuju u aplikacijski sessionStorage; osetljive reference se čiste pri napuštanju toka.

Nema automatske petlje pokušaja, promene Auth persistence strategije, uvođenja slabije memorijske prijave, izmene uloga ili Firestore pravila. SDK promene sesije tokom asinhronog poziva nisu atomski pod kontrolom aplikacije; provere pre i posle poziva ostaju važne. Ova izmena ne tvrdi da menja tu SDK osobinu.

## Testovi i dokazi

| Provera | Rezultat |
| --- | --- |
| OTP pure testovi, uključujući 66 frontend slučajeva | 157/157 |
| OTP servis, identitet i održavanje uz Firestore emulator | 39/39 |
| Build zaštite, startup i paginacija | 82/82 |
| Lokalni cloud policy testovi sa fixture podacima | 196/196 |
| Bezbednosne regresije uz emulatore | 115/115 |
| Ukupno navedeni Node testovi, bez duplog brojanja | 589/589 |
| OTP HTTP i browser scenariji, desktop i mobilni prikaz | Prošli |
| Potpun poslovni ciklus i ostale postojeće poslovne browser regresije | Prošli |
| Produkcijski build, test pripremljenog SSR-a i završni build:verify | Prošli |

Novi frontend slučajevi pokrivaju delimično postavljanje korisnika pre odbijanja SDK poziva, zakašnjele Auth callback-ove, uporne storage greške, zamenu naloga i istog UID objekta, odjavu/prijavu tokom pokušaja, paralelne klikove, odbijen token, neispravan UID podatak, proveru uloge i čišćenje memorije. Potvrđeno je i pridruživanje postojećoj proveri uloge bez duplog `resolveAccount` poziva.

U browser probi korišćen je stvarni instalirani Firebase SDK, Edge/Playwright i izolovani demo emulatori. Prekinuti su isključivo upisi u Firebase Auth IndexedDB bazu testne stranice; ostali storage i aplikacija zadržali su stvarno ponašanje. Desktop i mobilni prikaz prošli su isti sled:

1. SDK postavlja očekivanog korisnika, a upis sesije pada; vidi se jasna poruka i nema prelaska na privatnu stranicu.
2. Ponovni klik uz isti kvar ponovo prikazuje kontrolisanu poruku.
3. Posle uklanjanja simuliranog kvara sledeći klik dovršava prijavu.
4. Privatna stranica je stvarno prikazana, a prijava ostaje sačuvana posle ponovnog učitavanja.

Izmereno po scenariju: jedan zahtev za slanje, jedna serverska OTP verifikacija, jedan zapis u testnom sandučetu i tri SDK pokušaja prijave. Browser rezultat nema neočekivanih grešaka. Proveren je i izgled poruke i uspešnog nastavka u mobilnom prikazu.

U toku izrade proba je otkrila razliku zvaničnog emulator tokena bez potpisa; UID čitač i negativni testovi dopunjeni su pre završnog prolaza. Browser asertacije čekaju stvarnu privatnu stranicu i čišćenje toka, a ne samo početak SPA navigacije. Prethodni neuspešni prolazi sačuvani su radi dijagnostike, završni rezultati navedeni su iznad.

Novi lokalni build: `35a47f7-dirty-12704f9b-df6d-46bf-af3c-b45d1b639b02`. Potvrđeno je slaganje SSR-a, Hosting fajlova, izvornih ulaza i build potvrde. Compiled SSR browser provera obuhvata četiri javne rute, SEO, 12 privatnih noindex ruta, klijentski OTP, povučene magic link ulaze, druge načine prijave i oporavak starog taba/nedostajućeg lazy chunka; nema neočekivanih browser grešaka. Provera nije merila produkcijsku brzinu.

## Trošak i kompatibilnost

Uspešna redovna prijava ima isti broj poziva kao pre. Ručni oporavak ponavlja samo Firebase SDK prijavu istim tokenom iz memorije; ne šalje nov mejl i ne ponavlja našu serversku OTP proveru. Nema dodatnih AWS slanja ili nove Firestore kvote zbog ove izmene normalnog toka. Postojeći OTP limiti ostaju isti.

Završni `build:verify` je prošao. Privremeni `.env.demo-majstorsada-e2e` i `.secret.local` testni fajlovi nisu ostali u `functions/`. SHA-256 kontrola obuhvata 16 prethodno zabeleženih ulaza: Firebase plugin/store, OTP backend fajlove, manifest i lock fajlove zavisnosti, Firebase konfiguraciju i Firestore pravila. Izmena oporavka ih nije menjala. Ostale ranije neprijavljene Git izmene ostaju sačuvane.

Oporavak ne oslobađa prostor na disku i ne popravlja oštećen browser profil. Ako browser i dalje ne može sačuvati prijavu, korisnik dobija jasnu poruku i mogućnost ponovnog pokušaja. Tačan izvor incidenta na korisnikovom računaru nije dokazan; simulacija dokazuje ponašanje aplikacije pod ovim SDK ishodom.

## Sledeći korak

Sve navedene završne provere artefakata su prošle. Sledeća celina je zasebno odobrena kontrolisana objava frontend promene kroz usklađene SSR i Hosting artefakte. OTP backend ne zahteva novu objavu zbog ovog oporavka. Posle objave sledi korisnička provera obične OTP prijave i poslovnog toka. Commit i push ostaju zaseban korak.

Privatni logovi i kontrolni podaci nalaze se u `.firebase/otp-idb-recovery/`; browser slike su u `.firebase/otp/browser/`. Testovi nisu slali AWS mejlove, menjali produkcijske naloge ili produkcijske kvote.