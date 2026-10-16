# Turnstile i OTP tajne — izveštaj tehničke pripreme

Dopuna 6. oktobra 2026: završena je odobrena kontrolisana cloud objava dve OTP funkcije. Svih 30 IP proba na šest javnih Google adresa prošlo je; dijagnostika je zatvorena i to je potvrđeno udaljenom konfiguracijom i HTTP proverama. Svih 17 prethodnih funkcija je nepromenjeno. Poslovni OTP, slanje i javni OTP ostaju isključeni, proxy parametar ostaje 0, a sajt nastavlja magic-link prijavu. [Završni izveštaj i sledeća celina](otp-ingress-deployment-report.md). Raniji zapisi ispod opisuju prethodne faze.

Dopuna 5. oktobra 2026: završena je lokalna priprema kratkotrajne owner dijagnostike i preciznog postupka objave samo dve OTP funkcije. [Izveštaj i sledeći korak](otp-ingress-preparation-report.md). Dijagnostički prozor i poslovni OTP su zatvoreni; deployment čeka posebno odobrenje. Raniji plan ispod ostaje istorijski kontekst.

5. oktobar 2026. Vlasnikov deo i operativna priprema tajni su završeni: dve pojedinačne tajne, scoped IAM i javna frontend konfiguracija su potvrđeni. Produkcijska objava, javno uključivanje OTP-a i Git commit/push nisu izvršeni.

## Potvrđeno stanje posle vlasnikovog koraka

- Secret Manager API u projektu `majstorsada-b2ad4` (`526260795061`) je uključen.
- Vlasnik je sačuvao Turnstile tajnu i izričito potvrdio da je dostavljena vrednost **Site key**, odnosno javni frontend ključ. Njena pripadnost stvarnom Cloudflare widget-u još nije proverena serverskim tokenom.
- `otp:secrets:apply` je generisao HMAC iz 32 nasumična bajta i sačuvao početnu verziju direktno u Secret Manager-u. CRC32C potvrda je uspešno vraćena. Nijedna postojeća tajna nije pročitana i vrednost HMAC-a nije upisana u fajl ili log.
- Obe tajne imaju tačno jednu verziju `1`, stanje `ENABLED`, globalnu Automatic replication i Google-managed encryption.
- `roles/secretmanager.secretAccessor` je dodat namenskom `otp-runtime` identitetu na tačno dve pojedinačne tajne. Postojeća IAM pravila su sačuvana; nije dodeljen pristup svim tajnama projekta.
- Naknadni read-only `otp:secrets:verify` potvrđuje `verified`, bez blokada i preostalih akcija. Sačuvani su zasebni početni apply zapis i naknadni verify zapis, samo sa metapodacima.
- Poređenje inventara tokom pripreme potvrdilo je da je svih 16 postojećih funkcija nepromenjeno. Nije izvršeno OTP slanje, STS razmena, Auth-account operacija ili deployment.
- Ignorisanim lokalnim fajlovima `.env` i `.env.production` dopisana su samo dva javna parametra: Site key i eksplicitni magic-link režim. Originalni bajtovi/podešavanja ostaju očuvani; proverene kopije su sačuvane u ignorisanom backup direktorijumu.
- Novi produkcijski Nuxt build je prošao. Generisana javna konfiguracija potvrđuje Site key i `authMode=magic-link`.
- Postojeća lokalna AWS konfiguracija ponovo je proverena: `OTP_ENABLED=false`, `OTP_PUBLIC_ENABLED=false`, proxy hops `0`, dnevni limit `500`. Privatne tajne i trajni AWS ključevi nisu u dotenv parametrima.

## Kod i operativni alati

`tools/prepare-otp-secrets.mjs` ima odvojene `--plan`, `--apply` i `--verify` režime. Poznate su samo dve globalne OTP tajne u tačno određenom projektu. Adapter ne dozvoljava čitanje njihovih vrednosti. Operacije create/addVersion dozvoljene su samo za HMAC koji operator generiše iz 32 kriptografski nasumična bajta u memoriji. Slanje koristi CRC32C i proveru potvrde checksum-a; vrednost se ne upisuje u fajl, log ili izveštaj.

