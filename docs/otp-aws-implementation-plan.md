# Plan sledeće OTP celine: AWS IAM uloga i lokalna konfiguracija

Status 5. oktobra 2026: ova celina je završena prema [izveštaju](otp-aws-preparation-report.md), bez produkcijske objave. Tekst ispod čuva plan od 4. oktobra, pre vlasnikovog kreiranja uloge.

4. oktobar 2026. Plan je zasnovan na aktuelnom kodu, stvarnom Google identitetu i zvaničnim AWS izvorima. Ovaj dokument nije odobrenje za produkcijsku objavu. AWS uloga još nije pregledana ili kreirana u ovoj celini.

## Cilj i kompatibilnost

Namenski Google server treba da dobija privremene AWS dozvole i njima koristi postojeći SES domen. Transport već postoji u `functions/src/otpTransport.ts`; menjaju se provereni konfiguracioni podaci, ne klijentski ili poslovni tok.

Ponovljeni read-only `npm run otp:google:plan` pokazuje nula preostalih Google promena. Stvarni Google subject je `114954723264955273114`, audience `majstorsada-otp-ses`, AWS account `722769295504` i SES region `eu-central-1`.

Provereno prema AWS dokumentaciji:

- Google trust mapiranje: `accounts.google.com:aud` proverava JWT `azp`, `oaud` proverava JWT `aud`, a `sub` proverava `sub`. Pripremljeni trust JSON odgovara tim pravilima i postojećim runtime proverama.
- SESv2 SendEmail koristi IAM akciju `ses:SendEmail` i podržava naš SES identity ARN i uslove `ses:FromAddress`/`ses:FeedbackAddress`. Kod šalje tačno noreply i aleksa vrednosti iz politike.
- Role i SES domen su u istom AWS nalogu; dodatni sending-authorization IdentityArn parametri nisu potrebni.
- STS poziv ne zahteva trajni AWS access key; postojeći kod traži 900 sekundi, kešira privremene dozvole i deli jedno osvežavanje među paralelnim pozivima instance.
- IAM role maximum session duration ostaje podrazumevano jedan sat; aplikacija traži 15 minuta. Ne predstavljati 15 minuta kao IAM maksimalno trajanje.

## Redosled i podela posla

### 1. Vlasnik: kreiranje uloge

U već postojećem AWS nalogu otvoriti IAM → Roles → Create role → Custom trust policy. Upotrebiti ceo `ops/otp-aws-trust.json`, bez zamene brojeva. Ne birati dodatne managed policies. Naziv uloge: `MajstorSadaOtpSender`.

Zatim na kreiranoj ulozi Permissions → Add permissions → Create inline policy → JSON: ceo `ops/otp-aws-send.json`. Naziv politike: `MajstorSadaOtpSesSend`. Ne dodavati permissions boundary ili druge politike novoj ulozi. Ako istoimena uloga već postoji, prvo pregledati stanje; ne prepisivati postojeću ulogu bez procene.

Detaljni klikovi su u `docs/otp-aws-role-setup.md`. Nema ponovnog podešavanja SES domena, Zoho prijema, DNS-a, AWS plana, SMTP-a ili privatnih ključeva.

### 2. Vlasnik i tehnički operator: provera stvarnog AWS stanja

Vlasnik dostavlja stvarni Role ARN i kopiju javnog JSON-a sa kartica Trust relationships i Permissions, zajedno sa prikazom liste policy-ja. Alternativno, pregled se obavlja kroz već prijavljenu AWS konzolu. To nisu tajne; AWS pristupni ključevi i lozinke nisu potrebni.

Operator proverava:

1. Tačan nalog i stvarni ARN uloge, uključujući eventualnu putanju.
2. Trust policy sa tačnim Google subject-om, audience-om i jedinom potrebnom STS akcijom, bez drugih trusted principals.
3. Nula dodatnih attached managed policies i jedinu inline politiku `MajstorSadaOtpSesSend`.
4. Inline policy odgovara jedinoj potrebnoj SES akciji, tačnom domain identity ARN-u, regionu i obe adrese; nema wildcard-a ili dodatnih grants.
5. Podrazumevano maksimalno trajanje sesije i odsustvo neočekivane permissions boundary.

Sam ARN ne dokazuje prava. AWS policy validation i, uz dostupnu konzolnu proveru, IAM simulator proveravaju sintaksu/dozvole: tačan zahtev dozvoljen; drugi ili izostavljeni pošiljalac/feedback, drugi region/domen i druge akcije odbijeni. Ne kreirati plaćeni analyzer ili nove administratorske dozvole OTP ulozi radi ove provere. Na neuspeh neposredno nakon IAM promene prvo proveriti propagaciju, ne širiti prava.

