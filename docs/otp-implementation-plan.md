# Email OTP — plan za odobrenje

27. septembar 2026. Pregledana osnova: `main`, `35a47f7`. Radno stablo je bilo čisto pre pisanja ovog dokumenta. Predlog nije implementiran; produkcijska objava i Git commit/push traže zasebno odobrenje.

## Cilj i dogovor

Klijent potvrđuje email šestocifrenim kodom i nastavlja ka izabranoj usluzi u istom browseru/PWA. Ostaju Firebase UID, postojeći podaci, sesija, privatnost i serverski autoritet uloga. Majstor i administrator zadržavaju postojeću prijavu.

SES: Frankfurt eu-central-1; domen majstorsada.rs; pošiljalac MajstorSada <noreply@majstorsada.rs>; feedback aleksa@majstorsada.rs. Vlasnik je potvrdio dostavu SES testa van spama i prijem obične pošte na feedback adresu. AWS je odobrio 50.000 primalaca/24h i 14/s. Essentials je potvrđen ranijom slikom; konfiguraciju ponovo očitati pre objave. Zoho nastavlja prijem pošte, bez povezivanja naloga ili izmena MX zapisa.

Dogovor: tri slanja po email adresi u poslednja 24 sata i 500 ukupno kroz aplikaciju. Konzervativno broje se rezervisani pokušaji, uključujući nepoznat ishod; ne broj uspešnih prijava ili stvarnih isporuka. Ručno AWS slanje i drugi programi nisu obuhvaćeni aplikacijskom kvotom.

## Nalazi u postojećem kodu

- app/pages/login.vue:240: Firebase magic link ide direktno iz SDK-a; postojeći desetosekundni cooldown je samo UI.
- app/pages/finishLogin.vue:187: email-link prijava zatim koristi ensureClientProfile, proveru uloge i accountRoute.
- app/utils/api.ts:7: poslovni klijent zahteva prijavljenu sesiju. Dodati poseban javni OTP klijent, bez popuštanja ove zaštite.
- functions/src/jobLifecycle.ts:40: autoritet uloga je admins/tradespeople/clients; više uloga je greška. Ne uvoditi paralelnu poslovnu ulogu u token claims.
- functions/src/jobLifecycle.ts:60,67: klijentska registracija zahteva potvrđen email i stvara jedan profil transakcijski; ponavljanje ne resetuje podatke.
- app/pages/account.vue:8 i app/pages/majstor/register.vue:204: nedovršena prijavljena sesija može otići u registraciju majstora. Zato klijentski profil potvrditi PRE izdavanja OTP custom tokena.
- functions/src/requestBudget.ts:3: burst kontrola je lokalna po instanci, nedovoljna za dnevne kvote.
- functions/src/index.ts:26: postojeći CORS nije granica javnog slanja; izostanak CORS zaglavlja ne sprečava izvršavanje handler-a.
- firestore.rules:18: podrazumevana zabrana štiti nove serverske kolekcije; nema novih browser dozvola.
- app/plugins/10.firebase.ts, app/stores/auth.ts: sačuvati IndexedDB persistence, UID zaštitu, proveru uloge i startup. Anti-bot alat učitavati samo na OTP ekranu.

## Predložena pravila

| Pravilo | Predlog |
| --- | --- |
| Kod | Šest cifara, uključujući početnu nulu; kriptografski generator |
| Važenje | Deset minuta, prema serverskom satu |
| Resend | Najranije posle 60 sekundi |
| Pogrešni kodovi | Najviše pet pokušaja po kodu, transakcijski |
| Email kvota | Tri rezervisana pokušaja u klizna 24 sata |
| Globalna kvota | 500 rezervacija sa konzervativnom vremenskom zaštitom dispatch-a |
| Kratki globalni nalet | Najviše pet novih rezervacija u sekundi, ispod SES 14/s |
| IP kočnica | Početno 50 send poziva/10 min i 120 verify poziva/10 min; podesivo; IP nije identitet korisnika |
| Dupli klik/retry | Isti request ID i sesija nastavljaju istu radnju, bez drugog mejla |
| Redirect | Postojeći accountRoute, sa očuvanjem usluge i bez spoljnog URL-a |

