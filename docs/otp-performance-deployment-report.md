# OTP i pouzdanost učitavanja — produkcijska objava

Datum izveštaja: 12. oktobar 2026. Objava i završne provere su uspešne. Stvarna korisnička proba OTP brzine ostaje naredni korak; commit i push nisu izvršeni.

## Rezultat za aplikaciju

Login priprema Turnstile skriptu dok korisnik unosi adresu. Bezbednosni izazov i slanje koda nastaju tek pri slanju formulara. Posle potvrde koda aplikacija deli već pokrenutu proveru uloge umesto drugog prinudnog poziva. AWS sender se inicijalizuje tek za stvarno slanje, pa provera koda ne plaća taj korak učitavanja. SSR i javni resursi sada imaju jedinstven identifikator builda i proveru međusobne usklađenosti; manifest nove verzije ima `no-cache`.

Ovo uklanja potvrđene suvišne korake. Ne predstavlja obećanje trenutne prijave na svakoj mreži: Turnstile, Firebase Auth i hladno pokretanje servera ostaju deo stvarnog toka.

## Šta je objavljeno

| Deo | Aktivna revizija | Očuvane granice |
| --- | --- | --- |
| `requestClientOtp` | `requestclientotp-00006-jun` | min 0, max 2, concurrency 10, 256 MiB |
| `verifyClientOtp` | `verifyclientotp-00006-dim` | min 0, max 2, concurrency 10, 256 MiB |
| SSR `server` | `server-00046-xun` | min 0, max 3, concurrency 80, 256 MiB |

Završna Hosting verzija: `a9a046afb9d5d95a`; release: `1791755802388000`. Objavljena je 11. oktobra u 23:56 po vremenu Europe/Budapest (21:56 UTC). Završne provere završene su posle ponoći 12. oktobra.

Frontend identifikator: `35a47f7-dirty-83ec4382-820b-4d94-af59-6f08af1dae1e`.

Objava je imala odvojene, proverene korake: priprema povratka; objava samo dve OTP funkcije; dodavanje tri nova nepromenljiva resursa uz stari Hosting; priprema završne verzije; objava SSR-a; prebacivanje završnog Hostinga. Pre prebacivanja SSR-a novi resursi već su bili dostupni. Nijedan cloud upload sa nejasnim lokalnim zapisom nije naslepo ponovljen: njegov uspeh je potvrđen read-only preko Firebase-a.

Završni Hosting sadrži 85 kandidatovih fajlova, tri prethodna Nuxt resursa i dva Firebase generisana `init` fajla. Ukupno je 90 fajlova, bez uklanjanja prethodnih putanja. Zadržavanje prethodnih resursa pomaže postojećim otvorenim karticama; za buduće objave treba održavati ograničeno zadržavanje, bez neograničenog nagomilavanja.

## Dokazi i njihove granice

| Provera | Rezultat |
| --- | --- |
| Prethodna lokalna regresija | 547 imenovanih Node provera, uz OTP, poslovne i SSR HTTP/browser scenarije; prošlo |
| Svih 19 Functions metapodataka | Samo tri navedene funkcije ažurirane; ostalih 16 očuvano |
| Runtime, parametri i secret bindings | Očuvani; vrednosti tajni nisu čitane |
| Firebase Auth, scheduler i indeksi | Očuvani; indeksi spremni |
| Završni Hosting | Tačan komplet fajlova i konfiguracija potvrđeni preko API-ja |
| Dve live adrese | `majstorsada.rs` i Firebase `web.app`: novi i zadržani resursi imaju očekivane hash-eve; manifest i HTML imaju očekivani identifikator |
| Aktivne izvorne generacije | Arhive za obe OTP funkcije: svih 15 compiled fajlova po arhivi tačno jednaki lokalnim; SSR: 104 compiled fajla, manifest i runtime tačno jednaki |
| Negativni OTP HTTP pozivi | Nevažeći Turnstile odbijen, CORS ispravan, dijagnostika zatvorena, budžet nepromenjen i probni challenge-i nisu kreirani |
| Live browser | Desktop i mobilni viewport: login, četiri javne rute, SEO, prikazi prijave lozinkom i bezbedno preusmeravanje povučenih magic-link ulaza; prošlo |
| Turnstile priprema | Jedan početni GET po izolovanom kontekstu; Cloudflare 302 → 200; API spreman, bez challenge iframe-a i automatskog OTP/Auth poziva |
| Browser greške | Nema page/hydration grešaka ili neuspešnih Nuxt resursa |
| Produkcijski ERROR logovi | Četiri servisa od početka objave do završne kontrole: 0 neočekivanih; šest očekivanih 503 odgovora zatvorenih dijagnostičkih ruta |

