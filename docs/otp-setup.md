# Podešavanje OTP-a pre produkcijske objave

<!-- otp-magic-retirement:current -->
## Aktuelno produkcijsko stanje

Klijentski interfejs koristi samo OTP na `/login`. `NUXT_PUBLIC_AUTH_MODE` i `otpPreview` više ne upravljaju prijavom; ne dodavati ih u konfiguraciju. `NUXT_PUBLIC_TURNSTILE_SITE_KEY` ostaje jedina javna Turnstile vrednost; privatni Secret key ostaje serverska tajna. Stare email-link adrese vode na sanitizovanu OTP prijavu i ne troše Firebase kod. Izdavanje/prijava email linkom su isključeni, dok prijava majstora/admina lozinkom ostaje uključena.

| Parametar | Aktuelna vrednost |
| --- | --- |
| `OTP_ENABLED` | `true` |
| `OTP_SEND_ENABLED` | `true` |
| `OTP_PUBLIC_ENABLED` | `true` |
| `OTP_TEST_EMAILS` | Prazno; javni režim je uključen |
| `OTP_TRUSTED_PROXY_HOPS` | `1`, potvrđen produkcijskim probama |
| `OTP_DAILY_LIMIT` | `500` kroz aplikaciju, u klizna 24 sata |
| `OTP_DIAGNOSTICS_WINDOW_START` | Prazno; dijagnostika je zatvorena |

Ostaju tri rezervisana pokušaja slanja po adresi u klizna 24 sata, 60 sekundi između novih slanja, 10 minuta važenja koda i pet pogrešnih unosa. Aplikacijski limit ne ograničava ručno SES slanje ili ostale Firebase/AWS troškove. Nema automatskog magic-link fallback-a.

[Izveštaj završenog uklanjanja magic-link toka](otp-magic-link-retirement-report.md) sadrži provere, granice i postupak kontrolisanog oporavka. Prethodne closed/owner pripremne komande, frontend zastavice i početno zatvoreni parametri ispod su **istorijski recepti, a ne aktuelna produkcijska ili rollback uputstva**. Ne ponavljati ih nad sadašnjim javnim OTP-om. Sačuvani su da istorija implementacije ostane proverljiva.
Dopuna 16. oktobra 2026: produkcijski su objavljeni optimizacija učitavanja OTP toka i oporavak posle poznate greške čuvanja Firebase sesije. Uobičajeni login nema nove serverske pozive; ručni oporavak ponavlja Firebase prijavu bez novog mejla ili serverske OTP provere. Limiti i uloge ostaju isti. Videti [izveštaj optimizacije](otp-performance-deployment-report.md) i [poslednju kontrolisanu objavu oporavka](otp-browser-storage-deployment-report.md).
<!-- /otp-magic-retirement:current -->

Dopuna 10. oktobra 2026, posle javne objave: OTP je sada redovna prijava na `/login` za sve klijentske adrese. Limiti i postojeći UID-ovi su očuvani, a završavanje već izdatih magic linkova ostaje dostupno. [Aktuelni produkcijski izveštaj i proba](otp-public-deployment-report.md). Raniji zapisi ispod opisuju prethodne celine.

Dopuna 10. oktobra 2026, posle vlasnikove probe: dve stvarne OTP prijave su uspešne. Udaljeni receipt-i potvrđuju isti Auth/klijentski UID, oba SES accepted slanja i završen token/profil tok; pregled nije potrošio dodatne pokušaje. Javni/default OTP ostaje sledeća odvojeno odobrena celina. [Aktuelna provera i sledeći korak](otp-owner-live-validation-report.md). Raniji zapisi ispod čuvaju redosled prethodnih celina.

Dopuna 10. oktobra 2026: odobrena produkcijska OTP proba je objavljena i operaterski proverena. Slanje i provera dostupni su samo za aleksa@majstorsada.rs; javni OTP ostaje zatvoren, a obična prijava koristi magic link. Prva stvarna Turnstile → AWS → Firebase prijava sada čeka vlasnikovu probu. [Aktuelni rezultat i uputstvo](otp-owner-deployment-report.md). Raniji zapisi ispod predstavljaju istoriju prethodnih celina.

