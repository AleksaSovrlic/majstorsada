# Kontrola troškova — lokalni izveštaj

Naknadni status, 24. septembar: produkcijska objava je završena i tehnički proverena; vlasnik je potvrdio uspešnu live proveru i odobrio Git commit/push. Detalji i incident pri prekidu opisani su u [cost-control-release.md](cost-control-release.md). Sledeći sadržaj beleži lokalni izveštaj pre objave.

18. septembar 2026. Grana `codex/cost-control`, osnova `3dbbf1b`. Produkcija i Git nisu izmenjeni ovom celinom. Ovo je izveštaj o implementaciji i uslovima objave, ne garancija nultog računa.

## Promena za korisnike

Klijent može da pošalje dva nova zahteva u klizna 24 sata, sa najmanje minutom između njih. Najviše dva zahteva mogu istovremeno da čekaju majstora ili dovršavanje fotografija. Ponovljeni pokušaj već sačuvanog slanja koristi isti ID i ne troši novu kvotu; otkazivanje ne vraća potrošenu dnevnu kvotu. Pre pritiska na slanje obrazac se ne skladišti.

Novi zahtev važi 24 sata od objavljivanja. Ako slanje fotografija nije dovršeno, rok je 24 sata od kreiranja. Prihvaćeni posao ne ističe. Istekli zahtev može eksplicitno da se pošalje ponovo kao novi, uz popunjene stare podatke i ponovni izbor slika. Telefon i email zadržavaju ranije granice privatnosti.

Istorija klijenta, majstora i recenzije učitavaju po tri stavke, pa još tri na klik. Administratorske liste učitavaju po 20. Aktivni poslovi ostaju uživo. Nova ponuda majstora počinje sa 20 i može da se proširi; i kada je svih 20 odbijeno, dugme za sledeće ostaje dostupno. Odbijanja više ne povećavaju niz na profilu.

Fotografije zatvorenih poslova uklanjaju se nakon sedam dana. Tekst, kontakt, ocene i evidencija žetona ostaju. Zaostale privremene kopije čisti ograničen serverski zadatak; to nije čuvanje nedovršenog obrasca. Stari neaktivni push tokeni uklanjaju se posle 90 dana. Push slanje obrađuje grupe i čuva napredak; isti događaj može se ponoviti nakon prekida, ali završen posao slanja preskače duplikate. FCM ne pruža transakciju sa bazom: prekid baš posle dostave može ponoviti poslednju grupu. Stabilna oznaka notifikacije smanjuje duplikate u prikazu.

## Dokazi i ograničenja provere

- Serverski/Firestore/Storage paket: 113/113 uspešnih testova. Pokriva konkurentno prihvatanje i limit, idempotentnost, validaciju, privatni kontakt, fotografije, istek, otkazivanje, dry-run, ponovljeno i prekinuto čišćenje, prihvaćene fotografije, istovremeno osvežen token, FCM lease, nastavak posle prve grupe od 100 tokena i HTTP 429 zaštitu preostalih API-ja koji menjaju bazu.
- Osnovni kompletan browser tok prošao je na lokalnim Auth, Firestore, Functions i Storage emulatorima: registracija, stvarni lokalni email-link, prekidi veze, fotografije, raspodela žetona, prihvatanje, ocena, istorija 3/6/7 sa jednakim datumima, recenzije, ponavljanje isteklog zahteva, dnevni limit, uloge i odjava između tabova.
- Završni prošireni browser tok takođe je prošao: prva grupa od 20 odbijenih poslova, prikaz sledećeg posla na klik i automatsko uklanjanje istekle ponude bez reload-a. Nije zabeležena browser/hydration greška.
- Startup/notifikacije 28/28; paginacija 3/3; build guardovi 13/13. Ukupno 157 pojedinačnih testova, uz poslovni E2E tok.
- Functions TypeScript build i konačan Nuxt produkcijski build prošli. SSR proverava četiri javne stranice, SEO/schema/sitemap i 12 privatnih noindex ruta; browserErrors=[] i mobilni javni prikaz bez horizontalnog prelivanja.
- Zavisnosti i lockfile nisu menjani; SSR instalira istih 105 zaključanih paketa. Build i dalje prijavljuje dve ranije poznate moderate zavisnosti; ova celina ih ne rešava niti uvodi nova ažuriranja paketa.
- Test infrastruktura: ispravljeno čekanje prekidača dostupnosti posle navigacije; test više ne može slučajno kliknuti samo oznaku statusa. SSR runner je pokrenut sa namenskim Python/Playwright okruženjem, jer sistemski Python nema Playwright. Rezultati gore odnose se na završene uspešne prolaze.

Emulatori ne potvrđuju produkcijske indekse, IAM, stvarni email/push, cloud račun ili ponašanje pri velikom opterećenju. Testovi ne znače da nijedna moguća greška ne postoji.

