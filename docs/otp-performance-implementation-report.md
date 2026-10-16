# OTP i pouzdanost učitavanja — lokalna dorada

Datum: 11. oktobar 2026. Status: lokalna implementacija, završni build i sve navedene regresije prošli su. Produkcija nije menjana, commit i push nisu rađeni.

## Šta je promenjeno

1. Login sada priprema Turnstile skriptu čim se otvori. Više komponenti deli jedno učitavanje, sa rokom od 12 sekundi, nezavisnim otkazivanjem i oporavkom posle greške. Sam izazov i svež token vezan za zahtev nastaju tek kada korisnik pošalje formular. Otvaranje stranice ne šalje OTP.
2. Posle Firebase custom-token prijave OTP dovršavanje deli proveru uloge koju je pokrenuo Auth watcher. Uklonjen je drugi prinudni `resolveAccount` poziv na tom putu. Provere UID-a, promene sesije i uloge ostaju. Prinudne provere posle drugih promena naloga nisu menjane.
3. AWS transport se inicijalizuje tek za stvarno slanje, a paralelna slanja u istoj instanci dele inicijalizaciju. Provera koda i ponavljanje već obrađenog zahteva ne inicijalizuju AWS sender. Greška pre slanja ostaje sigurno neuspešno slanje; greška stvarnog SES slanja se ne ponavlja automatski. Rezervacije kvota ostaju sačuvane.
4. Svaki frontend build dobija jedinstveni identifikator oblika Git-revizija + UUID. Dve objave istog dirty checkout-a više ne nose isti identifikator. API `BUILD_SHA` i dalje označava reviziju izvornog koda, odvojeno od frontend identifikatora.
5. Build wrapper proverava SSR i Hosting identitet i pravi privatnu potvrdu sa hash-evima pregledanih frontend ulaza i resursa. Predeploy provere odbijaju mešane, naknadno izmenjene ili zastarele resurse. Potvrda je izvan oba direktorijuma koji se objavljuju; ne sadrži vrednosti tajni. Runtime override identifikatora nije dozvoljen. Zaključane SSR biblioteke se i dalje instaliraju kroz postojeći pregledani `npm ci`.
6. `latest.json` dobija `no-cache`. Zadržan je postojeći Nuxt mehanizam: provera nove verzije u postojećem intervalu, osvežavanje pri navigaciji i ograničen oporavak od nedostajućeg lazy resursa. Nisu uvedeni novi Firestore listener-i ili dodatno periodično proveravanje verzije.

## Dokazi iz testova

| Provera | Rezultat |
| --- | --- |
| Backend TypeScript build | Prošao |
| Build / SSR zavisnosti i identitet | 51/51 |
| OTP runtime, HTTP, transport, frontend, Turnstile i oporavak | 115/115 |
| OTP Firestore servis, identitet i održavanje | 39/39 |
| Bezbednost, privatnost, žetoni, transakcije i Storage | 115/115 |
| Header/notifikacije i paginacija | 31/31 |
| Cloud politika sa lokalnim fixture-ima, bez cloud poziva | 196/196 |
| OTP HTTP i browser, desktop i mobilni Edge | Prošlo |
| Postojeći kompletan poslovni HTTP i browser tok | Prošlo |
| Compiled SSR, SEO i prikazi | 4 javne i 12 privatnih ruta; prošlo |
| Stara kartica i nedostajući lazy resurs | Prošlo; bez Auth/OTP upisa |
| Startup browser | 4 scenarija × 3 ponavljanja; prošlo |
| PowerShell deploy skripta | Sintaksa prošla; skripta nije izvršena |
| Privremeni emulator parametri i tajne | Uklonjeni |
| Whitespace diff provera | Prošla |

Ukupno 547 imenovanih Node provera, uz dodatne HTTP/browser scenarije.

OTP testovi proveravaju paralelne pozive, jedno slanje istog zahteva, globalnu granicu 500, tri rezervacije po adresi, pogrešne kodove, izgubljene odgovore, oporavak bez dodatnog mejla, zaštitu UID-a i privilegovanih naloga. Novi testovi učitavaju stvarni Auth store i proveravaju jedno deljeno čitanje uloge, zadržane prinudne provere na drugim putanjama i odbijanje promene sesije.

Poslovni browser je proverio prijave klijenta/majstora/admina, kreiranje zahteva, prekinuto kreiranje i fotografije, privatnost pre prihvatanja, žetone, prihvatanje i kontakt, završavanje, ocenu, istoriju 3/6/7, filtrirane recenzije, ponavljanje isteklog zahteva, grešku uloge i odjavu između tabova.

