# OTP oporavak — kontrolisana produkcijska objava

Datum: 16. oktobar 2026. Objava i završne kontrole su uspešno završene. Commit i push nisu izvršeni.

## Rezultat

Oporavak nakon poznate greške čuvanja Firebase prijave sada je dostupan na produkciji. Ako SDK delimično postavi korisnika pa odbije IndexedDB upis, korisnik može ponovo kliknuti „Dovrši prijavu” bez novog mejla i bez nove serverske OTP provere. Potvrda Firebase prijave i klijentske uloge ostaje obavezna.

Lokalni obim, zaštite, ograničenja i 589 uspešnih testova dokumentovani su u [izveštaju implementacije](otp-browser-storage-recovery-report.md). Produkcijski postupak nije menjao testiranu aplikaciju ili zavisnosti.

## Objavljena verzija

| Deo | Aktivno stanje |
| --- | --- |
| Frontend build | `35a47f7-dirty-12704f9b-df6d-46bf-af3c-b45d1b639b02` |
| SSR revizija | `server-00047-xef` |
| Hosting verzija | `9e3dd16372b501c7` |
| Hosting release | `1792105008072000` |
| OTP slanje, očuvano | `requestclientotp-00006-jun` |
| OTP verifikacija, očuvano | `verifyclientotp-00006-dim` |

Završni Hosting aktiviran je 16. oktobra oko 00:56:48 po Europe/Budapest (15. oktobar 22:56:48 UTC).

Promenjen je samo SSR među 19 funkcija; ostalih 18 ima identične metapodatke prema snimku pre objave. SSR ostaje Node.js 24, 256 MiB, min 0, max 3 i concurrency 80. OTP funkcije ostaju min 0, max 2 i concurrency 10.

## Kontrolisani redosled

1. Potvrđeni su postojeći build receipt, SSR/Hosting identitet i pregledani SSR lockfile. Produkcijski baseline odgovara prethodnoj objavi.
2. Sačuvani su sveži Functions/Hosting metapodaci, tačna prethodna SSR source generacija i prateća konfiguracija za povratak.
3. Objavljen je pripremni Hosting `7c6521c430deb506`: tri nova nepromenljiva resursa, uz isti prethodni HTML, latest manifest i konfiguraciju. Sadržaj je potvrđen na obe live adrese.
4. Završni Hosting je unapred pripremljen i proveren, bez aktiviranja.
5. Objavljena je isključivo funkcija `functions:nuxt-ssr:server`. Potvrđeni su stanje ostalih funkcija, runtime granice i tačni compiled bajtovi nove SSR source generacije.
6. Aktiviran je pripremljeni završni Hosting, pa provereni komplet fajlova, konfiguracija, live HTML/resursi, browser prikazi i logovi.

Završni paket ima 93 fajla: 85 kandidatovih, šest prethodnih Nuxt resursa i dva Firebase generisana init fajla. Nije uklonjena nijedna prethodna putanja. Zadržani resursi podržavaju ranije otvorene kartice. Ovaj postupak objave ne predstavlja jednu atomsku transakciju SSR-a i Hostinga; prethodno postavljeni resursi i unapred pripremljen završni paket pokrivaju prelaz između njih.

Nije korišćen široki deploy svih funkcija, pravila i skladišta. Nije bilo ponavljanja mutacija sa nepoznatim ishodom; svi koraci ove objave završili su sa potvrđenim uspehom.

## Završni dokazi

| Provera | Rezultat |
| --- | --- |
| Build i SSR zavisnosti | Potvrđeni pre objave; završni `build:verify` prošao |
| Metapodaci svih 19 funkcija | Ažuriran samo SSR; ostalih 18 očuvano |
| SSR source generacija | Svih 104 izabranih compiled fajlova, manifest i runtime bajtovi odgovaraju lokalnom buildu |
| Hosting API | Tačan komplet od 93 fajla i očekivana konfiguracija |
| `majstorsada.rs` i Firebase `web.app` | Devet novih/zadržanih Nuxt putanja hash-ovano po adresi; pet HTML ruta po adresi ima novi build i dostupne reference |
| Izolovan live browser | Desktop i mobilni viewport, OTP početni ekran, četiri javne rute i SEO, prijava majstora/admina, povučeni magic-link ulazi; prošlo |
| Browser greške | Nema page/hydration grešaka ili neuspešnih Nuxt resursa |
| Turnstile priprema | API dostupan; bez automatskog izazova, OTP-a ili Firebase Auth zahteva |
| Vizuelna kontrola | Login prikazi pregledani; desktop logo potvrđen kao učitan i dekodiran |
| Serverski logovi | Četiri relevantna servisa, od 22:51:37 do završne kontrole u 22:58:05 UTC: 0 ERROR zapisa u vraćenim metapodacima |
| Lokalni očuvani ulazi | Svih 16 SHA-256 vrednosti nepromenjeno; privremena emulator konfiguracija odsutna |

Source poređenje proverava tačnu objavljenu arhivu i generaciju; ne predstavlja čitanje fajl-sistema aktivnog kontejnera. Browser i HTTP kontrole dopunjuju taj dokaz. Log rezultat se odnosi na pregledani prozor i zapise dostupne pri upitu, ne na garanciju budućeg rada.

Live browser je koristio nove izolovane kontekste i blokirao upisne zahteve. Nije poslat stvaran OTP mejl, kreiran nalog ili posao. Mobilni rezultat predstavlja mobilni viewport u Edge-u. Potpuna prijava i storage oporavak jesu prethodno testirani stvarnim SDK-om uz emulatore; stvarna produkcijska OTP prijava posle objave ostaje korisnička proba.

## Trošak i povratak

Očuvani su OTP limit od 500 slanja u klizna 24 sata, tri rezervacije po adresi, runtime granice, Firebase Auth konfiguracija, zakazano održavanje i indeksi. Nema nove stalno aktivne instance, novog listener-a ili dodatnog serverskog OTP poziva na redovnom putu prijave. Ručni oporavak može ponoviti Firebase Auth razmenu, ali ne šalje još jedan SES mejl.

Objava koristi uobičajene Cloud Build/storage resurse; zadržana su tri dodatna javna resursa u odnosu na prethodnu verziju. Ovo nije nova garancija ukupnog besplatnog računa.

Materijal za povratak nalazi se u ignorisanom `.firebase/otp-idb-release/rollback/`, uz prethodnu Hosting verziju `a9a046afb9d5d95a` i SSR reviziju `server-00046-xun`. Eventualni povratak mora uskladiti SSR i Hosting; sam povratak Hostinga ne vraća dinamički server. Privatni dokazi ostaju u `.firebase/otp-idb-release/` i ne ulaze u Git.

## Korisnička proba

1. U novom privatnom prozoru otvoriti [prijavu sa povratkom na zahtev](https://majstorsada.rs/login?from=%2Fzahtev%3Ftip%3Dvodoinstalater).
2. Zatražiti jedan kod, uneti ga i proveriti prelazak na formular zahteva.
3. Osvežiti stranicu i potvrditi da je klijentska prijava sačuvana.
4. Proveriti odjavu i, u svom uobičajenom prozoru, otvaranje postojećeg majstorskog panela.

Nije potrebno namerno izazivati storage kvar u svom browser profilu. Taj scenario pokriven je izolovanim testovima. Dovoljna je jedna uspešna produkcijska OTP prijava za ovu korisničku potvrdu; slanje novog posla nije obavezno za frontend promenu.

Posle korisničke potvrde Git commit/push ostaje zaseban korak koji zahteva korisničko odobrenje.