Izvorne generacije i hash-evi potvrđuju objavljene izvore i compiled artefakte; ovo nije inspekcija fajl-sistema aktivnog kontejnera. Live HTTP i browser provere dopunjuju taj dokaz. Provere resursa tražile su revalidaciju i ne dokazuju trenutno osvežavanje svake ranije keširane kopije na internetu.

Browser je blokirao sve Auth/OTP i ostale upisne mrežne pozive. Nisu slati stvarni OTP mejlovi, kreirani nalozi ili menjani poslovi. Mobilni rezultat predstavlja mobilni viewport u Edge-u, ne zaseban fizički telefon. Ne potvrđuje live SES isporuku ili punu OTP prijavu posle ove objave.

Posmatrano vreme do vidljivog hidratizovanog polja bilo je oko 1,66 s na desktopu i 0,87 s na mobilnom viewportu; skripta je bila spremna oko 1,71 s i 0,91 s od početka navigacije. To su pojedinačna merenja na ovoj mreži, bez ranijeg produkcijskog poređenja i bez slanja/potvrde koda. Ne služe kao dokaz ukupnog OTP ubrzanja.

Dve dodatne tvrdnje privatnog browser helper-a ispravljene su prema stvarnom ponašanju: Nuxt posle preuzimanja payload-a briše `window.__NUXT__`, a Cloudflare skriptu preusmerava na svoju verzionisanu adresu. Zadržane su stroge provere aktivnog `$config` identifikatora, izvornog SSR dokumenta, jednog početnog zahteva i konačnog statusa 200. Aplikacija nije menjana zbog tih provera; originalni zapisi neuspeha su sačuvani.

## Trošak, očuvano ponašanje i povratak

Globalna granica 500 OTP slanja u klizna 24 sata i tri rezervacije po adresi nisu menjane. Nema novih stalno aktivnih instanci, Firestore listener-a, zakazanih poslova ili dodatnih upisa po prijavi. Priprema Turnstile skripte ne šalje SES mejl. Uklonjeno je drugo čitanje uloge na uspešnom OTP putu. Objava sama koristi uobičajene build/storage resurse; zadržana su tri prethodna Hosting resursa. Ovaj izveštaj ne daje novu garanciju ukupnog besplatnog računa.

Poslovni limiti, prihvatanje i privatnost poslova, prijava majstora/admina i podešavanja notifikacija nisu menjani ovom objavom. `minInstances: 0` ostaje, pa prvi poziv posle mirovanja i dalje može biti sporiji. Raniji problem sa brojem aktivnih poslova nije proglašen trajno reprodukovanim niti je panel usput prepravljan.

Pre objave sačuvani su izvori prethodnih funkcija, njihova konfiguracija i prethodna Hosting verzija `f396fa84a3e389c3`. Dokazi i povratni materijal su u ignorisanom `.firebase/otp-performance-release/`. Povratak bi zahtevao usklađeno vraćanje SSR-a, Hostinga i odabranih OTP funkcija; vraćanje samo Hostinga ne vraća dinamički server. Taj materijal se ne objavljuje u Git-u.

## Sledeća korisnička proba

1. Otvoriti `https://majstorsada.rs/login` u novoj privatnoj kartici. Uneti adresu, pa poslati kod. Zabeležiti približno čekanje od klika do potvrde da je kod poslat, odvojeno od dolaska mejla.
2. Uneti kod i proveriti prelazak na zahtev, pa osvežiti stranicu i proveriti da je prijava sačuvana. Dovoljna je jedna uspešna prijava; dnevni limit po adresi ostaje.
3. Na postojećem majstorskom nalogu proveriti otvaranje panela, prebacivanje kartica i prikaz broja aktivnih poslova. Ako se zastoj ponovi, zabeležiti stranicu, vreme i približno trajanje.

Tek posle te potvrde sledi posebno odobren Git commit/push. Detalji lokalnih testova: [lokalni izveštaj](otp-performance-implementation-report.md).
