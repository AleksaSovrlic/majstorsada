# Održavanje biblioteka pre povezivanja OTP-a

Dopuna 7. oktobra 2026: nova provera u pripremi owner probe uvela je kompatibilne pinove source-map-js 1.2.2 i proxy-addr 2.0.8 u sva relevantna stabla, plus shell-quote 1.12.0 u root lock-u. Običan build iz zaključanih zavisnosti i stvarne SSR SDK provere su prošli. Functions i instalirani SSR imaju po 0 produkcijskih npm audit nalaza. Root audit sa omit=dev trenutno ima 25 propagiranih zapisa (11 critical, 10 high, 4 moderate) iz razvojnih/build alata; nije čist. [Aktuelni rezultati, ograničenja i provere](otp-owner-preparation-report.md). Brojevi i verzije ispod predstavljaju istorijski rezultat od 4. oktobra.

4. oktobar 2026. Lokalni rad na `main`, HEAD `35a47f7`. Sačuvana je prethodna, još neobjavljena OTP implementacija. Ova celina menja zavisnosti, njihove zaključane verzije, SSR pripremu i testove. Nisu menjani poslovni izvori, cloud podešavanja, produkcija, commit ili GitHub.

## Rezultat audita

| Stablo | Pre održavanja | Posle održavanja |
| --- | --- | --- |
| Functions, `npm audit --omit=dev` | 3 high, 2 moderate | 0 |
| Functions, puni `npm audit` | Uključivao i razvojne nalaze | 0 |
| Pregledani `deploy/ssr`, produkcijske zavisnosti | 7 high, 2 moderate | 0 |
| Stvarno instalirani `.output/server`, produkcijske zavisnosti | — | 0 |
| Glavni projekat, puni `npm audit` | 42 zapisa: 31 high, 10 moderate, 1 low | 26 zapisa: 24 high, 2 moderate |

Brojevi audita uključuju roditeljske pakete i njihove lance. Preostalih 26 zapisa glavnog projekta potiče od četiri konkretne prijave u alatima za razvoj/build/CLI; ta četiri paketa nisu u pregledanom ili instaliranom SSR stablu niti Functions produkcijskom stablu. Nula audit nalaza znači da trenutno nema poznatih prijava u npm bazi za te pakete, ne predstavlja garanciju da ne postoji nepoznat propust.

Sirovi auditi, stara metadata, pregled razlika verzija i završni build log sačuvani su lokalno u ignorisanom `.firebase/dependency-maintenance/`. Instalirana stabla glavnog projekta i SSR-a prošla su i `npm ls --all` bez nevalidnih zavisnosti.

## Zakrpe i kompatibilnost

| Biblioteka | Pre | Posle |
| --- | --- | --- |
| `@fastify/busboy` | 3.2.0 | 3.2.2 |
| `@grpc/grpc-js` | 1.9.16 / 1.14.4, zavisno od stabla | 1.14.5 |
| `brace-expansion` | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12 |
| `devalue` | 5.9.2 | 5.9.4 |
| `uuid` koji koristi gaxios 6 | 9.0.1 | 11.1.1 |
| Firebase CLI | 15.30.0 | 15.32.1 |
| Functions razvojni `minimatch` | 10.1.1 | 10.2.6, uz zakrpljen brace lanac |

Ciljano su osvežene i kompatibilne grane `qs`, `express`, `fast-uri`, `serialize-javascript` i `ip-address`. Noviji Firebase CLI donosi svoja podržana ažuriranja CSV/JSON alata. Direktni Firebase JS 12.19.0, Nuxt 4.5.2, Firebase Admin 14.4.0, Firebase Functions 7.3.2 i AWS SDK 3.1141.0 ostaju na odabranim verzijama. Node ostaje 24; Volta ostaje 24.18.0.

Dva izuzetka imaju izričito ograničen obuhvat:

