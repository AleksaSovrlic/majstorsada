# Priprema zatvorene cloud provere OTP-a

Dopuna 6. oktobra 2026: završena je odobrena kontrolisana cloud objava dve OTP funkcije. Svih 30 IP proba na šest javnih Google adresa prošlo je; dijagnostika je zatvorena i to je potvrđeno udaljenom konfiguracijom i HTTP proverama. Svih 17 prethodnih funkcija je nepromenjeno. Poslovni OTP, slanje i javni OTP ostaju isključeni, proxy parametar ostaje 0, a sajt nastavlja magic-link prijavu. [Završni izveštaj i sledeća celina](otp-ingress-deployment-report.md). Raniji zapisi ispod opisuju prethodne faze.

5. oktobar 2026. Lokalna celina je završena. Produkcijska objava, uključivanje OTP-a, commit i push nisu izvršeni.

## Rezultat

Pripremljena je provera stvarnog Google ulaza kroz iste dve HTTP adrese koje koristi klijentski OTP. Potrebna je jer zatvoreni poslovni OTP gate odbija zahtev pre čitanja IP adrese. Dijagnostika ima zaseban, kratkotrajan pristup; ne pokreće OTP servis, čitanje naloga, Firestore transakcije, Turnstile ili SES.

- Podrazumevano je zatvorena. Lokalni parametar početka provere je prazan.
- Aktivna može biti samo 30 minuta od strogo zadatog UTC početka, dok su i OTP_ENABLED i OTP_PUBLIC_ENABLED false.
- Google potvrđuje identitet vlasnika; moraju se poklopiti nepromenljivi sub, tačna email adresa i email_verified=true. Parametri vlasnika su u ignorisanom lokalnom dotenv fajlu.
- Operatorski alat dobija kratkotrajan OAuth token samo za openid/email. Token sa Cloud Platform pravima se ne šalje aplikaciji. Tokeni se ne ispisuju niti čuvaju u fajlovima.
- Odgovor sa IP lancem dobija samo autentifikovani operator, uz private, no-store. IP adrese se obrađuju u memoriji; sačuvani izveštaj sadrži broj pozicija, jednakost rezultata i predloženi broj proxy koraka, bez IP adresa ili tokena.
- Postojeća Origin/CORS pravila su zadržana. Ovo je operatorski alat, bez browser dijagnostičkog interfejsa ili pristupa u klijentskom OTP toku.
- Neispravna zaglavlja i tela imaju ograničenu veličinu; Google poziv ima rok, zabranjeno preusmeravanje i ograničen odgovor. Postoji i lokalna kočnica za pokušaje autentifikacije. Poruke grešaka su fiksne.

Ovo nije novi način prijave korisnika. Google UserInfo potvrđuje vlasnika OAuth tokena, ali ne vezuje token za našu aplikacijsku audience vrednost. Zato je mehanizam ograničen na privremenu dijagnostiku koja vraća podatke operatorovog zahteva. Pri uključivanju poslovnog OTP-a ovaj pristup se automatski odbija.