## Očitana produkcijska osnova

Read-only audit u 03:42 UTC: poslednjih sedam dana sadrži 608 očitanih Firestore reads, 83 writes, 2.644 Cloud Run zahteva i oko 698 naplativih instance-sekundi. Dostupno je četiri dnevna uzorka za reads i tri za writes; izostali uzorci nisu nezavisno potvrđena nula. To nisu iznosi sa računa ni marketinški load test. Metrika instance-sekundi sama ne daje cenu bez konfiguracije CPU/memorije i regionalnih kredita.

Baza je Standard u europe-west3 sa uključenom besplatnom kvotom. Bucket je us-central1 i ima sedam dana soft-delete čuvanja. Nađene su tri završene test-stavke, nijedna aktivna, bez novih polja politike. Audit ne kopira kontakt ni ceo sadržaj poslova u izveštaj. Skripta `tools/cost-control-audit.mjs` ponavlja ovaj pregled i čuva ignorisan lokalni JSON.

Cloud Monitoring ne vraća postojeće alert politike. Budget API je isključen, pa postojanje/iznos postojećeg budžeta nije potvrđeno. `ops/cost-control-budget.json` je pripremljen za obaveštenja na $5/$10/$20, ali nije primenjen. Pre primene proveriti valutu billing naloga, postojeće budžete i primaoce; podrazumevani billing administratori nisu nužno željena email adresa.

## Šta se štedi i šta se dodaje

Za korisnika sa 300 završenih poslova prvo učitavanje istorije sada uzima tri dokumenta umesto 300: 99% manje dokumenata same istorije. Klik na sledeću stranicu čita sledeća tri, bez ponovnog čitanja svih prethodnih. Ovo nije procenat uštede celog računa: ostali upiti, pravila, fotografije i aktivni poslovi i dalje postoje.

