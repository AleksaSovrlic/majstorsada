# Kontrolisana produkcijska OTP proba — rezultat

<!-- otp-magic-retirement:current -->
Aktuelno stanje posle kontrolisane objave i uklanjanja magic-link prijave: klijenti koriste isključivo šestocifreni OTP na `/login`. Stari `/finishLogin` i sign-in linkovi vode na čistu OTP prijavu, bez korišćenja Firebase koda. Izdavanje/prijava email linkom su isključeni; prijava majstora i administratora lozinkom ostaje uključena. [Aktuelni izveštaj](otp-magic-link-retirement-report.md). Raniji zapisi ispod predstavljaju istoriju završenih celina.
<!-- /otp-magic-retirement:current -->

Dopuna 10. oktobra 2026, posle javne objave: OTP je sada redovna prijava na `/login` za sve klijentske adrese. Limiti i postojeći UID-ovi su očuvani, a završavanje već izdatih magic linkova ostaje dostupno. [Aktuelni produkcijski izveštaj i proba](otp-public-deployment-report.md). Raniji zapisi ispod opisuju prethodne celine.

Dopuna 10. oktobra 2026, posle vlasnikove probe: dve stvarne OTP prijave su uspešne. Udaljeni receipt-i potvrđuju isti Auth/klijentski UID, oba SES accepted slanja i završen token/profil tok; pregled nije potrošio dodatne pokušaje. Javni/default OTP ostaje sledeća odvojeno odobrena celina. [Aktuelna provera i sledeći korak](otp-owner-live-validation-report.md). Raniji zapisi ispod čuvaju redosled prethodnih celina.

10. oktobar 2026. Odobrena objava je završena. OTP slanje i provera sada su dostupni samo za `aleksa@majstorsada.rs`. Obična klijentska prijava i dalje koristi magic link. Javni OTP nije uključen; uklanjanje magic link-a i git commit/push nisu deo ove objave.

Operaterske provere su prošle. Prvo stvarno slanje sa ispravnim Turnstile tokenom i ulazak u nalog čekaju vlasnikovu probu; negativne HTTP provere nisu dokaz uspešne AWS federacije, slanja ili Firebase potpisivanja.

## Šta je objavljeno

Objava je izvršena u četiri uzastopne, proverene celine u projektu `majstorsada-b2ad4`:

| Redosled | Precizan selektor | Rezultat |
| --- | --- | --- |
| 1 | `firestore:indexes` | Svih pet OTP field konfiguracija je READY; poslovni indeksi očuvani |
| 2 | `functions:api:maintainJobs` | Poslovno održavanje prvo; ograničeno OTP čišćenje posle njega |
| 3 | `functions:nuxt-ssr:server,hosting` | Provereni SSR i frontend objavljeni zajedno; nova Hosting verzija FINALIZED |
| 4 | `functions:api:requestClientOtp,functions:api:verifyClientOtp` | Uključena proba za jednu dozvoljenu adresu |

Nisu objavljena Firestore/Storage pravila ili ostale funkcije. Konačni inventar ima istih 19 ACTIVE funkcija; preostalih 15 zadržalo je potpune prethodne metapodatke, uz normalizaciju samo redosleda `eventFilters`. Za svaku celinu sačuvana je zasebna potvrda. `health` nije selektovan i očekivano ostaje prethodna objava; novi frontend potvrđen je metapodacima SSR-a, novim Hosting release-om i browser proverama.

Indeksi: očuvano je 15 poslovnih composite indeksa i dve postojeće field konfiguracije. Dodate su tri OTP wildcard konfiguracije bez automatskih indeksa i dva ASC `deleteAfter` indeksa za čišćenje. Nema novog TTL-a, composite indeksa ili brisanja poslovnog indeksa.

## Potvrđena aktivna konfiguracija

| Postavka | Stanje |
| --- | --- |
| `OTP_ENABLED` / `OTP_SEND_ENABLED` | true / true |
| `OTP_PUBLIC_ENABLED` | false |
| `OTP_TEST_EMAILS` | samo aleksa@majstorsada.rs |
| `OTP_TRUSTED_PROXY_HOPS` | 1, prema prethodno potvrđenoj granici svih šest Google ulaza |
| `OTP_DAILY_LIMIT` | 500 ukupnih rezervacija slanja u kliznom periodu od 24 sata, uz sigurnosni razmak |
| Limit jedne adrese | najviše tri pokušaja slanja u poslednja 24 sata |
| Dijagnostički prozor | prazan; HTTP zatvaranje potvrđeno na svih šest adresa |
| Podrazumevana prijava | magic-link |
| OTP runtime | Node.js 24, europe-west3, namenski otp-runtime identitet |
| Resursi obe OTP funkcije | 256 MiB, CPU 1, min 0 / max 2 instance po funkciji, concurrency 10, timeout 60 s |
| SSR resursi | 256 MiB, CPU 1, min 0 / max 3, concurrency 80, timeout 60 s |
| Održavanje | postojeći raspored svakih deset minuta, UTC, max 1 / concurrency 1, timeout 300 s |