Jedan pristupačan input: numeric tastatura, paste, autocomplete=one-time-code, fokus i jasne poruke. Kod je string. Mejl može da se čita na drugom uređaju; kod se unosi u sesiju u kojoj je slanje započeto.

Reload obnavlja samo kratkotrajni ID toka, jaku sesijsku tajnu, email i bezbedno odredište iz sessionStorage; kod i custom token se ne čuvaju. Zatvaranje sesije može zahtevati novo slanje koje troši kvotu. Ovo nije skladištenje započetog obrasca za kvar.

Novo slanje menja aktivni kod u istom toku. Odbijanje pre rezervacije ostavlja stari kod netaknut. Definitivni neuspeh transporta ne poništava prethodni važeći kod. Za nepoznat ishod novog slanja aktivan je novi kod, jer je možda već dostavljen. Posle uspešne prijave stariji tokovi iste adrese ne mogu ponovo otvoriti sesiju; evidencija adrese usklađuje verifikacionu generaciju.

## A — serverska granica i SES pristup

Dodati requestClientOtp i verifyClientOtp HTTP funkcije u API codebase-u. Posebni moduli odvajaju politiku, transakcije, identitet i transport. Poslovni endpointi ostaju zaštićeni Bearer tokenom.

OTP adapter eksplicitno zahteva POST, JSON, telo do 4 KiB, poznata polja, validne ID-jeve i dozvoljeni produkcijski Origin. Localhost/preview su dozvoljeni samo u odgovarajućem režimu. Origin nije autentifikacija; direktni poziv mora proći ostale kontrole.

Predlog za nove funkcije: minInstances 0, maxInstances 2, concurrency 10, 256 MiB i ograničen timeout. Globalna konfiguracija drugih funkcija ostaje. To ograničava istovremeni rad, nije limit celog računa.

Biramo Google workload identity → AWS STS privremene dozvole. Namenski Google service account radi OTP; AWS IAM uloga veruje tačno njegovom identitetu i namenjenoj audience vrednosti. Dozvoljen je samo SES SendEmail za Frankfurt identitet i noreply pošiljaoca sa aleksa feedback adresom. Bez trajnog AWS ključa u browseru ili repozitorijumu. Privremene dozvole keširati uz rok i zajedničko osvežavanje u okviru instance.

Google dozvole: neophodan Firestore/Auth pristup, pristup samo OTP tajnama i IAM potpisivanje custom tokena. Namenski Admin app za OTP potpis, bez menjanja inicijalizacije starih funkcija. Stvarni IAM signing, AWS trust i osvežavanje privremenih dozvola su uslov objave, emulator ih ne dokazuje.

Pripremiti vlasniku konkretno uputstvo/policy za AWS IAM ulogu; dostupne Google pripreme uraditi u odobrenoj implementaciji. Ovo ne menja AWS Free plan. Ako nema pristupa za realan test, prijaviti taj uslov za objavu, ne zaobići ga javnom konfiguracijom.

## B — bot zaštita i zajednički budžet

Cloudflare Turnstile Managed samo na OTP ekranu. Free trenutno dopušta neograničene challenge/verifikacije. Server proverava Siteverify rezultat, hostname, action i vezu sa zahtevom. Token traje pet minuta i koristi se jednom. Widget bez server provere nije zaštita.

Turnstile je obavezan za send/resend pre OTP trajnih upisa i SES-a. Verify koristi jaku tajnu toka i trajnu kontrolu pokušaja/IP-ja; bez interaktivne provere pri svakoj cifri. Nedostupnost zaštite ne otvara nezaštićeno slanje; UI nudi smislen retry i pristupačno stanje.

Pre skupog rada: validacija tela, lokalna kočnica i bot zaštita za slanje. IP limit koristi pouzdano utvrđen platform IP, HMAC ključ i ograničenu evidenciju. Ne verovati proizvoljnom prvom X-Forwarded-For ili CF-Connecting-IP na direktnom Google endpointu. Način utvrđivanja IP-ja potvrditi deployment proverom i spoof testovima. Zajednički mobilni/poslovni IP ne postaje dnevni identitet klijenta.

Privatne kolekcije:

