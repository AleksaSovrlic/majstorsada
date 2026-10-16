# Google OTP priprema: izvršenje i provera

4. oktobar 2026. [Odobreni plan](otp-google-preparation-plan.md) je sproveden. Ovo je priprema cloud identiteta, ne produkcijska objava OTP aplikacije.

## Stvarni rezultat

- Projekat Google/Firebase: `majstorsada-b2ad4`, broj `526260795061`; oba aktivna i identitet se podudara.
- Kreiran runtime: `otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com`.
- Stvarni `uniqueId`: `114954723264955273114`.
- Namenska Auth uloga `majstorsadaOtpAuth`: samo `firebaseauth.users.get` i `firebaseauth.users.create`, dodeljena novom identitetu u projektu.
- `roles/datastore.user`: dodeljena samo novom identitetu. Firestore IAM ne ograničava pojedinačne kolekcije.
- Namenska signer uloga `majstorsadaOtpSigner`: samo `iam.serviceAccounts.signBlob`, dodeljena novom identitetu na **njegovom SA resursu**, ne na projektu.
- IAM Credentials API već je bio uključen; ostao je uključen.
- Runtime nema user-managed privatnih ključeva. Nije kreiran ili preuzet JSON ključ, niti dodeljena šira TokenCreator uloga.
- Operator već ima efektivni `actAs`; nije dodata nova deploy uloga.
- Nema direktnih grantova drugim principal-ima na namenskom SA. Pregled obuhvata direktne projektne i SA politike, ne sve eventualne organizacijske/grupne nasledne dozvole.

## Dokaz i testovi

Google readback posle primene, zatim zaseban `otp:google:plan` i `otp:google:verify`, potvrdili su nula preostalih akcija. UTC vreme zasebne verify potvrde: `2026-10-04T21:20:03.702Z`. Lokalna mašinski čitljiva potvrda je `.firebase/otp-google/verification.json` (ignored, bez tajni).

Pre i posle pripreme upoređene su sve 16 postojeće Gen2 funkcije u `europe-west3`: nazivi, stanje, `updateTime` i runtime identiteti potpuno isti. Novi OTP endpointi nisu objavljeni. Postojeći identitet ostaje `526260795061-compute@developer.gserviceaccount.com`.

U ovoj celini ponovo je prošlo **236 testova**:

| Provera | Prošlo |
| --- | ---: |
| Google API/policy/preparation, mock cloud | 47 |
| OTP HTTP/transport/frontend | 38 |
| OTP transakcije/identitet/čišćenje, Firestore emulator | 36 |
| Postojeća bezbednost/poslovne transakcije/rules/Storage/SDK | 115 |

Testovi potvrđuju očuvanje uslovnih IAM prava i audit konfiguracije, svež etag i bezbednu obradu konflikata, ponavljanje postupka bez novih izmena, tačne resurse/role, odbijanje stranih direktnih grantova, razlikovanje 403 i 404, ograničen inventar funkcija i sanitizaciju tokena/grešaka. Neizvestan mrežni rezultat mutacije prekida postupak i zahteva ponovno očitavanje; nije automatsko ponovno kreiranje ili dodeljivanje.

Regresioni OTP testovi ponovo potvrđuju dnevni limit 500, tri slanja po adresi, jedan send pri konkurentnim zahtevima, očuvanje UID-a i zabranu izdavanja klijentskog tokena privilegovanim/nepotvrđenim nalozima. Nijedan od testova nije koristio stvarni AWS transport.

## Uticaj na live aplikaciju i trošak

Sajt ostaje u postojećem magic-link režimu. Nije bilo deploy-a, Auth korisničkih izmena, poslovnih Firestore čitanja/upisa, brisanja poslova, DNS/Zoho promena, SES slanja ili Git commit/push-a. Nema novog kontinuiranog compute izvršavanja ili dodatnog background posla zbog ove pripreme. Budući OTP trošak nastaje tek nakon zasebno odobrene konfiguracije/objave i korišćenja.

Planirano javno uključenje ostaje zatvoreno: `OTP_ENABLED=false`, `OTP_PUBLIC_ENABLED=false`, `OTP_TRUSTED_PROXY_HOPS=0`, frontend magic link. Novi IAM identitet još ne izvršava produkcijski kod.

## Naredni korak

Pripremljeni su konkretni, provereni JSON fajlovi:

- `ops/otp-aws-trust.json`: stvarni Google `sub`/`azp` i namenjena audience vrednost.
- `ops/otp-aws-send.json`: samo SendEmail za SES domen u AWS nalogu `722769295504`, region `eu-central-1`, noreply pošiljaoca i aleksa feedback.

Vlasnik sada u AWS-u kreira ulogu po [detaljnom uputstvu](otp-aws-role-setup.md) i dostavlja stvarni Role ARN. ARN nije tajna; AWS access key nije potreban. Zatim Turnstile, dve tajne, početno zatvoreni parametri, monitoring/billing upozorenja i posebno odobrena kontrolisana objava.

Stvarno potpisivanje Firebase tokena iz novog runtime-a, Google→AWS STS, SES i Turnstile integracija nisu još potvrđeni. Emulatori i tačna IAM politika nisu zamena za taj kasniji ograničeni cloud test. `signBlob` nije sadržajno ograničen na Firebase JWT i ostaje moćna, potrebna dozvola na sopstvenom identitetu.