Priprema zahteva jednu početnu omogućenu verziju `1`, podrazumevano Google šifrovanje i automatic replication. Zaustavlja se pri javnim IAM principals, neočekivanim runtime pravima, dodatnim verzijama ili nepotpunim preduslovima. Postojeća IAM pravila, uslovi i etag ostaju sačuvani. Konflikt etag-a dobija najviše tri pokušaja sa ponovnim čitanjem; nepoznat ishod mrežnog upisa se ne ponavlja automatski. HMAC se ne rotira pri ponovnom izvršavanju. Nasleđena/grupna prava i ispravna pripadnost sačuvanog provider ključa nisu dokazani metapodacima.

Slanje vezuje HMAC i Turnstile tajnu, a provera koda samo HMAC. Region, namenski identitet, instance, concurrency i zatvoreni gate-ovi ostaju isti. Oba endpointa koriste isti IAM identitet; različito vezivanje tajni smanjuje čitanja na verify cold start-u, a ne uvodi zasebnu IAM izolaciju.

Turnstile prikaz je promenjen u `compact`, centriran i bez `overflow-hidden`, jer flexible prikaz zahteva 300px i mogao bi da bude isečen u unutrašnjem prostoru kartice na telefonu. Action, cData i odloženo izvršavanje ostali su isti.

## Provere

| Oblast | Rezultat |
| --- | --- |
| Google/AWS pripremni alati i Secret Manager granice | 119/119 |
| OTP HTTP, transport, frontend i stvarni SDK manifest/wrapper | 41/41 |
| OTP identitet, transakcije, limiti, oporavak i održavanje na Firestore emulatoru | 36/36 |
| Stvarno kompajlirani Vue Turnstile setup sa lokalnim simulacijama | 18/18 |
| Postojeće poslovne transakcije, privatnost, Firestore/Storage pravila i SDK na emulatorima | 115/115 |
| SSR manifest, zaključane zavisnosti i zaštita objave | 19/19 |

Ukupno 348 uspešnih automatizovanih provera u ovoj celini. Functions build i produkcijski Nuxt build su prošli. Generisani SSR je potvrđen sa 106 tačno zaključanih direktnih zavisnosti i Node 24; instalacija je prijavila nula poznatih ranjivosti. Build sadrži upozorenja biblioteka o veličini chunk-a, raspodeli dinamičkih importa, deprecated paketima i blokiranim install skriptama; nema neuspeha build-a. `git diff --check` prolazi. Lokalni testovi ne dokazuju realni Cloudflare iframe, uparivanje ključeva, AWS federaciju niti produkcijsko IAM potpisivanje.

## Sledeći korak i trošak

Vlasnikov deo ove celine je završen; novo kreiranje tajni, verzija ili widget-a nije potrebno. Sledeći korak je lokalna priprema preciznog postupka kontrolisane cloud objave i stvarne owner provere, sa posebnim odobrenjem za deployment. Tek takva provera potvrđuje AWS federaciju/slanje, Firebase potpisivanje i uparivanje Cloudflare ključeva. Javna OTP prijava ostaje isključena do uspeha svih provera.

Za IP proveru postoji konkretan preduslov: trenutni endpoint sa isključenim OTP-om vraća 503 pre izbora IP-ja, pa taj odgovor ne dokazuje proxy lanac. Treba unapred pripremiti privremenu autentifikovanu dijagnostiku i način njenog uklanjanja. Frontend trenutno poziva `cloudfunctions.net` direktno; OTP Hosting/Cloudflare rewrite ne postoji i ne pretpostavlja se. U zatvorenom početnom deploy-u hops može ostati `0`, ali owner slanje čeka dokaz IP izvora. Generički `deploy-prod.ps1` objavljuje sve funkcije/pravila/hosting; za kontrolisani korak treba unapred odrediti tačne selektore i pregledati eventualne SSR/hosting izmene za owner preview.

Turnstile Free je dovoljan. Dve planirane aktivne verzije staju u Secret Manager kvotu od šest ako ostatak billing naloga ne zauzima preostali deo. Primer 100 novih prijava dnevno tokom 30 dana, sa po jednom hladnom instancom slanja i provere i bez ponovnog slanja, daje 9.000 čitanja tajni (2 + 1). To nije garantovana granica i ne uključuje ostale tajne ili ukupan Firebase/AWS račun. Detalji i zvanični izvori su u vlasnikovom uputstvu.
