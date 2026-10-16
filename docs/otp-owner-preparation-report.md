# Priprema kontrolisane OTP probe za vlasnika

Dopuna 10. oktobra 2026, posle vlasnikove probe: dve stvarne OTP prijave su uspešne. Udaljeni receipt-i potvrđuju isti Auth/klijentski UID, oba SES accepted slanja i završen token/profil tok; pregled nije potrošio dodatne pokušaje. Javni/default OTP ostaje sledeća odvojeno odobrena celina. [Aktuelna provera i sledeći korak](otp-owner-live-validation-report.md). Raniji zapisi ispod čuvaju redosled prethodnih celina.

Dopuna 10. oktobra 2026: odobrena produkcijska OTP proba je objavljena i operaterski proverena. Slanje i provera dostupni su samo za aleksa@majstorsada.rs; javni OTP ostaje zatvoren, a obična prijava koristi magic link. Prva stvarna Turnstile → AWS → Firebase prijava sada čeka vlasnikovu probu. [Aktuelni rezultat i uputstvo](otp-owner-deployment-report.md). Raniji zapisi ispod predstavljaju istoriju prethodnih celina.

7. oktobar 2026. Ova celina priprema stvarnu OTP probu za jednu potvrđenu vlasnikovu adresu. Produkcijski OTP ostaje zatvoren; nisu objavljeni novi indeksi, održavanje, frontend ili uključeno slanje. Nisu kreirani Auth nalozi niti poslati SES mejlovi.

## Šta je pripremljeno

Alat `tools/prepare-otp-owner.mjs --plan` koristi postojeći Firebase CLI login i čita ograničene metapodatke. Proverava stvarnu konfiguraciju obe OTP funkcije, svih 19 produkcijskih funkcija, namenske Google dozvole i dve secret verzije, podobnost tačne testne adrese, kompletnu konfiguraciju indeksa, raniji dokaz IP granice i sačuvan izvor trenutno objavljenog SSR servera.

Adresa `aleksa@majstorsada.rs` u trenutku provere nema Firebase Auth nalog, pa se njome testira pravljenje novog klijenta. Provera ne pravi nalog. Za postojeći nalog alat bi odbio administratora/majstora, konflikt uloga, deaktiviran ili nepotvrđen nalog i MFA. Auth lookup traži samo neophodna polja; password hash, salt i refresh token nisu u odgovoru. Profili se čitaju uz masku samo UID-a.

Pripremljeni `candidate.env`, kopija zatvorenih parametara i dokazi nalaze se isključivo u ignorisanom `.firebase/otp-owner` direktorijumu. Kandidat ne zamenjuje aktivni projektni dotenv. Menja tačno četiri parametra: uključivanje OTP-a i slanja, jednu dozvoljenu adresu i potvrđeni proxy korak 1. Javni OTP ostaje isključen, dijagnostički prozor prazan, globalni limit 500, a limit adrese tri slanja u klizna 24 sata. Magic link ostaje podrazumevani UI.

Plan beleži otiske izvora, zaključanih zavisnosti, generisanih artefakata i parametara. Pre kasnije objave preflight se ponavlja; stari plan nije dokaz da se stanje u međuvremenu nije promenilo.

## Održavanje i indeksi

Postojeće održavanje poslova sada ide prvo, pa OTP čišćenje. Greška OTP čišćenja ne pretvara završen poslovni prolaz u neuspeh. Čišćenje proverava vremenski budžet pre svakog novog upita/brisanja i posle 240 sekundi od početka poziva odlaže preostali rad. Već započet RPC se čeka i nije veštački otkazan. Očuvani su raspored svakih deset minuta, UTC, jedna instanca, concurrency 1 i timeout 300 sekundi. Stvarni Cloud Scheduler metapodaci potvrđuju te vrednosti i ENABLED status.