- Firestore browser SDK i dalje deklarativno traži staru gRPC granu. Samo njegov gRPC potrošač dobija tačno 1.14.5 preko `@firebase/firestore` override-a. Admin/gax potrošači tu verziju prihvataju kroz svoje postojeće raspone. Browser Firebase SDK i SSR Admin/gRPC provereni su stvarnim emulator operacijama.
- Storage koristi gaxios 6, čiji `uuid` raspon nema kompatibilnu objavljenu zakrpu u staroj grani. Samo `gaxios@^6.0.0` dobija UUID 11.1.1. Gaxios na tom mestu koristi CommonJS `v4()` za multipart granicu; UUID 11.1.1 podržava taj poziv. Stvarni Storage → gaxios → UUID lanac u sva tri instalirana okruženja proverava tačan HTTP zahtev, oba dela tela i UUID granicu preko lokalnog servera. Nema globalnog UUID override-a. [Gaxios izvor](https://github.com/googleapis/gaxios/blob/v6.7.1/src/gaxios.ts), [UUID 11 dokumentacija](https://github.com/uuidjs/uuid/blob/v11.1.1/README.md).

## Zašto je menjana SSR priprema

Npm primenjuje override-e iz korenskog manifesta instalacije. Nitro pravi zaseban SSR manifest, pa samo root override ne bi zaštitio kasniju zasebnu instalaciju servera. `prepare-ssr.mjs` sada prenosi pregledanu politiku u generisani SSR manifest pre poređenja i instalacije. [Npm dokumentacija](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides).

`dependency-policy.mjs` proverava tačne verzije, obavezne scope selektore i stvarnu najbližu zaključanu gRPC/UUID zavisnost za svakog relevantnog potrošača. `assert-ssr-deps.mjs` proverava oba manifesta, politike, direktne verzije i celokupno zaključano stablo. Pogrešan ili izgubljen override prekida proveru. Redovan build koristi `npm ci`, ne bira nove verzije.

Prvo osvežavanje zadržalo je dve stare nested gRPC kopije. Kompatibilni `update`, običan `audit fix` i `dedupe` ih nisu uklonili. Stari SSR lock je sačuvan, a npm je jednokratno napravio novi lock iz istog manifesta sa tačnim verzijama i istih override-a. Verzije i integrity vrednosti nisu ručno prepisivane. Pregledan je ceo diff; podržani SSR transitive promenili su, između ostalog, Firestore 9.1.0 → 9.3.1, Storage 8.1.0 → 8.2.0 i google-gax 6.3.0 → 6.10.0. Nove Google Auth grane ostaju u deklarisanim rasponima.

Zatim je prošao običan `npm run build` bez refresh-a. SHA-256 potvrđuje da nije promenio canonical SSR manifest ili lock. Instalirani server i pregledani lock se potpuno poklapaju, imaju 106 tačno navedenih direktnih zavisnosti i čist produkcijski audit. Dodatna dva integraciona testa koriste isključivo Admin/Firestore/gax/gRPC biblioteke iz tog instaliranog servera.

## Preostali nalazi razvojnih alata

| Paket | Putanja / upotreba | Zašto nije prisilno menjan |
| --- | --- | --- |
| `braces` 3.0.3 | Tailwind 3, micromatch i razvojni file watcher-i | Najnovije objavljeno izdanje još je pogođeno; naši glob obrasci dolaze iz repozitorijuma. Migracija Tailwind-a ili vendor zakrpa bila bi zasebna promena. |
| `node-forge` 1.4.0 | Nuxt CLI → listhen, razvojni TLS sertifikati | Najnovije objavljeno izdanje još je pogođeno. Lokalni testovi koriste HTTP. Paket nije u SSR aplikaciji. |
| `basic-ftp` 5.3.1 | Firebase CLI → proxy/PAC/get-uri | Zakrpa je u 6.x, dok trenutni roditelj traži 5.x. Ne uvoditi nepodržan major override samo radi zelenog audita. |
| `@opentelemetry/core` 1.30.1 | Firebase CLI → Pub/Sub alat | Roditelj traži 1.x; zakrpa je u 2.x. Potrebno je podržano ažuriranje tog roditeljskog lanca. |

Puni root audit nije čist. `npm audit --omit=dev` u root-u takođe pokazuje 19 high roditeljskih zapisa jer Nuxt uključuje build alate u nominalne production zavisnosti; to nije manifest koji se objavljuje kao SSR server. Stvarni deployable paketi provereni su zasebno. `npm audit fix --force` u root-u predlaže neprikladne promene/downgrade-e i nije korišćen. Pre naredne objave ponoviti audite; nove podržane upstream zakrpe rešavati ciljano. Preostale prijave nisu skrivene ili izuzete iz audita.

Prijave: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [basic-ftp](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-c475-qrg2-pj4r), [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf).

## Završene provere

| Provera posle izmena biblioteka | Rezultat |
| --- | --- |
| Backend TypeScript build | Prošlo |
| SSR maintenance refresh, pa običan zaključani Nuxt build | Prošlo |
| `test:build` | 19/19 |
| `test:dependencies`, stvarni multipart u root/Functions/SSR | 3/3 |
| `test:dependencies:firebase`, stvarni SSR Firestore SDK | 2/2 |
| `test:security`, pravila/privatnost/transakcije/Storage/SDK | 115/115 |
| `test:otp`, HTTP/transport/frontend/identitet/servis/održavanje | 74/74 |
| `test:startup` | 28/28 |
| `test:cost` | 3/3 |
| `test:e2e`, postojeći poslovni browser i HTTP tok | Prošlo |
| `test:otp:e2e`, HTTP i desktop/mobilni Edge | Prošlo, bez browser grešaka |
| `test:ssr` | 4 javne i 12 privatnih ruta, SEO i mobilni prikaz prošli |
| `test:startup:browser` | 4 scenarija × 3 ponavljanja, bez page grešaka |
| `git diff --check` | Prošlo |

Ukupno 244 imenovana Node testa, uz dodatne HTTP/browser scenarije. Testovi su proverili magic link, registraciju majstora, oporavak prekinutog slanja, fotografije, privatnost pre prihvatanja, žetone, prihvatanje/završavanje/ocenjivanje, paginaciju, odjavu između tabova i OTP oporavak bez dodatnog mejla. SSR integracija je proverila stvarne upise, čitanje, query i timestamp serijalizaciju, kao i dve paralelne transakcije bez izgubljenog uvećanja.

Header i dalje čeka potvrđenu prijavu/ulogu, a ne završetak notifikacija. U sintetičkom browser testu prikazan je 29.5–69.6 ms posle potvrde uloge; to nije obećanje iste latencije na svakom stvarnom uređaju. Navigacija tokom sporog pokretanja notifikacija očuvala je odabranu uslugu i jednu proveru uloge.

Prvi poslovni browser pokušaj stao je pre pokretanja browsera zbog starog Nuxt dev lock-a iz prethodnog prekida. PID je već pripadao Windows conhost procesu, a port 3333 je bio slobodan. Posle proverenog uklanjanja samo tog starog lock-a ponovljena cela provera je prošla. Testni serverski procesi ugašeni su; demo parametri i lokalne testne tajne uklonjeni su po završetku.

## Uticaj i sledeća celina

Ova promena ne dodaje aplikacijske Firestore upite/upise, slanje mejlova, cron poslove ili cloud resurse. Poslovne kvote, pagination, retention i resource limiti nisu menjani. Testovi koriste demo emulatore i lokalne HTTP servere; nisu slali AWS mejlove ni radili sa produkcijskim podacima. Izmena biblioteka ne predstavlja novu funkcionalnu Blaze potrošnju.

Lokalna celina održavanja je završena. Sledeća je priprema namenskog Google/Firebase serverskog identiteta, zatim AWS IAM uloge i Turnstile konfiguracije prema [OTP setup-u](otp-setup.md). Potrebna je zasebna odluka/odobrenje za cloud pripremu i kontrolisanu objavu. Stvarni IAM/STS, potpisivanje tokena, SES, Turnstile, IP granica i operativna upozorenja i dalje se proveravaju u toj celini; emulatori ih ne potvrđuju. Magic link ostaje podrazumevan do odobrene OTP objave.
