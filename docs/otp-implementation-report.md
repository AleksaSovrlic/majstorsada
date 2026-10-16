# Lokalni izveštaj: prijava klijenata email kodom

<!-- otp-magic-retirement:current -->
Aktuelno stanje posle kontrolisane objave i uklanjanja magic-link prijave: klijenti koriste isključivo šestocifreni OTP na `/login`. Stari `/finishLogin` i sign-in linkovi vode na čistu OTP prijavu, bez korišćenja Firebase koda. Izdavanje/prijava email linkom su isključeni; prijava majstora i administratora lozinkom ostaje uključena. [Aktuelni izveštaj](otp-magic-link-retirement-report.md). Raniji zapisi ispod predstavljaju istoriju završenih celina.
<!-- /otp-magic-retirement:current -->

**Dopuna 4. oktobra 2026:** [Održavanje biblioteka](dependency-maintenance.md) i [Google IAM priprema](otp-google-preparation-report.md) su završeni i provereni. Izveštaj ispod opisuje istorijsko lokalno stanje od 28. septembra; njegove audit stavke nisu aktuelna ocena. Realna AWS/Turnstile integracija i produkcijska objava još slede.

28. septembar 2026. Implementacija je završena lokalno na osnovi main/35a47f7. Nije bilo produkcijske objave, izmene AWS/GCP/Cloudflare naloga, Git commita ili push-a.

## Šta je urađeno

Klijent može da zatraži šestocifreni kod, potvrdi email u istom browseru i nastavi ka izabranoj usluzi. Kod važi 10 minuta; ponavljanje slanja čeka 60 sekundi. Najviše su tri rezervisana slanja po adresi u klizna 24 sata, najviše 500 ukupno kroz aplikaciju i pet pogrešnih unosa po kodu. Transakcije, jedinstveni ID zahteva i kratkotrajni receipt sprečavaju duplo slanje i omogućavaju oporavak od prekinutog odgovora. Turnstile i IP/burst kočnice štite javni ulaz; njihova stvarna produkcijska konfiguracija još nije potvrđena.

Postojeći potvrđeni klijent zadržava Firebase UID, profil i poslove. Profil novog klijenta potvrđuje se pre izdavanja custom tokena. Majstor/admin, nepotvrđen, deaktiviran, MFA i nalog sa sukobom uloga ne dobijaju klijentski token. Stari magic link i prijave majstora/admina ostaju. Podrazumevani interfejs je magic link; serverski OTP je podrazumevano zatvoren.

SES pošiljalac je ograničen na noreply@majstorsada.rs u Frankfurtu. Planirana Google workload identity razmena za privremene AWS dozvole ne koristi trajni AWS ključ. Nejasan odgovor SES-a se ne ponavlja automatski. Stare funkcije ne učitavaju AWS SDK pri svom cold start-u. OTP zapisi su privatni i čiste se kroz postojeće održavanje.

## Lokalno provereno

- OTP: 38 ciljnih HTTP/transport/frontend testova i 36 testova sa pravim Firestore emulatorom; sve prolazi.
- OTP end-to-end: pravi lokalni Auth, Functions i Firestore emulatori; desktop i mobilni preglednik; pogrešan kod, reload, izgubljen odgovor, ponavljanje istog ID-ja, očuvanje UID-a/profila/posla i zabrana privilegovanih naloga; prolazi bez browser grešaka.
- Postojeća aplikacija: 115 bezbednosnih, 28 startup, tri cost-control i 13 build testova; postojeći end-to-end poslovni tok; SSR i startup browser provere; sve prolazi. Produkcijski Nuxt build prolazi.
- Demo tajne i parametri uklonjeni su posle emulator testa. Pregled novih izvora nije našao ugrađene produkcijske ključeve.

## Trošak i preostale granice

Izmerena nova uspešna prijava koristi 34 Firestore čitanja, 16 upisa i 14 transakcionih poziva, bez Auth/IAM/SES i završne frontend provere uloge. Čišćenje radi i kada je OTP gate isključen: dva upita na 10 minuta znače najmanje 288 čitanja dnevno. U ranijem modelu sa 100 poslova i 300 sesija panela osnova je bila 36.820 čitanja/dan: uz 100 OTP prijava i prazno čišćenje oko 40.508, a uz 500 oko 54.108, pre retry-ja i drugih poziva. Zato limit od 500 slanja nije garancija ostanka cele aplikacije u Firestore besplatnoj kvoti od 50.000 čitanja/dan.

Prema [AWS SES cenovniku](https://aws.amazon.com/ses/pricing/) Essentials naplaćuje 0,16 USD na 1.000 primalaca. Sto slanja dnevno kroz 30 dana iznosi oko 0,48 USD, a 500 dnevno oko 2,40 USD samo za osnovno SES slanje. [Firestore cenovnik](https://firebase.google.com/docs/firestore/pricing/) uključuje najmanje jedno čitanje i za prazan upit. AWS kredit, Firebase kvote, dodatni saobraćaj i drugi servisi su odvojeni; aplikacijski limit ne ograničava ručno ili drugo AWS slanje.

NPM audit produkcijskih Functions i SSR zavisnosti prijavljuje po dve umerene, transitive stavke za isti uuid/gaxios lanac; nema high/critical nalaza. Prijavljeni uuid slučaj odnosi se na v3/v5/v6 sa prosleđenim baferom, dok ovde gaxios poziva v4 bez bafera. Namerno nije nametnuta velika verzija zavisnosti kroz override bez kompatibilnosne provere.

## Uslovi za kontrolisanu objavu

Google IAM priprema je odobrena i završena 4. oktobra 2026; [izveštaj](otp-google-preparation-report.md). Produkcijska objava i stvarni OTP test i dalje zahtevaju zasebno odobrenje. [Koraci za pripremu](otp-setup.md) obuhvataju namenski Google runtime identitet i potpisivanje tokena, usko ograničenu AWS IAM ulogu, Turnstile widget i dve tajne, pouzdanu IP/proxy granicu, nadzor/billing upozorenja, owner allowlist i tek zatim mali realan test SES/Auth/bounce/complaint toka. Pragovi 400/450/500 trenutno su strukturirani logovi, ne automatska obaveštenja. Emulatori ne dokazuju IAM, STS, Turnstile, prijem pošte ili račun. Do uspešne kontrolisane provere i odobrenja javnog OTP-a produkcijska aplikacija ostaje u dosadašnjem magic-link režimu.