Primarni izvori: [Google UserInfo i sužavanje refresh scope-a](https://developers.google.com/identity/openid-connect/reference), [Google zaglavlja funkcija](https://cloud.google.com/functions/docs/reference/headers). Dokumentacija load balancera ne koristi se kao zamena za merenje naše konkretne rute.

## Provera IP granice

Alat najpre nezavisno očita izlaznu IP adresu operatora preko fiksnog AWS HTTPS servisa. Zatim šalje pet varijanti na svaku OTP adresu: bez lažnog prefiksa, sa IPv4, IPv6, višestrukim i neispravnim prefiksom, uz lažno Cloudflare zaglavlje.

Prihvata samo isti položaj stvarne klijentske IP adrese u poslednje četiri pozicije, na obe funkcije i u svim varijantama. Promena broja koraka ili ostatka pouzdanog lanca, dvosmislen rezultat, neispravne adrese ili različit izlaz kroz VPN/NAT/IPv4/IPv6 zaustavljaju automatsku potvrdu. Alat ne bira drugu IP adresu i ne upisuje proxy parametar automatski. Posle merenja sledi pregled dokaza pre owner OTP testa.

## Šta je stvarno provereno u cloud-u

Prošao je read-only preflight: namenski Google identitet i ograničene dozvole, obe postojeće tajne i njihove pojedinačne IAM veze, lokalna AWS konfiguracija i pregledani AWS policy dokaz. Potvrđen je i stvarni Google identitet operatora sa suženim tokenom. Nisu dodavane IAM dozvole niti čitane vrednosti serverskih tajni.

U trenutku preflight-a postojeće 16 funkcija su ostale objavljene; nove OTP funkcije još nisu objavljene. Ovo ne potvrđuje stvarno AWS STS/SES slanje, udaljeno potpisivanje Firebase tokena ili Turnstile tok iz novog runtime-a. Ti testovi slede nakon odobrene objave i potvrde IP granice.

## Tačan sledeći korak

Ti sada nemaš dodatno podešavanje u Cloudflare-u, AWS-u ili Zoho-u. Potrebno je samo zasebno odobrenje za kontrolisanu objavu dve nove funkcije, uz zatvoreno slanje i zatvoren javni OTP. Sledeće korake izvršava Codex; komande su ovde za pregled, nisu zahtev da ih vlasnik ručno pokreće.

1. Ponoviti preflight i Functions build: npm run otp:rollout:plan.
2. Neposredno pre odobrene objave zadati kratki lokalni prozor: node tools/prepare-otp-ingress.mjs --open-window.
3. Objaviti isključivo functions:api:requestClientOtp,functions:api:verifyClientOtp u projektu majstorsada-b2ad4, uz --non-interactive i bez --force. Uobičajeni deploy:prod objavljuje mnogo širi skup i nije komanda za ovu proveru.
4. Pokrenuti npm run otp:ingress:probe. Očekuje se 10 dijagnostičkih poziva i izveštaj bez IP adresa/tokena. Nesaglasnost je blokator za owner slanje.
5. Očistiti lokalni početak prozora pomoću --close-window, ponovo objaviti isti uski skup dve funkcije i pokrenuti npm run otp:ingress:closed. Tek ova objava prenosi zatvaranje u cloud; samo izmena lokalnog fajla to ne radi. Ako se objava prekine, prethodni cloud prozor svakako ističe posle 30 minuta.
6. Pregledati stvarnu cloud konfiguraciju i inventory posle objave. Potvrditi da ostale funkcije nisu menjane.

Tačan deploy selector proverava se semantikom instaliranog Firebase CLI-ja i svim trenutnim API izvozima, uključujući odbijanje slučajno odabranih funkcija sa istim prefiksom. Plan ne izvršava deploy. Priprema prozora pravi lokalni backup, proverava da parametri nisu menjani tokom preflight-a i menja samo datum početka.

Ova objava ne menja Hosting/SSR, Firestore/Storage pravila, indekse ili scheduler. Zato još ne omogućava proveru OTP forme na živom sajtu. Nakon IP provere sledi zasebna celina: konfiguracija potvrđenog proxy lanca, stvarni AWS i potpisivanje, pa owner preview na sajtu uz podrazumevani magic link. Javna prijava kodom dolazi posle uspešnog owner testa i odobrenja.

## Uticaj na Blaze i AWS

Nema novih biblioteka, serverskih tajni ili IAM grantova. Dijagnostika ne troši Firestore operacije, Auth kreiranje/proveru naloga ili SES slanja. Dnevni limit OTP mejlova ostaje 500; ova celina ga ne troši.

U redovnom toku dijagnostika nema dodatnih udaljenih poziva. Kontrolisana provera ima 10 poziva funkcija i dve završne provere zatvaranja, uz nekoliko Google poziva za identitet i pripremu. Same cloud objave koriste build, skladištenje artefakata i druge Google kvote. Lokalna kočnica nije centralni garantovani limit ukupnog broja invokacija; ne treba je predstavljati kao zaštitu od svih mogućih računa. Nema tvrdnje da je svaka cloud aktivnost besplatna.

## Validacija

Browser provera koristi postojeći izolovani Python u .firebase/toolchains/browser/Scripts/python.exe (E2E_PYTHON) i instalirani Edge u headless režimu (E2E_BROWSER_CHANNEL=msedge). Izbor pogrešnog Python-a ili neinstaliranog podrazumevanog Chromium-a je greška testnog okruženja, ne rezultat aplikacijskog testa. Nova demo konfiguracija eksplicitno zatvara dijagnostičke parametre, pa emulator ne generiše dodatni .env.local.


- Cloud alati i policy preflight: 152/152.
- OTP HTTP, runtime, dijagnostika, frontend, widget i transport: 72/72.
- OTP servis, identitet i održavanje na Firestore emulatoru: 36/36.
- SSR manifest/lockfile: 19/19.
- Poslovna bezbednost, privatnost, transakcije i Storage pravila: 115/115.
- Ukupno: 394 imenovana testa.
- Pravi Auth/Functions/Firestore emulator HTTP tok: prošao.
- Headless Edge, desktop i mobilni OTP tok: prošli, browserErrors=[]. Provereni su pogrešan kod, paste, reload, izgubljen verify/send odgovor, isti request ID i nastavak nakon greške uloge, bez dodatnog mejla.
- Functions TypeScript build i git diff --check: prošli.

Iz nezavisnog pregleda uklonjeni su propust u sanitizaciji poruke transportne greške i nepotpun korak cloud zatvaranja; oba sada imaju eksplicitne testove. Testovi ne dokazuju odsustvo svih budućih grešaka. Za završnu integracionu potvrdu potrebno je merenje i test stvarnih servisa.