### 3. Tehnički operator: lokalno vezivanje za transport

Posle odobrenja i potvrde stvarne uloge dopuniti postojeći `functions/.env.majstorsada-b2ad4` sledećim netajnim parametrima:

- `OTP_AWS_ROLE_ARN`: stvarni provereni ARN.
- `OTP_GOOGLE_SUBJECT=114954723264955273114`.
- `OTP_AWS_AUDIENCE=majstorsada-otp-ses`.
- Potvrditi namenski `OTP_RUNTIME_SERVICE_ACCOUNT` iz Google faze.

Pre izmene sačuvati lokalni povratni primerak; očuvati sve postojeće poslovne parametre, uključujući `PUBLIC_WRITES_ENABLED`, `JOB_IMAGES_BUCKET` i `JOB_MAINTENANCE_ENABLED`. Ne prepisivati ceo dotenv fajl i ne duplirati parametre. Ne unositi HMAC/Turnstile tajne u dotenv ili Git.

Eksplicitno zadržati zatvoren OTP: `OTP_ENABLED=false`, `OTP_PUBLIC_ENABLED=false`, `OTP_TRUSTED_PROXY_HOPS=0`. Frontend magic link ostaje. Nula nije proizvoljno promenjena da bi test prošao; stvarna IP granica se potvrđuje tek kasnije.

### 4. Tehnički operator: lokalne provere i izveštaj

Proveriti da uneti ARN/subject/audience odgovaraju očekivanom AWS nalogu i pripremljenim politikama, da nema dodatnih dozvola i da su postojeći parametri očuvani. Potrebne validacione provere pokrivaju i pogrešan nalog/identitet, dodatnu politiku/akciju, wildcard i odsustvo obaveznih uslova.

Ponovo pokrenuti relevantne policy/transport testove i Functions build; proveriti zatvorene gate-ove i odsustvo tajni u javnoj konfiguraciji. Ako se aplikacijski kod zbog nekog nalaza zaista menja, dodati odgovarajuće OTP/bezbednosne regresione testove. Ova celina ne pokreće realna SES slanja.

## Kada je celina završena

Stvarna AWS uloga i sve njene direktne politike pregledane su, ARN je vezan za lokalni postojeći transport, relevantne provere prolaze i postojeća konfiguracija ostaje očuvana. Nema deploy-a, promene live prijave ili Git pusha.

To ne predstavlja dokaz stvarnog Google → AWS STS rada: simulator ne proverava naš metadata JWT i kompletno preuzimanje uloge. Stvarni STS, osvežavanje dozvola, Firebase signing i SES proveravaju se iz namenskog Google runtime-a u kasnijoj, posebno odobrenoj kontrolisanoj objavi. Nema novih impersonation grants ili testnih privatnih ključeva radi preskakanja tog koraka.

## Trošak i naredne celine

IAM nema dodatnu naknadu za samu ulogu. Ova priprema ne šalje mejlove, ne deploy-uje nove Firebase funkcije i ne uvodi nova poslovna Firestore čitanja/upise ili background izvršavanje. Ne zahteva promenu AWS Free plana.

Dnevni limit 500 već je implementiran i testiran lokalno, a postaje operativan nakon OTP objave. Sprovodi ga aplikacijski serverski budžet; IAM određuje identitet i dozvoljeno SES slanje, ne broj poruka ili sadržaj ograničen samo na OTP. Ručno ili drugo slanje iz AWS naloga nije obuhvaćeno aplikacijskim limitom.

Posle ove celine slede odvojeno Turnstile, dve Secret Manager tajne i njihov uski pristup, zatvoreni rollout parametri/monitoring, pa odobrena kontrolisana objava i potvrda IP granice pre owner OTP testa. Javni OTP uključuje se posle uspešnog testa i posebnog odobrenja.

## Primarni izvori

- [AWS custom trust role creation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-custom.html)
- [AWS GCP workload federation](https://aws.amazon.com/blogs/security/access-aws-using-a-google-cloud-platform-native-workload-identity/)
- [AWS Google claim mapping](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html)
- [SESv2 actions/resources/conditions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html)
- [SESv2 SendEmail](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html)
- [STS AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)
- [IAM policy simulator limits](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html)
- [IAM policy validation](https://docs.aws.amazon.com/access-analyzer/latest/APIReference/API_ValidatePolicy.html)
- [IAM pricing FAQ](https://aws.amazon.com/iam/faqs/)