Dopuna 7. oktobra 2026: lokalna priprema ograničene OTP probe za jednu vlasnikovu adresu je završena. Pripremljeni su indeksni preflight, kandidat sa tačno četiri promene parametara, zaštita postojećeg održavanja i usklađen SSR/Hosting backup. Produkcijski OTP i slanje ostaju zatvoreni; realna Turnstile → AWS → Firebase prijava tek treba da se proveri nakon zasebno odobrene objave. [Aktuelni izveštaj i tačan sledeći korak](otp-owner-preparation-report.md). Stariji zapisi ispod čuvaju stanje ranijih celina.

Dopuna 6. oktobra 2026: završena je odobrena kontrolisana cloud objava dve OTP funkcije. Svih 30 IP proba na šest javnih Google adresa prošlo je; dijagnostika je zatvorena i to je potvrđeno udaljenom konfiguracijom i HTTP proverama. Svih 17 prethodnih funkcija je nepromenjeno. Poslovni OTP, slanje i javni OTP ostaju isključeni, proxy parametar ostaje 0, a sajt nastavlja magic-link prijavu. [Završni izveštaj i sledeća celina](otp-ingress-deployment-report.md). Raniji zapisi ispod opisuju prethodne faze.

Dopuna 5. oktobra 2026: završena je lokalna priprema kratkotrajne owner dijagnostike i preciznog postupka objave samo dve OTP funkcije. [Izveštaj i sledeći korak](otp-ingress-preparation-report.md). Dijagnostički prozor i poslovni OTP su zatvoreni; deployment čeka posebno odobrenje. Raniji plan ispod ostaje istorijski kontekst.

AWS priprema je završena 5. oktobra 2026: pregledane su sve direktne politike sa dostavljenih slika i stvarni ARN je vezan za lokalnu konfiguraciju uz zatvoren OTP. [AWS izveštaj](otp-aws-preparation-report.md). Secret Manager API je uključen 5. oktobra; pripremljeni su ograničeni alati za dve tajne. Vlasnik je sačuvao Turnstile secret i potvrdio da je dostavljeni frontend ključ javni Site key. HMAC je generisan direktno u Secret Manager-u; obe tajne imaju jednu omogućenu verziju i scoped pristup za OTP runtime. `otp:secrets:verify` ima nula preostalih akcija. Site key je sačuvan u lokalnim frontend dotenv fajlovima, sa eksplicitnim magic-link režimom. Slede priprema i posebno odobrena kontrolisana cloud objava/provera; stvarno uparivanje ključeva i produkcijski IP izvor još nisu potvrđeni. [Izveštaj pripreme](otp-turnstile-preparation-report.md). Produkcijska objava još nije odobrena.

Ovo je uputstvo za pripremu. Pisanje lokalnog koda ne kreira AWS/GCP resurse, ne menja AWS Free plan i ne uključuje OTP na sajtu. Google IAM priprema je odobrena i završena 4. oktobra 2026; [rezultat](otp-google-preparation-report.md). Realno slanje i produkcijska objava i dalje zahtevaju zasebno odobrenje. Lokalni emulatori ne potvrđuju IAM, STS, Turnstile, reputaciju pošiljaoca ili račun.

## Šta već postoji

SES domen majstorsada.rs je potvrđen u Frankfurtu (eu-central-1), Easy DKIM radi, produkcijski pristup je odobren i vlasnik je potvrdio prijem testnog mejla van spama. Pošiljalac je noreply@majstorsada.rs, tehnički feedback aleksa@majstorsada.rs čiji prijem je vlasnik takođe potvrdio. Zoho ostaje prijemni servis. Nema povezivanja Zoho/AWS naloga, Zoho lozinke u kodu ili promene postojećih MX/SPF/Firebase DNS zapisa zbog ovog toka.