- _otpBudget/global: najviše 500 aktivnih rezervacija, bez email adresa i nepotrebnog indeksiranja.
- _otpRateStates/{hmacKey}: adresa, dnevna kvota, cooldown, aktivni tok/generacija; ista kolekcija za kratkotrajne IP zapise.
- _otpChallenges/{randomRequestId}: HMAC tajne sesije/koda, server-only email, vreme, pokušaji, stanje slanja i oporavljivo dovršavanje.

Email validirati i dosledno normalizovati, bez uklanjanja Gmail tačaka ili + dela. Identifikatori imaju odvojene HMAC namene. Kratak OTP ne čuvati kao običan hash bez tajne; postoji samo milion kombinacija. Tajne su u Secret Manager-u, poređenje konstantnog vremena. Kod, sesijska tajna, token i kompletni email nisu u logovima.

Jedna Firestore transakcija proverava request ID/sesiju/payload, adresu, cooldown, kratki nalet i globalni budžet, te zajedno rezerviše mesta i kreira zahtev. SES nije unutar transakcije. Jedan globalni dokument je razuman za 500/dan; velika konkurencija završava kontrolisanom greškom bez slanja. Ne koristiti približan shard brojač.

Rezervacija ima dispatch rok do 60 sekundi, SES kraći abort timeout, a oslobađanje uključuje sigurnosnu marginu: početno 24h + dva minuta od rezervacije, produženo prema kasnijem potvrđenom ishodu. Vreme ponovo očitati neposredno pre slanja; istekao zahtev ne sme dispatch-ovati. Ovo konzervativno ograničava aplikacijske pokušaje. Ne obećava precizan trenutak SES prihvatanja/isporuke; dve usluge nemaju zajedničku transakciju.

SES SDK ima maxAttempts:1 i jednog primaoca. Isti HTTP ID vraća stanje, bez ponovnog SES poziva. Sve dozvoljene rezervacije ostaju potrošene, čak i pri poznatom neuspehu: namerna konzervativna finansijska politika. Korisnik može eksplicitno ponoviti slanje posle cooldown-a ako ima kvotu. Ne obećavati exactly-once isporuku.

## C — OTP provera i identitet

Pokušaji i tačan kod se proveravaju transakcijski. Tačan kod jednom autorizuje completion; paralelni verify ne stvara nezavisne prijave. Kratak lease/receipt, vezan za isti tok, dozvoljava ograničen oporavak (predlog dva minuta, bez beskonačnog produžavanja). Nastavak potvrđenog toka ne šalje novi mejl.

Auth create, Firestore profil i potpis nisu jedna transakcija. Evidentirati cilj/potvrđeni UID i korak completion-a radi nastavka posle prekida. Custom token se ne skladišti trajno i ne vraća pre potvrđenog klijentskog profila.

Politika:

1. Novi email: tek posle koda Auth create sa emailVerified true, profil kroz postojeću transakcijsku registraciju, zatim token.
2. Potvrđeni klijent: getUserByEmail, isti UID, bez resetovanja profila/istorije.
3. Potvrđeni neregistrovani nalog: ponovna provera svih uloga, klijentski profil pre tokena.
4. Majstor/admin/više uloga/disabled: bez klijentskog tokena i promene uloge. Uputstvo za odgovarajući ulaz tek posle dokaza email vlasništva.
5. Nepotvrđeni Auth: bez automatske konverzije ili zadržavanja moguće stare lozinke. Firebase email-link je kontrolisan recovery tokom tranzicije; pre konačnog uklanjanja definisati/testirati recovery i podršku. Raniji testni nalog vlasnik je obrisao; nema zahteva za novim brisanjem/migracijom.

Email-link može imati provider password i bez stvarne klijentske lozinke. Ne odbijati stare potvrđene klijente samo po provider ID-ju. Browser ne bira UID/poslovnu ulogu.

Posle email-already-exists ponovo očitati korisnika i sve provere. Pre completion-a proveriti email, disabled stanje i ulogu. Evidentirani UID/generacija odbijaju zastareo tok. Paralelna registracija daje jednu ulogu kroz postojeću transakciju. Promena emaila/brisanje tokom toka daje kontrolisanu grešku, bez ponovnog stvaranja izbrisanog postojećeg naloga.