Novi trošak bez saobraćaja je pet ograničenih upita svakih deset minuta. Prazni upiti imaju minimalno jedno čitanje, dakle oko 720 reads/dan i 4.320 zakazanih poziva za 30 dana. To je 1,44% dnevne Firestore read kvote. Nema minimalno upaljene instance. Cloud Scheduler naplaćuje raspored, a ne svaki tick: prva tri rasporeda po billing nalogu su besplatna, zatim $0,10 po rasporedu mesečno. Stvarno vreme izvršavanja funkcije plaća se zasebno. [Firestore pricing](https://firebase.google.com/docs/firestore/pricing), [Scheduler pricing](https://cloud.google.com/scheduler/pricing)

Kreiranje dodaje mali transakcijski upit do dva pending dokumenta; ažuriranje kvote je u već postojećem upisu klijenta. Završetak/otkazivanje rok za fotografije stavlja u već postojeći upis posla. Čišćenje dodaje kratke upise markera i njihove upite. Nema Firestore TTL usluge ni brisanja istorije.

Za M dostupnih majstora sa jednim tokenom i K=ceil(M/20), uredan notification prolaz koristi približno 2M+K+4 reads i K+3 writes, bez ponavljanja i neispravnih tokena. Veći broj uređaja ima dodatne stranice od 100 i sačuvan napredak. Ovaj mali dodatak zamenjuje neograničeno učitavanje i omogućava nastavak; nije besplatan. Svaka promena job dokumenta takođe može pozvati postojeći Firestore update trigger, čak i kada on odmah zaključi da ne treba slati push.

## Model većeg saobraćaja

Primer, ne tvrda granica: 30 dana; dve fotografije po 256 KiB; deset majstora pogleda obe fotografije jednom; 20 dostupnih matching majstora dobija push (po jedan uređaj); deset otvorenih feedova vidi dolazak i odlazak posla. Sesija panela ima planski budžet 60 reads za profil/ulogu, početne prozore, istoriju i pomoćna čitanja. Model rezerviše 40 reads po poslu za poslovne operacije i održavanje; dodaje 41 za push deo zavisan od broja primaoca, 80 za slike i 20 za promene feeda. Ukupno: **reads/dan ≈ 181 × poslovi + 60 × sesije panela + 720**. Broj sesija znači otvaranja/ponovna povezivanja, ne broj registrovanih naloga. Ponovljeni upiti, odbijanja, pravila, mnogo uređaja i duge liste mogu premašiti ove pretpostavke.

| Poslova/dan | Sesija panela/dan | Planski reads/dan | Fotografije mesečno | Budžet prenosa fotografija |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 8.530 | 1,46 GiB | oko $0,18 |
| 100 | 300 | 36.820 | 14,65 GiB | oko $1,76 |
| 300 | 900 | 109.020 | 43,95 GiB | oko $5,27 |

Firestore ima 50.000 reads, 20.000 writes i 20.000 deletes dnevno, plus 1 GiB baze u besplatnoj kvoti za odgovarajuću bazu. Prva dva scenarija staju u read kvotu pod navedenim pretpostavkama; treći ne. Za srednji scenario razuman početni write budžet je oko 1.900 dnevno plus prijave/profili i odbijanja, daleko ispod 20.000, ali čitanja i slike će tipično postati ograničenje ranije. Dnevne kvote se ne sabiraju u mesečnu zalihu. [Firestore pricing](https://firebase.google.com/docs/firestore/pricing)

Prenos slika je procenjen po $0,12/GiB bez oslanjanja na eventualni početni mrežni kredit. Slike izlaze preko Cloud Run funkcije, pa Storage besplatni internet transfer nije obećanje besplatne isporuke slika kroz ovaj API. Pri 100 poslova/dan to je 60.000 poziva za slike mesečno. Ovo je samo foto-prenos, ne ceo račun. [Network pricing](https://cloud.google.com/vpc/network-pricing)

Cloud Run ima 2 miliona request poziva i compute kredite ekvivalentne 180.000 vCPU-sekundi / 360.000 GiB-sekundi mesečno po request modelu; krediti su na nivou billing naloga i regionalne cene se razlikuju. Broj poziva sam ne garantuje besplatan compute. [Cloud Run pricing](https://cloud.google.com/run/pricing)

Za dve slike po 256 KiB, ako posao traje prosečno dva dana do zatvaranja, sedam dana zadržavanja + sedam dana soft-delete i privremene kopije daju približno 1,12 GiB stabilnog foto-skladišta na 100 poslova/dan (bez avatara i ranijih podataka). Prihvaćen posao koji dugo traje ostaje sa fotografijama. Storage ima besplatne kvote u odgovarajućim US regionima, uključujući 5 GB-meseci i 5.000 Class A / 50.000 Class B operacija; upload i kopiranje približno 12.000 Class A operacija mesečno u srednjem primeru, pa mali operativni trošak može nastati i kada je skladište unutar kvote. [Storage pricing](https://cloud.google.com/storage/pricing)

Hosting saobraćaj, SSR, Mapbox, deployment/build i Artifact Registry nisu uključeni u foto-kolonu. Firebase Hosting stranica navodi 10 GB mesečnog prenosa, dok opšti cenovnik prikazuje 360 MB dnevno; pre određivanja tačnog broja besplatnih poseta proveriti primenjenu kvotu/SKU u projektu. Veličina slika od 256 KiB je pretpostavka: kompresija na 1280 px/quality 0,8 je ne garantuje. Maksimalno dozvoljene slike od skoro 3 MiB mogu trošiti približno 12 puta više po slici. [Hosting usage](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [Firebase pricing](https://firebase.google.com/pricing)

Zaključak za planiranje: sadašnja upotreba je mala. Optimizacija daje znatno više prostora u besplatnim kvotama baze, ali ne postoji univerzalan broj korisnika do kog je cela aplikacija sigurno besplatna. Planirati male troškove prenosa, uključiti upozorenja i meriti posle prvog saobraćaja. Budžet je upozorenje sa mogućim kašnjenjem, ne prekidač naplate. Email OTP provajder se bira i računa u narednoj celini.

## Ocena spremnosti

Lokalna implementacija je završena i provere podržavaju kontrolisanu produkcijsku objavu. Nema potvrđene regresije u proveravanim poslovnim tokovima. Namerni kompromisi su učitavanje istorije na zahtev, osvežavanje završene istorije dugmetom, proširenje realtime ponude koje ponovo čita prošireni prozor i kašnjenje evidentiranja isteka do sledećeg održavanja. Očuvani su prijava/uloga pre pristupa privatnim stranicama, trenutni aktivni poslovi, žetoni i privatnost.

Za lokalnu validaciju korišćeni su `npm run test:security`, `npm run test:startup`, `npm run test:cost`, `npm run test:build`, `npm run test:e2e`, `npm run build`, `npm run test:ssr` i `git diff --check`. Detaljni lokalni logovi su pod ignorisanim `.firebase/cost-*.log`; ekran istorije je `.firebase/e2e/15-history-first-page.png`. Poslednja dopuna limiter-a proverena je ponovljenim kompletnim serverskim paketom; browser poslovni tok je prethodno prošao sa istim UI-jem.

## Sledeći korak

Kontrolisana objava po `cost-control-plan.md`: ponovni read-only pregled test-podataka, indeksi READY, API/rules/UI uz write gate, održavanje prvo dry-run, zatim potvrda kandidata i uključivanje; podesiti budžet i proveriti dostavu obaveštenja. Tek posle live poslovnog testa dolaze commit/push. Naknadno izabrani naziv commita: `feat(jobs): add lifecycle policies and optimize dashboard loading`.