## 1. Google identitet — završeno 4. oktobra 2026

Namenski runtime service account: `otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com`. Ne praviti JSON privatni ključ. Oba nova OTP endpointa lokalno su podešena za taj identitet; još nisu objavljena. Stare funkcije zadržavaju postojeći identitet.

Potrebne dozvole:

- `roles/datastore.user` u projektu za transakcije/evidenciju OTP-a i postojeći klijentski profil. Admin SDK zaobilazi Firestore rules; zato identitet ima samo potrebne projektne uloge. Firestore IAM nije ograničenje pojedinačne kolekcije.
- Namenska projektna Auth uloga prema `ops/otp-google-auth-role.template.json`: samo `firebaseauth.users.get` i `firebaseauth.users.create`. OTP ne dobija dozvolu da briše naloge ili menja postojeće lozinke.
- Namenska `projects/majstorsada-b2ad4/roles/majstorsadaOtpSigner` prema `ops/otp-google-signer-role.template.json`, sa samo `iam.serviceAccounts.signBlob`, dodeljena na **sopstvenom** service-account resursu. Šira TokenCreator uloga nije potrebna. IAM Credentials API je uključen. `signBlob` može da potpisuje proizvoljne bajtove; IAM ne ograničava sadržaj samo na Firebase tokene.
- U narednoj celini: `roles/secretmanager.secretAccessor` samo na dva pojedinačna secret-a: `OTP_HMAC_SECRET` i `OTP_TURNSTILE_SECRET`. Ne davati pristup svim tajnama projekta.
- Deploy identitet ima `iam.serviceAccounts.actAs` za namenski runtime; to nije dozvola krajnjem korisniku aplikacije.

Stvarni Google `uniqueId` je `114954723264955273114`. Njime je popunjena `ops/otp-aws-trust.json`; SES politika `ops/otp-aws-send.json` sadrži potvrđeni AWS account ID `722769295504`. Ponovna provera pre objave: `npm run otp:google:plan` i `npm run otp:google:verify`; oba imaju nula cloud izmena. Ovi alati su namenjeni fazi pre prvog OTP deploy-a. Alternativna read-only komanda, ako je gcloud instaliran:

```powershell
gcloud iam service-accounts describe otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com --project=majstorsada-b2ad4 --format='value(uniqueId)'
```

To je identifikator, nije privatni ključ. Sačuvati ga u `OTP_GOOGLE_SUBJECT` i u dva mesta AWS trust template-a. Potvrditi dostupnost dozvola i realno custom-token potpisivanje pri kontrolisanoj cloud proveri; uspeh Auth emulatora nije dokaz potpisivanja u produkciji.

## 2. AWS IAM uloga — završeno 5. oktobra 2026

Uloga već postoji i pregledana je; sledeći opis ostaje referenca, nije nalog za ponovno kreiranje. U AWS pretrazi otvoriti **IAM → Roles → Create role → Custom trust policy**. Zalepiti ceo `ops/otp-aws-trust.json`; stvarni identifikator je već unet, nema ručne zamene. Detaljan redosled je u [uputstvu za AWS ulogu](otp-aws-role-setup.md). Audience ostaje `majstorsada-otp-ses`.

Google service-account JWT ima `azp` i `sub` vezane za brojčani identitet; AWS `accounts.google.com:aud` odgovara `azp`, a `accounts.google.com:oaud` odgovara stvarnom audience. Ne zameniti mesta tih vrednosti, ne staviti wildcard i ne dati pristup svim Google nalozima. Poseban OIDC provider za Google nije potreban.

Ulozi dati ime, na primer `MajstorSadaOtpSender`. Kreirati jednu inline permissions policy prema `ops/otp-aws-send.json`. AWS nalog `722769295504` već je unet iz ranije potvrđenog SES identity ARN-a; pre kreiranja proveriti da je upravo taj nalog otvoren. Policy dozvoljava samo `ses:SendEmail` za postojeći Frankfurt domen, noreply pošiljaoca i aleksa feedback. Bez `AmazonSESFullAccess`, `AdministratorAccess`, SMTP korisnika ili trajnog access key-a.