Produkcijski baseline sadrži 15 poslovnih composite indeksa i dva eksplicitna field override-a; svi odgovaraju lokalnom manifestu i spremni su. Potrebnih pet promena odnosi se samo na OTP: tri isključenja nepotrebnog indeksiranja i dva eksplicitna `deleteAfter` ASCENDING indeksa za čišćenje. Nema novog composite indeksa, TTL-a ili brisanja postojećih poslovnih indeksa. Pre objave scheduler-a mora se potvrditi READY stanje oba indeksa za čišćenje, kao i tri isključenja.

Firestore backend u stvarnoj proveri prihvata `pageSize=0`, dok pozitivne vrednosti vraćaju INVALID_ARGUMENT. Adapter je zato usklađen sa stvarnim API-jem; zadržava gornju granicu 1.000 stavki po tipu, deset stranica i zabranu ponovljenih/neispravnih continuation tokena. [Google indeks API](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.collectionGroups.indexes/list) i [field API](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.collectionGroups.fields/list).

## Biblioteke i vidljivost grešaka

Sveža provera je našla nove prijave za `source-map-js` i `proxy-addr`. Uvedene su kompatibilne, tačno zaključane zakrpe: source-map-js 1.2.2 i proxy-addr 2.0.8. SSR manifest i lock sada nasleđuju oba odobrena pina; zaštita objave odbija i staru ugnježdenu kopiju paketa. Dodatno je samo root lock ažurirao shell-quote 1.10.0 na 1.12.0 unutar postojećeg roditeljskog opsega. Nuxt, Firebase SDK i poslovne biblioteke nisu menjali glavne verzije.

Stvarni paketi za objavu proveravaju se zasebno: `functions` i `.output/server`. Root projekat uključuje i build/razvojne alate. Njegov audit sa omit=dev nije čist: 25 propagiranih zapisa (11 critical, 10 high, 4 moderate), odnosno sedam prijava kroz pet konkretnih paketa. Preostaju simple-git/argv-parser, braces, node-forge i postcss-selector-parser, sa propagiranim nalazima kroz roditelje. simple-git 4 uklanja default export koji postojeći Nuxt DevTools očekuje; nepodržan override bi pokvario kompatibilnost. DevTools je isključen, Git argumenti u pregledanom potrošaču su fiksni, a ovi paketi nisu u objavljenom SSR manifestu. Braces i Forge nemaju objavljenu zakrpu; postojeći CSS potrošači traže parser 6.x bez zakrpljenog 6.x izdanja. To je preostalo održavanje razvojnih alata, a ne tvrdnja da je ceo repozitorijum bez ranjivosti.

