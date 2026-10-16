# AWS OTP priprema — završena 5. oktobra 2026.

AWS uloga koju je vlasnik kreirao odgovara pripremljenim politikama i postojećem SES transportu. Stvarni ARN je povezan sa lokalnom Functions konfiguracijom, uz zatvoren OTP. Ova celina nije produkcijska objava i nije potvrdila stvarnu STS razmenu ili SES slanje kroz aplikaciju.

## Pregled stvarne uloge

Dokaz su tri dostavljene slike AWS konzole: pregled uloge sa listom svih direktnih permissions policies, ceo Trust relationships JSON i ceo JSON jedine inline politike. Poslednje dve slike pregledane su nezavisno i upoređene sa fajlovima `ops/otp-aws-trust.json` i `ops/otp-aws-send.json`. Redosled JSON ključeva nema uticaja na rezultat.

- ARN: `arn:aws:iam::722769295504:role/MajstorSadaOtpSender`.
- Trust: samo `accounts.google.com`, samo `sts:AssumeRoleWithWebIdentity`; Google `sub` i `azp` ograničeni na `114954723264955273114`, JWT audience na `majstorsada-otp-ses`.
- Jedina inline politika: `MajstorSadaOtpSesSend`. Nema dodatnih attached managed policies u dostavljenom kompletnom spisku.
- Jedina SES akcija: `ses:SendEmail`, za `arn:aws:ses:eu-central-1:722769295504:identity/majstorsada.rs`.
- Obavezni uslovi: Frankfurt, `noreply@majstorsada.rs` pošiljalac i `aleksa@majstorsada.rs` feedback adresa. Transport šalje upravo te vrednosti.
- Permissions boundary nije postavljena. Maksimalna sesija uloge je jedan sat; kod traži dozvole na 900 sekundi, odnosno 15 minuta.

Ovo je pregled dokaza iz konzole, **bez AWS API readback-a ili pokretanja IAM simulatora**. Lokalni validacioni testovi proveravaju da pregledani JSON ne odstupa od dogovorenih ograničenja; nisu AWS autorizer. Stvarna Google → AWS STS razmena ostaje za kasniju kontrolisanu objavu.

## Lokalna konfiguracija i očuvanje aplikacije

U postojeći `functions/.env.majstorsada-b2ad4` dodato je osam netajnih parametara:

| Parametar | Vrednost |
| --- | --- |
| OTP_AWS_ROLE_ARN | arn:aws:iam::722769295504:role/MajstorSadaOtpSender |
| OTP_GOOGLE_SUBJECT | 114954723264955273114 |
| OTP_AWS_AUDIENCE | majstorsada-otp-ses |
| OTP_RUNTIME_SERVICE_ACCOUNT | otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com |
| OTP_ENABLED | false |
| OTP_PUBLIC_ENABLED | false |
| OTP_TRUSTED_PROXY_HOPS | 0 |
| OTP_DAILY_LIMIT | 500 |

Dnevni limit je eksplicitno upisan sa istom vrednošću koju runtime već podrazumeva. Proxy nula ostaje namerna prepreka uključivanju dok stvarna platforma nije proverena. `OTP_SEND_ENABLED` i prazna test allowlist koriste postojeće runtime podrazumevane vrednosti; zatvoren glavni gate sprečava slanje i proveru.

Pre dopune je sačuvana i proverena rezervna kopija u Git-ignorisanom `.firebase/otp-aws/backups/` direktorijumu. Originalni dotenv sadržaj je očuvan bajt po bajt kao početak dopunjenog fajla, uključujući `PUBLIC_WRITES_ENABLED`, `JOB_IMAGES_BUCKET` i `JOB_MAINTENANCE_ENABLED`. Nije menjana nijedna postojeća vrednost. Posle upisa provereni su ceo očekivani rezultat, svih osam parametara i ponovljivost bez novih dopuna.

Netajni zapis pregleda slika i lokalni rezultat čuvaju se u `.firebase/otp-aws/owner-console-evidence.json` i `.firebase/otp-aws/local-configuration-verification.json`. Dokazi, backup i dotenv su ignorisani za Git. HMAC/Turnstile tajne nisu upisane u dotenv; AWS trajni access key nije potreban.

Novi `tools/otp-aws-config.mjs` proverava tačan pregledani ARN, kompletan spisak politika, trust i SES ograničenja. Dopuna odbija konflikt ili duplikat umesto prepisivanja. Koristi parser i pravila naziva parametara iz već zaključanog Firebase CLI-ja; greške nikada ne prikazuju sirove dotenv redove ili vrednosti. Višeredne vrednosti zahtevaju zaseban pregled i ne mogu da podmetnu lažno OTP podešavanje. Helper služi lokalnoj pripremi, nije deo izvršavanja aplikacije i nije alat za promenu budućih rollout gate-ova.

## Provere u ovoj celini

| Provera | Rezultat |
| --- | --- |
| `npm run otp:google:plan` | 0 preostalih cloud promena |
| `npm run otp:google:verify` | Stvarni subject potvrđen, 0 user-managed ključeva, 16 postojećih funkcija nepromenjeno |
| `npm run test:otp:cloud` | 76/76 |
| Od toga nova AWS/config validacija | 29/29, uračunato u 76 |
| `npm --prefix functions run build` | Prošlo |
| `node --test tests/otp/transport.test.mjs` | 8/8 |
| Provera lokalnog upisa, očuvanja originala i ponovljivosti | Prošlo |
| `git diff --check` i whitespace provera novih fajlova | Prošlo |

Ukupno **84 različita imenovana testa**. Negativni slučajevi obuhvataju drugi nalog/identitet/audience, šire ili dodatne politike/akcije, wildcard ili drugi SES domen/region, nedostajuće From/Feedback uslove, nepotpun inventory, uključene gate-ove, konflikt budžeta/proxy-ja, duplikate i nevažeći dotenv. Transport testovi obuhvataju scoped privremene dozvole, zajedničko osvežavanje, fiksne SES adrese i odsustvo automatskog ponavljanja nejasnog slanja.

Firestore/Auth emulatori, browser tok i ceo poslovni regresioni paket nisu ponavljani u ovoj celini: aplikacijski izvori, pravila, frontend i poslovni tok nisu menjani. Njihovi raniji rezultati ostaju navedeni u prethodnim izveštajima i nisu uračunati u današnji zbir.

## Uticaj, trošak i nastavak

Nema deploy-a, slanja mejla, promene live prijave, izmene Google IAM dozvola ili Git commit-a/pusha u ovoj celini. Google potvrda koristila je read-only API pozive. Lokalni helper/testovi ne uvode nova izvršavanja, Firebase čitanja/upise ili potrošnju email kvote u aplikaciji. Aplikacijski limit 500 pokušaja postaje operativan tek nakon objave OTP-a; nije limit svih AWS/Firebase troškova ili ručnog AWS slanja.

Sledeća odvojena celina je Cloudflare Turnstile widget i dve Secret Manager tajne (`OTP_TURNSTILE_SECRET`, `OTP_HMAC_SECRET`) sa pristupom runtime-a samo tim pojedinačnim resursima. Javna vrednost widget-a ide u javnu Nuxt konfiguraciju; secret ne ide u chat ili Git. Potom slede monitoring, priprema zatvorene objave i posebno odobrena cloud provera STS-a, potpisivanja tokena, Turnstile-a, IP granice i sopstvenog OTP mejla. Javni OTP se uključuje tek nakon uspešne provere i odobrenja.