Kandidat i aktivni lokalni projektni dotenv provereni su prema otisku sačuvanog odobrenog plana. Menjana su tačno četiri OTP parametra; javni gate, limit, dijagnostika i poslovni parametri su očuvani. Konačna udaljena konfiguracija odgovara kandidatu. Request funkcija koristi HMAC i Turnstile tajnu, verify samo HMAC; sve ostaju verzije 1. Direktne Google IAM/secret politike ponovo imaju status `verified`, bez akcija/blokada. Vrednosti tajni nisu čitane, nove verzije i trajni ključevi nisu kreirani. To nije pregled nasleđenog/group IAM pristupa ili dokaz vlasništva nad vrednošću provajderske tajne.

## Završne provere

| Provera | Rezultat |
| --- | --- |
| Svež preflight pre objave | Bez blokada; isti otisak ulaznog koda/build-a i kandidata kao 7. oktobra |
| Svaka uska objava i konačno stanje | Prošlo; 19 ACTIVE funkcija, ostalih 15 nepromenjeno |
| Poslovni i OTP indeksi | Očuvano / svih pet READY |
| Scheduler i OIDC cilj | Isti raspored, UTC, enabled stanje, cilj, retry podešavanja i deadline |
| Hosting | Nova FINALIZED objava 10. oktobra, 19:13:38.977 UTC; potvrđen rewrite na SSR server |
| Obični `/login` | 200, magic link, bez OTP polja |
| `/login?otpPreview=1` | 200, OTP forma, desktop/mobilni prikaz bez horizontalnog overflow-a |
| Turnstile pre slanja | Widget se ne učitava pre klika; proba nije slala formu |
| `/majstor/login` i `/admin/login` | 200 i postojeća polja za lozinku |
| Četiri javne rute | 200; isti naslov, H1 i canonical prema SEO baseline-u |
| Browser | Nula page grešaka; obe login varijante noindex i canonical bez preview query-ja |
| Adresa van dozvoljene liste | 503 / unavailable, pre poslovnog OTP rada |
| Vlasnikova adresa, neispravan bot token | 403 / permission-denied, pre poslovnog OTP rada |
| CORS preflight | 204, tačan dozvoljeni Origin; odbijeni POST odgovori private/no-store |
| OTP budžet i izazovi negativnih proba | Metapodaci budžeta nepromenjeni; oba probe challenge dokumenta ne postoje |
| Dijagnostika na svih šest Google adresa | Zatvorena i bez IP odgovora |
| Automatsko održavanje posle objave | Poslovni INFO zapis pa OTP INFO zapis, 19:15:05 UTC; OTP kandidata/brisanja 0, bez odlaganja |
| Svež produkcijski audit Functions paketa za ovu objavu | 0 nalaza svih ozbiljnosti |
| Svež produkcijski audit instaliranog SSR paketa za ovu objavu | 0 nalaza svih ozbiljnosti |
| Lokalna higijena | git diff --check prošao; nema privremenih emulator dotenv/secret fajlova ili test portova |

Matrica od 495 imenovanih testova i prethodni HTTP/browser poslovni, OTP, SSR/SEO i startup scenariji završeni su 7. oktobra i opisani u [izveštaju pripreme](otp-owner-preparation-report.md). Danas nije ponavljana cela matrica: svež preflight potvrđuje isti kod/build i kandidat, a dopunjena je provera aktuelnih advisories, cloud stanja i stvarno objavljenih stranica/granica. Uspešan prethodni poslovni browser dokaz je `business-e2e-retry.log`; prvi runner imao je problem UTF-8 ispisa, koji je ispravljen.

Nula audit nalaza odnosi se na navedene produkcijske pakete. Ne predstavlja tvrdnju da celo root razvojno/build stablo ili neselektovane ranije objavljene funkcije imaju identično ažurirane biblioteke.

Operator nije slao SES mejlove, kreirao Auth naloge ili ručno pokretao održavanje. Potvrđen je prirodan Scheduler prolaz. Tačna vlasnikova adresa neposredno pre ljudske probe i dalje nema Auth nalog (`new-client`); naredna prijava treba da napravi jednog klijenta.

## Uticaj na aplikaciju i trošak