Recovery browser koristi stvarne compiled Nuxt pluginove. Za proveru politike osvežavanja emituje stvarni manifest hook: trenutno polje ostaje montirano, a naredna navigacija učitava jedan novi dokument i čuva query i neprozirnu OTP potvrdu u sessionStorage-u. Drugi scenario vraća stvarni HTTP 404 za lazy JavaScript i potvrđuje automatski oporavak. Za ponovljenu grešku istog učitanog chunk-a koristi se kontrolisani hook/router error i rok Nuxt zaštite od petlje. Ovo nije simulacija dve live objave niti merenje mreže Cloudflare-a.

Prvi SSR pokušaj nije pokrenuo browser jer izabrani Python nije imao Playwright. Korišćeno je postojeće lokalno okruženje `.firebase/toolchains/browser`; ponovljena provera je prošla. Biblioteke aplikacije nisu menjane radi rešavanja ovog testnog okruženja.

## Uticaj i granice

Očekivano je kraće čekanje pri prvom slanju kada se Turnstile skripta pripremi tokom unosa adrese; izvršavanje bezbednosnog izazova ostaje. Posle potvrde koda uklonjen je jedan suvišan API poziv. Provera OTP-a izbegava inicijalizaciju AWS sender-a. Ovo su potvrđene promene toka; nova stvarna produkcijska latencija još nije izmerena.

Nisu menjani poslovni limiti, pravila privatnosti, Firebase Auth bezbednosne provere, broj mejlova, min/max instance ili concurrency. `minInstances: 0` ostaje: posle mirovanja server i dalje može zahtevati hladno pokretanje. Ove izmene ne dodaju stalno plaćene instance, zakazane poslove ili Firestore upise. Turnstile skripta se sada preuzima i kada posetilac otvori login bez slanja; to ne šalje SES mejl niti uvodi novu Firestore radnju.

Kada Nuxt mora da osveži dokument, nesnimljen tekst i deo ručno unetog koda mogu se ponovo uneti. Kod i custom token se zbog toga ne zapisuju u storage. Test potvrđuje očuvanje postojeće neprozirne OTP potvrde, a postojeći Auth testovi proveravaju trajnu sesiju i promene između tabova.

Lokalna potvrda builda proverava pripremljene resurse. Ona sama ne čini distribuiranu produkcijsku objavu atomskom. Postojeći Firebase CLI objavljuje Functions pre Hosting-a; tokom prelaza nepovezan SSR rewrite može kratko referencirati resurse koji još nisu objavljeni. Za narednu odobrenu objavu treba kontrolisano pripremiti nove nepromenljive resurse uz postojeće pre zamene SSR-a, pa završnu usklađenu Hosting objavu, ili zasebno uspostaviti pinning postojećeg usklađenog live izdanja. Staging mora imati svoju proveru; završni build gate se ne zaobilazi.

`pinTag` nije dodat usput: prvi prelaz zahteva bootstrap na postojećem live izdanju, a ne samo novu zastavicu uz izmenjen SSR. Takođe ne čuva stare statičke resurse otvorenih tabova. Izvor: [Firebase Hosting i Functions](https://firebase.google.com/docs/hosting/functions#step_3_direct_https_requests_to_your_function).

## Završni resursi i naredni korak

Konačni frontend identifikator: `35a47f7-dirty-83ec4382-820b-4d94-af59-6f08af1dae1e`. Prethodni stvarni build istog checkout-a imao je `35a47f7-dirty-4aa89bd1-18c2-48e0-bd6e-e9254a0c3b2a`; identifikatori su različiti, kako je zahtevano.

`npm run build:verify` potvrđuje da se SSR runtime, Hosting manifest, ulazni kod i resursi poklapaju sa privatnom potvrdom. Provera je takođe namerno odbila prvi build nakon naknadne promene ulaza. Zaključani manifesti i lockfile-ovi biblioteka imaju iste hash-eve kao na početku ove dorade; završni SSR `npm ci` prijavio je 0 ranjivosti.

Browser suite ponovljen je na konačnom buildu: 4 javne i 12 privatnih ruta, povučeni magic-link ulazi, prikazi lozinke, navigacija stare kartice i ograničen oporavak stvarnog 404 lazy JavaScript resursa prošli su, sa praznom listom browser grešaka. Lokalna SSR merenja javnih ruta bila su 65/44/53/38 ms; ona ne uključuju produkcijsku mrežu ili hladno pokretanje i nisu obećanje live latencije.

Privremeni emulator fajlovi nisu ostali u funkcijama. Produkcijski pozivi, stvarna slanja mejla, cloud izmene i promene Git istorije nisu izvršeni u ovoj doradi.

Sledeći korak je posebno odobrena kontrolisana produkcijska objava. Ona obuhvata sveže preflight provere, pripremu povratka, koordinaciju SSR/Hosting resursa, objavu samo potrebnih funkcija, proveru očekivanog frontend identifikatora na statičkom manifestu i dinamičkom SSR dokumentu, pa malu stvarnu proveru OTP-a i latencije. AWS/Turnstile dostupnost i cold-start ponašanje potvrđuju se tada. Git commit/push ostaje zaseban korak.