Kopirati **Role ARN** u `OTP_AWS_ROLE_ARN`. ARN nije tajna. Runtime dobija Google ID token preko metadata servera i razmenjuje ga za AWS STS dozvole koje traju 15 minuta. Dozvole se keširaju u instanci i osvežavaju dva minuta pre isteka, uz jedno zajedničko osvežavanje paralelnih zahteva. SES SDK ponavljanje je isključeno; izgubljeni odgovor nije razlog da se mejl automatski ponovo pošalje.

IAM policy nije limit 500 dnevno. Taj limit sprovodi zajednički serverski budžet aplikacije. Drugi program ili ručno konzolno slanje nisu obuhvaćeni.

## 3. Cloudflare Turnstile i serverske tajne — vlasnik i tehnički operator

Pratiti [uputstvo sa tačnim koracima za vlasnika](otp-turnstile-owner-setup.md): vlasnik kreira jedan **Managed** widget za `majstorsada.rs` i `www.majstorsada.rs`, bez pre-clearance, i kopira privatni Secret key direktno u globalni `OTP_TURNSTILE_SECRET` sa Automatic replication. **Site key** je javna vrednost i dostavlja se operatoru za Nuxt konfiguraciju. Secret key se ne šalje u chat ili Git. Vlasnik ne kreira HMAC i ne podešava IAM.

Posle potvrde vlasnika operator pokreće `npm run otp:secrets:plan`, pa tek kada su preduslovi potvrđeni `npm run otp:secrets:apply` i `npm run otp:secrets:verify`. Alat čita samo metapodatke; ne pristupa vrednosti postojeće tajne. Ako HMAC ne postoji, generiše 32 kriptografski nasumična bajta i čuva jednu početnu verziju direktno u Secret Manager-u. Dodaje pristup namenskom runtime-u isključivo na dve pojedinačne tajne, uz očuvanje IAM etag-a i prava drugih identiteta. Dodatne verzije, javni principals, neočekivane dozvole ili nepoznat ishod upisa zaustavljaju pripremu radi pregleda. Testne vrednosti se ne prenose u produkciju; HMAC se ne rotira automatski.

Slanje dobija HMAC i Turnstile tajnu; provera koda samo HMAC. IAM runtime identiteta obuhvata obe tajne, jer oba endpointa koriste isti identitet. Različito vezivanje smanjuje čitanja pri pokretanju verify instance; nije zasebna IAM izolacija endpointa. Nijedna komanda ne objavljuje funkcije niti uključuje OTP.

Widget koristi action `client_otp` i cData vezan za trenutni request ID. Server proverava success, hostname, action i cData. Token važi najviše pet minuta i koristi se jednom. Pri timeout-u/prekinutom slanju UI dobija nov Turnstile token, a retry istog OTP zahteva zadržava request ID/sesijsku tajnu. Ni neuspeh bot servisa ni skriven widget ne otvaraju nezaštićeno slanje.

## 4. Produkcijski parametri — početno zatvoreno

- `OTP_ENABLED=false`: oba nova endpointa zatvorena.
- `OTP_SEND_ENABLED=true`: ima dejstvo tek uz uključen OTP; postaviti false za zaustavljanje novih slanja uz nastavak provere već poslatih kodova. Za bezbednosni incident OTP_ENABLED=false zatvara i proveru.
- `OTP_PUBLIC_ENABLED=false`: nema javnog slanja.
- `OTP_TEST_EMAILS`: samo adrese vlasnika/odobrenih testera; prazna lista odbija svaku adresu dok javni režim nije uključen. Verify ponovo proverava allowlist iz serverskog challenge-a.
- `OTP_RUNTIME_SERVICE_ACCOUNT`: namenski Google email iz prvog koraka.
- `OTP_AWS_ROLE_ARN`: tačan ARN upravo napravljene uloge.
- `OTP_AWS_AUDIENCE=majstorsada-otp-ses`.
- `OTP_GOOGLE_SUBJECT`: brojčani Google identitet.
- `OTP_DAILY_LIMIT=500`: može se privremeno smanjiti za owner test (1–500), bez podizanja iznad dogovorenih 500.
- `OTP_TRUSTED_PROXY_HOPS=0` dok platforma nije proverena; nula namerno odbija rad umesto prihvatanja spoofovanog IP-ja.