Redovni korisnici nastavljaju postojeću prijavu. Preview query prikazuje formu; prava pristupa određuje server. Druge adrese se odbijaju pre bot/Firestore/Auth/slanje rada. Početni OTP čišćenje ne utiče na redosled poslovnog održavanja, a neuspeh pomoćnog čišćenja ne poništava završen poslovni prolaz.

Nema novih stalno toplih instanci, dodatnog scheduler-a ili secret verzija. Dve prazne OTP cleanup pretrage svakih deset minuta predstavljaju najmanje 288 Firestore čitanja dnevno; pronađeni kandidati dodaju čitanja i brisanja. Limit 500 ograničava aplikacijski OTP tok, a ne ručno SES slanje, ceo AWS nalog ili sve Firebase troškove. Jedna odobrena adresa ima limit tri pokušaja slanja, uključujući rezervacije neuspešnih pokušaja; ova proba ne šalje 500 mejlova. Ovi limiti nisu garancija ukupnog računa od nula.

## Vlasnikova prva proba

Nisu potrebna dodatna AWS, Cloudflare ili Zoho podešavanja, niti brisanje naloga.

1. Otvoriti [OTP probu](https://majstorsada.rs/login?otpPreview=1) u novom incognito prozoru.
2. Uneti tačno `aleksa@majstorsada.rs`, kliknuti **Pošalji kod za prijavu** i proći Turnstile ako traži interakciju.
3. Početni OTP tab ostaviti otvoren. Mejl proveriti u drugom tabu; očekivati `noreply@majstorsada.rs` i šestocifreni kod. Kod uneti samo u početnu formu, nikada u chat.
4. Posle potvrde očekivati `/zahtev`, naslov **Hajde da rešimo kvar.** i svoj mejl u formi. Stvaran posao ne treba slati.
5. Na početnoj stranici proveriti da header prikazuje **Moji zahtevi**. Javite da li je mejl stigao, u koji folder i da li je prijava prošla. Posle prve uspešne prijave ostanite prijavljeni i sačekajte operatorovo naredno uputstvo pre odjave i druge prijave, da bi UID prvo bio zabeležen.

Ako ishod slanja nije poznat, koristiti **Proveri isti zahtev**, bez novog slanja. Reload istog taba ne šalje dodatni mejl. Ako postoji greška ili mejl nije stigao, stati i javiti ishod bez koda/tokena, umesto ponavljanja novih zahteva. Kod važi deset minuta.

Po potvrdi prve prijave operator proverava sanitizovane delivery događaje i tačan Auth/klijentski profil, pa beleži otisak UID-a pre druge prijave. Zatim vlasnik na početnoj stranici bira **Moji zahtevi** → panel → **Odjava**, ponovo otvara isti preview link i radi još jednu prijavu, najmanje 60 sekundi posle prvog slanja. Operator upoređuje isti UID/profil. Tako su planirana dva pokušaja; treći ostaje za oporavak. Običan `/login` još koristi magic link.

Uspešna stvarna proba treba da potvrdi ispravno Turnstile uparivanje, Google identitet → AWS STS → SES, dostavu, udaljeno Firebase custom-token potpisivanje, pravljenje jednog klijenta i očuvanje njegovog UID-a pri sledećoj prijavi. To trenutno nije proglašeno završenim. Tek posle potvrde zajedno odlučujemo o javnom/default OTP-u, kasnijem uklanjanju magic link-a i git commit/push-u.

## Operativni dokazi i povratak

Ignorisani `.firebase/otp-owner-deployment/` čuva approved plan, početne inventare/parametre, deployment logove, četiri stage verification potvrde, nove Hosting/Scheduler metapodatke, browser slike i rezultat, negativne HTTP rezultate, finalnu IAM/diagnostic potvrdu i sanitizovan automatski maintenance zapis. Dotenv, privatni dokazi i cloud kredencijali nisu za git.

Sačuvan je usklađeni prethodni SSR source ZIP i Hosting release u `.firebase/otp-owner/rollback`, sa proverom otiska. Sam Hosting rollback ne vraća SSR kod. Pri problemu sa OTP-om prvi korak je vratiti sačuvanu zatvorenu projektnu konfiguraciju i usko objaviti samo obe OTP funkcije; zatvoriti slanje/OTP i isprazniti allowlist, bez brisanja naloga/poslova ili vraćanja poslovnih indeksa. Ako problem zahteva frontend povratak, vratiti usklađeni SSR/Hosting par. Održavanje i korisni OTP indeksi mogu ostati.

Alati prve IAM/secret i ingress pripreme imaju zaštite za zatvorenu/prvu objavu i zato nisu komande za ponovno uključivanje u aktivnom owner režimu. Završne provere koriste njihove ograničene read-only funkcije i direktan `verifyClosedIngress` nad stvarnim udaljenim rutama; nisu zaobilažene zaštite deploy/apply komandi.
