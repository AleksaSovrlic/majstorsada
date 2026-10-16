# Priprema Google identiteta za klijentski OTP

Odobrena celina, 4. oktobar 2026. Projekat: `majstorsada-b2ad4`. Ovaj postupak priprema identitet i IAM; produkcijska objava zahteva zasebno odobrenje.

## Zašto ovakav obim

OTP kod već koristi eksplicitni `OTP_RUNTIME_SERVICE_ACCOUNT` za dva nova endpointa. Pre vezivanja za AWS treba da postoji stvarni Google identitet i njegov brojčani `uniqueId`. Postojeća magic-link prijava, majstori, poslovni endpointi, Zoho i SES domen nemaju potrebu za promenom u ovoj celini.

Stvarni Admin SDK 14.4 za postojeći tok poziva samo Auth lookup/create i udaljeni `signBlob`. Zato koristimo Auth ulogu sa `firebaseauth.users.get/create` i signer ulogu sa samo `iam.serviceAccounts.signBlob`. Signer grant je na sopstvenom service-account resursu; projektna uloga postoji kao definicija, ali nije dodeljena na nivou projekta. `signBlob` i dalje može da potpisuje proizvoljne bajtove; nije sadržajno ograničen na Firebase JWT.

## Redosled

1. Proveriti postojeću CLI prijavu i eksplicitan projekat, identitet Google/Firebase projekta i aktivno stanje. Read-only plan mora razlikovati 404 od odbijenog pristupa i nepoznatog mrežnog rezultata.
2. Pregledati postojeće direktne IAM politike, stanje IAM Credentials API-ja, namenski nalog i postojeće custom role. Neočekivana prava, privatni ključevi, disabled nalog ili drugačije dozvole u postojećoj ulozi zaustavljaju postupak.
3. Kreirati `otp-runtime` bez privatnih ključeva i dve namenske custom role ako ne postoje. Dodeliti `roles/datastore.user` i Auth ulogu samo novom identitetu u projektu; signer ulogu istom identitetu samo na njegovom resursu. Uključiti Credentials API samo ako je isključen. Već ovlašćenom vlasniku ne dodavati novu `actAs` ulogu.
4. Svaku IAM politiku ponovo očitati neposredno pre izmene, sa verzijom 3 i svežim `etag`. Dodavati samo potrebne unconditional binding-e i očuvati tuđa prava, uslove i audit konfiguraciju. Konflikt ponovo očitati; mrežno neizvestan rezultat ne ponavljati slepo.
5. Ponovo očitati i potvrditi nalog, tačne uloge, zero user-managed keys i operaterov `actAs`. Ponovljeni plan mora imati nula preostalih akcija. Uporediti 16 postojećih funkcija i njihove verzije/identitete.
6. Na osnovu stvarnog `uniqueId` generisati konkretne AWS trust i SES permissions JSON fajlove. AWS account je `722769295504`, ranije potvrđen iz korisnikovog SES identity ARN-a. Fajlovi sadrže javne identifikatore, ne tajne.

## Provere i granice

Testovi pripreme pokrivaju postojeće uslovne grantove, audit konfiguraciju, etag, konflikt, idempotency, neočekivana prava/role, 403 naspram 404, greške tokena i neizvesne mrežne rezultate. Regresiona OTP provera potvrđuje da lokalni tok ostaje ispravan.

IAM `datastore.user` omogućava pristup bazi, ne samo pojedinim OTP kolekcijama; Admin SDK zaobilazi rules. Ovaj pregled direktnih projektnih i SA grantova ne predstavlja celovit pregled eventualno nasleđenih organization/group dozvola.

U ovoj fazi nema promene aplikacijskih naloga, poslova, tajni, DNS-a, AWS podešavanja, deploy-a, slanja OTP mejlova ili Git push-a. Ne nastaje novo trajno izvršavanje funkcija. Stvarno potpisivanje iz novog runtime-a, AWS STS i Turnstile potvrđuju se tek u kasnijoj odobrenoj cloud proveri; IAM konfiguracija i emulatori sami nisu dokaz kompletne integracije.

## Naredna celina

Vlasnik u postojećem AWS nalogu kreira IAM ulogu po generisanim politikama i dostavlja Role ARN (nije tajna). Potom Managed Turnstile za dva naša hostname-a, sigurno skladištenje dve OTP tajne, početno zatvoreni parametri i posebno odobrena kontrolisana objava. Magic link ostaje podrazumevan do završetka realnih provera.

## Primarni izvori

- [Firebase custom-token signing](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
- [Identity Platform API permissions](https://docs.cloud.google.com/identity-platform/docs/access-control)
- [Google IAM allow policy version, etag and conditions](https://docs.cloud.google.com/iam/docs/allow-policies)
- [Google service-account getIamPolicy](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/getIamPolicy)
- [Google metadata ID token](https://docs.cloud.google.com/docs/authentication/get-id-token)
- [AWS mapiranje Google identiteta](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html)