Browser koristi signInWithCustomToken, postojeći auth store, force proveru uloge i accountRoute. IndexedDB i header rade kao sada. Greška provere uloge se rešava retry-jem, bez novog OTP-a. Poruke koje sada zahtevaju samo link preformulisati kao potvrđivanje emaila.

## D — email, održavanje i nadzor

Mali HTML i text email na srpskom, velik kod, rok i poruka da se ne deli. Bez priloga, marketinga i koda u subject-u; upotrebljiv bez eksternih slika.

From je noreply; FeedbackForwardingEmailAddress aleksa. Reply-To za podršku koristiti tek nakon potvrde prijema na podrska adresi; to nije feedback adresa. Suppression bounce/complaint ostaje. Mailbox simulator proverava stvaran prijem feedback-a. Početni obim može koristiti praćenu tehničku poštu bez novog SNS servisa.

OTP cleanup kroz zaseban modul postojećeg desetominutnog održavanja, sa ograničenim query/page budžetom i izolovanim greškama. Dve kolekcije sa deleteAfter dodaju oko 288 minimalnih reads/dan kada su prazne. Bez novog cron-a ili naplativog Firestore TTL-a. Istek koda ne resetuje dnevnu kvotu; ne brisati neistekle completion lease/receipt zapise. Update-time precondition štiti osvežene dokumente. OTP cleanup ne dira poslove, kontakt i fotografije.

Privatni agregatni logovi/Monitoring upozorenja za SES greške, kvote i pragove 400/450/500. Upozorenja ne šalju nezaštićen dodatni SES mejl mimo kvote. Ne logovati svakog bota bez granice. Meriti trajanje i operacije, bez koda/emaila/IP-ja u javnim metrikama.

## Trošak i kompromisi

Essentials trenutno: $0,16/1.000 primalaca, bez fiksnog mesečnog iznosa tog plana. Sto slanja/dan × 30 = oko $0,48 osnovne SES cene; 500/dan = $2,40. Podaci, Firebase/drugi servisi nisu uključeni. Krediti pokrivaju podobnu upotrebu dok važe; Free plan se ne menja automatski zbog ove implementacije.

Prvobitni planski budžet bio je 20–30 reads i 10–15 writes. Implementirani tok je izmeren 27.09.2026. na stvarnom Firestore emulatoru: nova uredna prijava koristi 34 reads, 16 writes i 14 transaction callback-a. Instrumentacija ne uključuje Auth, IAM, SES i završnu frontend proveru uloge. Sto takvih prijava dodaje 3.400 reads i 1.600 writes, a 500 dodaje 17.000 reads i 8.000 writes; cleanup, frontend i retry su dodatni. Za bezbednost su zadržane ponovne provere identiteta i uloga.

Raniji model 100 poslova i 300 sesija panela procenjuje 36.820 reads/dan. Sa 100 urednih OTP prijava ima prostora u 50.000 read kvoti pod tim pretpostavkama; sa 500 neki scenariji prelaze kvotu. Write/delete kvote su po 20.000/dan. Izmeriti finalni tok i ažurirati zajednički model pre objave. Secret Manager i drugi resursi imaju svoje kvote; keširati tajne/dozvole. Ne garantovati besplatnu celu aplikaciju ili neograničen HTTP napad.

Globalnih 500 namerno privremeno blokira nova slanja. Važeći kodovi i prijavljene sesije rade. Prag je podesiv i prati se pre dostizanja. Nema automatskog magic-link fallback-a pri kvoti/grešci koji potajno zaobilazi pravila.

## Testovi koji uslovljavaju spremnost