Frontend `NUXT_PUBLIC_AUTH_MODE=magic-link` ostaje podrazumevan dok kontrolisana objava ne potvrdi backend. `NUXT_PUBLIC_TURNSTILE_SITE_KEY` sadrži samo javni site key. Owner preview `?otpPreview=1` prikazuje OTP ekran, ali ne zaobilazi serverski gate/allowlist. Posle potvrde i posebnog odobrenja `NUXT_PUBLIC_AUTH_MODE=otp` nudi OTP klijentima. UI flag nije serverska dozvola. Nema automatskog magic-link fallback-a koji zaobilazi OTP dnevne kvote.

## 5. Potvrda IP granice pre uključivanja

Javni Google endpoint ne sme verovati `CF-Connecting-IP`, proizvoljnom prvom `X-Forwarded-For` ili slepo Express `req.ip`. Lokalni HTTP testovi potvrđuju da početak zaglavlja ne menja izabrani IP, ali **ne dokazuju stvarnu produkcijsku topologiju**.

Trenutni endpoint pri `OTP_ENABLED=false` vraća 503 pre izbora IP-ja; taj odgovor dokazuje zatvoren gate, ne poreklo adrese. Za owner uključivanje već je pripremljena privremena autentifikovana dijagnostika na istoj Google ulaznoj putanji, bez OTP/SES/poslovnih upisa i sa konkretnim postupkom uklanjanja. Frontend trenutno zove `cloudfunctions.net` direktno; nema OTP Hosting rewrite-a. Ne pretpostavljati Cloudflare kao proxy za ove zahteve.

Kod bira adresu sa desne strane `X-Forwarded-For` prema eksplicitnom `OTP_TRUSTED_PROXY_HOPS`. Google External Application Load Balancer dokumentuje dodatak `<client-ip>,<load-balancer-ip>`; za taj tačno potvrđen lanac broj je 2. Cloud Functions dokumentacija ne daje univerzalnu garanciju identičnog lanca za svaki direct/hosting/Cloudflare URL. Ne pretpostavljati automatski da su 1 ili 2 ispravni.

Pre javnog uključivanja, operator mora uporediti platformsku putanju i zaglavlja za odobreni browser endpoint i direktni Google URL, sa/bez namerno dodatog lažnog XFF/CF zaglavlja. Provera ide pod zatvorenim slanjem/owner rollout-om, bez slanja korisnicima i bez trajnog logovanja IP-ja/sadržaja. Postaviti broj samo kada je potvrđeno koja adresa potiče iz pouzdanog Google dodatka i ostaje ista pri spoofovanju prefiksa. Ako nije moguće dokazati lanac, ostaviti gate zatvoren i rešiti granicu drugim potvrđenim platformskim signalom. Ne upisivati proizvoljan broj radi prolaska testa.

Ako Cloudflare ili Firebase Hosting prosleđuje zahtev kao proxy, platforma može videti proxy IP umesto pojedinačnog korisnika. Trajna IP kočnica je pomoćna zaštita od naleta; email i globalna kvota ostaju nezavisne. Zajednički IP ne služi kao dnevni identitet korisnika.

## 6. Kontrolisana realna provera posle odobrene objave

Backend se prvo objavljuje sa zatvorenim gate-om i ispravnim runtime identitetom/tajnama. Owner/test režim uključuje se tek posle read-only potvrde parametara, IAM i dokazanog IP izvora.