[Simple-git promene](https://github.com/steveukx/git-js/releases/tag/simple-git%404.0.0), [shell-quote prijava](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), [CSS parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

Postojeći operativni događaj sada može da pokaže fiksnu fazu problema: Google metadata, AWS federation, SES ili konfiguracija, uz definitivno odbijanje/neizvestan ishod. Beleže se samo proverene enum vrednosti; bez sirovog izuzetka, primaoca, OTP koda, tokena ili AWS kredencijala. HTTP odgovori, Firestore struktura i politika rezervacija/retry-a ostaju isti.

## Redosled kasnije objave

Posle zasebnog odobrenja produkcijske probe:

1. Ponoviti preflight, proveriti neizmenjeno stanje i trenutnu Hosting release prema backup-u; potvrditi finalne build/test dokaze.
2. Objaviti samo `firestore:indexes`, bez `--force`, pa sačekati i proveriti svih pet OTP konfiguracija. Svako poslovno odstupanje zaustavlja plan.
3. Objaviti samo `functions:api:maintainJobs`, uz očuvanje postojećih poslovnih gate-ova i rasporeda.
4. Objaviti samo `functions:nuxt-ssr:server,hosting` iz istog proverenog build-a. Podrazumevana prijava ostaje magic link. OTP preview je u ovom trenutku još serverski zatvoren.
5. Tek zatim aktivirati pregledani kandidat i objaviti samo `functions:api:requestClientOtp,functions:api:verifyClientOtp` za jednu adresu. Proveriti stvarne parametre i da je preostalih 15 funkcija nepromenjeno.
6. Proveriti redovni sajt/prijavu i odbijanje adrese van dozvoljene liste. Dostaviti vlasniku spreman preview link.

Ne koristiti široki deploy skript. Za Functions discovery ostaje procesno `FUNCTIONS_DISCOVERY_TIMEOUT=120`; to nije promena timeout-a cloud funkcija.

## Povratak i troškovi

Sačuvan je tačan ZIP izvora trenutno objavljenog SSR servera iz njegovog storage generation-a, sa proverom otiska, i metapodaci njegove trenutne Hosting objave. Sam Hosting rollback ne vraća SSR kod; eventualni UI rollback mora vratiti oba usklađena dela. Prvi potez pri problemu sa OTP-om je zatvaranje dva OTP endpoint-a i brisanje allowlist-a iz konfiguracije, bez brisanja klijenata ili poslova. OTP čišćenje ostaje dostupno na postojećem rasporedu.

Nema novih toplih instanci, scheduler-a, trajnih AWS ključeva ili secret verzija. OTP funkcije ostaju minInstances=0, maxInstances=2, 256 MiB i concurrency 10. Planirane dve prazne cleanup pretrage svakih deset minuta predstavljaju najmanje 288 Firestore čitanja dnevno; stvarni kandidati dodaju čitanja/brisanja. Limit 500 važi za slanje kroz aplikacijski OTP, ne za ručno SES slanje, AWS nalog ili sve Firebase troškove. U owner režimu samo jedna adresa može dobiti najviše tri slanja u 24 sata; test ne šalje 500 poruka.

## Vlasnikov deo

Sada nisu potrebna nova podešavanja AWS-a, Cloudflare-a ili Zoho-a, niti brisanje naloga. Posle odobrene objave vlasnik dobija spreman link i:

1. Otvara ga u incognito prozoru, unosi `aleksa@majstorsada.rs` i prolazi stvarni Turnstile.
2. Proverava prijem mejla od `noreply@majstorsada.rs`, šestocifreni kod i folder u koji je stigao.
3. Unosi kod i potvrđuje ulazak u klijentski nalog.
4. Po uputstvu radi jednu odjavu/ponovnu prijavu; operator potvrđuje da je ostao isti UID i jedan klijentski profil. Time se koriste dve od dozvoljene tri poruke.

Kod se unosi samo u formu, ne šalje u chat. Operator proverava sanitizovane delivery događaje i ograničene metapodatke naloga. Stvarni Turnstile secret/sitekey par, Google → AWS STS → SES i udaljeno Firebase potpisivanje još nisu dokazani emulatorima ili ovom read-only pripremom. Taj dokaz daje naredna stvarna proba, bez javnog uključivanja OTP-a.

## Završna validacija

| Provera posle izmena | Rezultat |
| --- | --- |
| Functions TypeScript build | Prošlo |
| Čista root instalacija i običan zaključani Nuxt/SSR build | Prošlo; 106 tačno zaključanih SSR zavisnosti |
| Cloud priprema, IAM/secrets/adapters, indeksni i owner preflight testovi | 196/196 |
| OTP runtime, HTTP, transport, frontend i orchestration | 85/85 |
| OTP servis, identitet i cleanup na Firestore emulatoru | 38/38 |
| Poslovna bezbednost, transakcije, privatnost i Storage pravila | 115/115 |
| SSR manifest, lock i policy zaštita | 25/25 |
| Pokretanje naloga i notifikacije | 28/28 |
| Paginacija i kontrola troška | 3/3 |
| Stvarni Storage multipart preko root/Functions/SSR biblioteka | 3/3 |
| Stvarni izgrađeni SSR Firestore SDK: upiti i paralelne transakcije | 2/2 |
| OTP HTTP i desktop/mobilni Edge na lokalnim emulatorima | Prošlo; bez browser grešaka |
| Postojeći poslovni HTTP i browser tok | Prošlo |
| Izgrađeni SSR: 4 javne i 12 privatnih ruta, SEO i mobilni prikaz | Prošlo; bez browser grešaka |
| Header/startup browser: 4 scenarija × 3 ponavljanja | Prošlo; bez page grešaka |
| Produkcijski npm audit lokalnog Functions paketa za objavu | 0 nalaza |
| Produkcijski npm audit lokalnog instaliranog SSR paketa za objavu | 0 nalaza |
| Stvarni read-only owner preflight | Spremno za odobrenje; 19 funkcija, novi klijent, poslovni indeksi očuvani, 5 planiranih OTP konfiguracija i 0 blokada |
| Stvarno zatvaranje dijagnostike na svih 6 Google adresa | Potvrđeno |
| git diff --check | Prošlo |

Ukupno 495 imenovanih Node testova, uz dodatne HTTP/browser scenarije. OTP scenariji proveravaju pogrešan kod, sesijsko vezivanje, ponavljanje istog zahteva bez novog slanja, reload, izgubljen odgovor slanja/provere, custom-token prijavu i očuvanje UID-a, profila i poslova. Poslovni browser proverava magic link, registraciju i njen oporavak, slanje/fotografije nakon prekida, privatnost pre prihvatanja, žetone, prihvatanje/kontakt, završavanje/ocenu, istoriju 3/6/7 sa jednakim timestamp-ovima, istek ponude bez reload-a, limit dva zahteva i odjavu između tabova.

U sintetičkom startup testu header je postao vidljiv 33,8–61,6 ms nakon potvrde uloge, uključujući spore notifikacije i sporu potvrdu uloge. To je kontrolisani lokalni rezultat, ne obećanje iste latencije na stvarnoj mreži. Nije pronađena regresija postojećih funkcija u ovim proverama.

Prvi završni SSR pokušaj nije pokrenuo browser jer nije bio izabran postojeći izolovani Python/Playwright runtime; ponovljen sa tim runtime-om je prošao. Prvi poslovni browser pokušaj zaustavljen je pri UTF-8 ispisu srpskog slova u Windows pipe-u, bez prijavljene browser greške. Testni Python proces sada eksplicitno koristi UTF-8; cela poslovna provera ponovljena je i prošla. Ovo menja samo testni pokretač.

Finalni logovi i sanitizovani cloud dokazi su u ignorisanom .firebase/otp-owner direktorijumu, a SSR policy test log u .firebase/otp-ingress/owner-build-tests-after.log. Testni serveri su ugašeni i demo parametri/tajne uklonjeni. Produkcijski parametri ostaju zatvoreni; iz ove pripreme nema deploy-a, SES slanja, kreiranja Auth naloga, commit-a ili Git pusha.

## Ocena i sledeći korak

Priprema je spremna za zasebno odobrenu, kontrolisanu produkcijsku probu samo sa vlasnikovom adresom. Lokalni i read-only cloud dokazi ne potvrđuju da će stvarni Turnstile, AWS federacija/SES i udaljeni Firebase potpis raditi zajedno: to se dokazuje narednom probom. Javna OTP prijava ostaje odvojena, kasnija odluka. Preostali audit nalazi razvojnih alata ostaju otvoreno evidentirani i zahtevaju dalje podržano održavanje.

Vlasnik sada ne menja konzole ili DNS i ne briše ništa. Posle odobrenja operator izvodi gore navedene objave i provere, pa dostavlja spreman link i kratko uputstvo za stvarnu prijavu. Vlasnik potvrđuje prijem koda i ulazak u nalog; operator proverava očuvanje identiteta i sanitizovane integracione dokaze.