1. Domain: šest cifara/nula, generator, HMAC/sesija, rokovi, validacija/redirect; lažni sat i email/bot adapter.
2. Prave emulator transakcije: globalnih499 + deset paralelnih = jedno mesto; adresa sa2 + konkurencija = jedno mesto; više instanci/restart.
3. Idempotentnost/prekidi: isti ID paralelno, promenjen payload, callback retry, SES prihvaćen/odgovor izgubljen, save/HTTP gubitak, dispatch/24h granice i kvota.
4. Verify: pet konkurentnih grešaka, dva tačna zahteva, resend/istek/promena adrese, recovery samo iste sesije, zastarela generacija, važeći kod pri500.
5. Auth emulator: stvaran custom-token exchange/email_verified, isti stari UID, profil pre tokena, disabled/unverified/majstor/admin/konflikt, registraciona trka i prekid svakog completion koraka.
6. HTTP/rules: niko kroz browser ne čita/menja OTP evidenciju; odbijen Origin zaista daje nula slanja; bot/replay, telo/metoda, IP spoof i rate limits. Pravi produkcijski adapter lokalno; emulator CORS nije dovoljan.
7. Browser: desktop/mobile/PWA, paste, reload, istek, greška/retry, fokus, povratak na uslugu, tabovi. Testni kod samo interno demo runner-u, nikada produkcijski endpoint/log.
8. Regresija: magic link, majstor/admin lozinka, zahtev/fotografije, žetoni/prihvatanje/završetak/ocena, privatnost/istorija, header/push/odjava. Postojeći security/startup/cost/build/SSR paketi i produkcijski build nakon stabilizacije.
9. Ograničen realan test: AWS trust/STS, GCP token signing, Turnstile, simulator success/bounce/complaint/feedback, sopstvene adrese i mobilni browser. Ne slati500 realnih mejlova radi testa kvote.
10. Artefakti: zaključane serverske SDK zavisnosti/audit, nema tajni ili stub-a u javnom bundle-u, dokumentovan build i rollback.

Emulatori ne dokazuju cloud račun, reputaciju dostave ili realni IAM. Spremnost se potvrđuje izveštajem, ne pretpostavlja pre implementacije.

## Redosled odobrenja/isporuke

1. Odobrenje plana; sada je napisan samo dokument.
2. Lokalna implementacija A–D/testovi; magic link podrazumevan, zaseban fail-closed OTP gate i server test allowlist. Pripremiti konkretan AWS IAM/Turnstile postupak i Google IAM. Tajne u zaštićeni Secret Manager, bez chat-a/commita.
3. Lokalni izveštaj, operacije/trošak, testovi i uslovi. Bez produkcijske objave/Git pusha.
4. Posebno odobrena objava testiranih artefakata: backend prvo sa zatvorenim OTP gate-om. PUBLIC_WRITES_ENABLED se ne zatvara zbog dodatne OTP funkcije.
5. Owner/test rollout: realni SES/Auth/Turnstile/feedback i poslovni tok. Backend spreman pre UI ponude OTP-a.
6. Posle prihvatanja kontrolisan javni OTP; stari completion privremeno radi za ranije linkove/kontrolisan recovery. Bez automatskog fallback-a mimo kvota.
7. Rollback: novo OTP slanje off, UI prethodni režim; sesije/poslovi ostaju. Ako je bezbedno, kratko dovršavanje poslatih kodova; kod bezbednosnog incidenta posebno verify off. Ne brisati naloge.
8. Vlasnikov live pregled, naziv commita, zasebno commit/push odobrenje.

## Zašto ovaj plan

Firebase sesija i transakcijski autoritet uloga ostaju osnova. Novi javni ulaz dobija svoju zaštitu/budžet. Ograničena zajednička evidencija kontroliše duplikate i više instanci. Oporavak je deo dizajna. Bez Redis-a, nove baze, stalne instance, email pretplate ili migracije. Trošak i greške su eksplicitni; testovi i mali realni rollout potvrđuju spremnost. Ne može se unapred garantovati odsustvo svake moguće greške.

## Primarni izvori provereni pri planiranju

- [Firebase custom tokens/IAM signing](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
- [Firebase email-link bezbednost](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Firestore transakcije](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firestore kvote/TTL](https://firebase.google.com/docs/firestore/pricing)
- [AWS Google workload identity](https://aws.amazon.com/blogs/security/access-aws-using-a-google-cloud-platform-native-workload-identity/)
- [SES v2 IAM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html)
- [SES SendEmail/feedback](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html)
- [AWS SDK attempts](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)
- [SES cenovnik](https://aws.amazon.com/ses/pricing/)
- [Turnstile plan](https://developers.cloudflare.com/turnstile/plans/)
- [Turnstile serverska provera](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