Proveriti: STS razmenu i osvežavanje dozvola; stvarno IAM potpisivanje custom tokena; Turnstile hostname/action/cData; jedan sopstveni email OTP; isti postojeći UID i klijentski profil pre tokena; mobilni browser i poslovni tok. Za simulator koristiti `success@simulator.amazonses.com`, `bounce@simulator.amazonses.com` i `complaint@simulator.amazonses.com` kroz odobrenu ograničenu tehničku proveru transporta (bez kreiranja aplikacijskih naloga za simulator). Potvrditi da bounce/complaint poruke dolaze na aleksa adresu.

Simulator mejlovi se naplaćuju kao slanje, ali ne narušavaju SES reputaciju i ne troše SES dnevnu kvotu. Ne slati 500 realnih mejlova radi testa aplikacijskog limita; taj test se izvršava na emulatoru sa lažnim transportom.

Suppression za bounce/complaint i email feedback forwarding ostaju uključeni. SES prihvatanje sa MessageId nije dokaz da je mejl stigao u inbox. Praćena tehnička pošta je početni operativni postupak; suppression ne obuhvata svaku moguću prijavu spama svih provajdera. Za veći obim kasnije proceniti automatizovan feedback tok.

Tek nakon uspeha owner provere i posebnog odobrenja uključiti javni OTP. Rollback postavlja OTP_SEND_ENABLED=false i vraća prethodni UI, bez brisanja naloga/sesija/poslova. Verify već poslatih kodova može privremeno ostati otvoren samo ako je bezbedno; kod incidenta zatvaraju se oba endpointa.

## Trošak i granice

Essentials je $0,16/1.000 primalaca bez fiksne mesečne pretplate tog plana: 100 slanja/dan × 30 ≈ $0,48; 500 × 30 ≈ $2,40 osnovnog SES slanja. To ne uključuje Firebase, podatke ili druge AWS dodatke. Ovo uputstvo ne menja Free nalog u Paid. Krediti i besplatne kvote imaju zasebne rokove i uslove.

500 važi za konzervativno rezervisane aplikacijske pokušaje u kliznom prozoru, uz dodatnu sigurnosnu marginu vremena dispatch-a. Ne pretpostavljati 500 uspešnih dostava ili tvrdu granicu svih cloud troškova. HTTP napad/odbijeni upiti i transakcijski retry imaju svoj trošak; bot/IP/burst kontrole smanjuju rizik, nisu garancija nultog računa. Pragovi 400/450/500 trenutno stvaraju strukturirane log signale, ne automatsku poruku vlasniku. Pre javnog uključivanja treba podesiti i proveriti Cloud Monitoring upozorenje na te logove ili ekvivalentan operativni postupak, kao i AWS billing upozorenje. Bezbedan off gate zaustavlja nove zahteve, dok ograničeno čišćenje starih OTP dokumenata nastavlja da radi u postojećem održavanju (dva upita po pokretanju, svaka 10 minuta: najmanje 288 čitanja dnevno i kada su prazni), čak i kada je OTP isključen.

## Primarni izvori

- [Google workload identity ka AWS STS](https://aws.amazon.com/blogs/security/access-aws-using-a-google-cloud-platform-native-workload-identity/)
- [AWS mapiranje Google OIDC condition ključeva](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html)
- [SES v2 IAM dozvole/condition keys](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html)
- [Firebase custom tokens i IAM potpisivanje](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
- [Turnstile serverska provera](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Google load-balancer XFF dodatak](https://cloud.google.com/load-balancing/docs/https#x-forwarded-for_header)
- [Cloud Functions request zaglavlja](https://cloud.google.com/functions/docs/reference/headers)
- [SES simulator](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html)
- [Aktuelni SES cenovnik](https://aws.amazon.com/ses/pricing/)

- [Google Firebase Auth dozvole za namensku ulogu](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth)
- [Cloud Run metadata ID token](https://cloud.google.com/run/docs/authenticating/service-to-service#use_the_metadata_server)
