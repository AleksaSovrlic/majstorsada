# Uklanjanje klijentskog magic-link toka — produkcijski izveštaj

Kontrolisana objava završena je 11. oktobra 2026. Konačna Hosting verzija je FINALIZED: **2026-10-11T00:57:39.472Z**, odnosno **11. oktobar 2026. 02:57:39** po lokalnom vremenu. Klijenti koriste samo šestocifreni email OTP na `/login`.

## Promena i očuvano ponašanje

- Uklonjeni su stari pošiljalac, Firebase razmena email linka, globalni handler, orphan helper za kreiranje profila i frontend prekidač režima prijave. Postoji jedan redovan OTP tok.
- `/finishLogin` ostaje inertna kompatibilna ruta: preusmerava na OTP, ne koristi Firebase kod i ne stvara nalog/profil. Stari `mode=signIn` ulazi uklanjaju Auth query i zadržavaju samo dozvoljeno klijentsko odredište i potrebne poslovne parametre. Nepouzdani ili višestruki parametri ne otvaraju drugo odredište.
- SSR vraća 302 za staru završnu rutu. Ako Firebase Hosting posluži prerenderovan javni HTML, klijentski handler učita čist login dokument kroz `location.replace`. Time su login noindex i canonical pouzdani i na toj putanji. Ovo dodaje jedan dokument zahtev samo pri otvaranju starog linka; redovna prijava i paneli nemaju novi reload ili listener.
- Brišu se samo dve stare browser stavke: `emailForSignIn` i `postAuthRedirect`. Firebase Auth persistence i OTP sesija se ne brišu.
- Firebase podešavanje promenjeno je isključivo kroz `updateMask=signIn.email.passwordRequired`, na `true`, sa isključenim automatskim retry-jem mutacije. Sveža read-only provera potvrđuje da su email linkovi isključeni, a `signIn.email.enabled=true` i ostala pregledana podešavanja očuvana. Prijava majstora/admina lozinkom i Firebase reset/verification handleri ostaju dostupni. Custom-token OTP prijava koristi isti standardni Firebase Auth session tok.
- Postojeći UID, custom claims, klijentski profil i pristup poslovima ostaju. Produkcijski proverena druga klijentska adresa ima raniji profil bez redundantnog `uid` polja; autoritet je ispravan ID dokumenta. Njeni pregledani Auth podaci i UID potpuno su isti pre/posle objave. Nema migracija, brisanja, promene lozinki ili opoziva sesija.

Značenje Auth polja i usko ograničenog update-a provereno je prema [Identity Platform Email konfiguraciji](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config#Email) i [updateConfig API-ju](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig). Instalirana Nuxt implementacija potvrđuje da klijentski `external: true` za fiksni interni login koristi pun document load; odredište i dalje dolazi isključivo iz našeg sanitizovanog helper-a.

## Provere

| Oblast | Rezultat |
| --- | --- |
| OTP čisti testovi | 85 postojećih + 8 novih testova sanitizacije/preusmeravanja; svi prošli |
| Stvarni Firestore emulator | 39 testova servisa, identiteta i održavanja; prošli, uključujući postojeće profile sa/bez redundantnog UID polja |
| Bezbednosna pravila i SDK | 115 testova prošlo |
| Startup / cost control | 28 + 3 testa prošlo; startup browser četiri scenarija sa po tri ponavljanja prošao |
| SSR i zavisnosti | 25 manifest/lock guard testova, 3 transport i 2 stvarna compiled SSR/Admin SDK testa prošlo; Functions/SSR produkcijski audit: 0 poznatih ranjivosti u pregledanom snapshot-u |
| OTP emulator HTTP/browser | Custom-token razmena, pogrešan kod, reload, izgubljeni odgovori, idempotentni retry, uloge i očuvanje UID-a/profila/poslova prošli |
| Poslovni emulator HTTP/browser | Zahtev i fotografije, privatnost kontakta, tokeni, prihvatanje, završetak, ocena, istorija/limiti, oporavak registracije i odjava prošli. Validan lokalni stari link nije potrošen i nije stvorio nalog/profil ili OTP slanje |
| Konačni produkcijski build i SSR | Četiri javne SEO stranice, 12 privatnih noindex ruta, tri stara ulaza i dve prijave lozinkom prošli; dodatni test stvarnog prerenderovanog root HTML-a potvrđuje čist login dokument/noindex/canonical |
| Živi HTTP | Dve adrese sa nevažećim bot tokenom odbijene sa 403; CORS 204; šest dijagnostičkih ulaza zatvoreno; OTP budžet nepromenjen i nema challenge-a iz proba |
| Živi browser | Desktop/mobilni OTP, stare završne/root adrese, sanitizovan query, konačni login noindex/canonical, dve password forme i četiri javne SEO stranice prošli; 0 page errors i 0 legacy Auth/automatskih OTP poziva |
| Logovi i identiteti | 0 neočekivanih ERROR zapisa u pregledanom rollout prozoru; vlasnikov UID/claims i Auth zapis druge proverene adrese očuvani |

Stvarni raniji korisnički pokušaji: **3 završena receipt-a, 2 različita klijentska identiteta**. SES prihvatanje i završeno vezivanje identiteta/profila potvrđeni su bez čitanja koda, HMAC-a, session secret-a ili custom tokena; vlasnik je posebno potvrdio uspešnu prijavu drugom adresom. Ova faza nije sama slala nove produkcijske mejlove niti kreirala Auth naloge.

Browser probe blokirale su sve metode osim GET/HEAD/OPTIONS. Jedini ostali blokirani automatski zahtevi bili su Cloudflare RUM telemetry POST zahtevi; nisu Auth ili OTP operacije. Podrazumevanu Python HTTP probu Cloudflare je odbio; browser User-Agent i stvarni Edge potvrdili su ispravne ulaze. Namernih šest zatvorenih dijagnostičkih 503 request logova izdvojeno je samo prema servisu, statusu i vremenu, sa tolerancijom dve sekunde; aplikacijski ERROR zapisi nisu izuzimani.

Posle male korekcije statičnog ulaza ponovo su prošli nov produkcijski build, 25 SSR guard testova, osam sanitization testova i kompletna compiled SSR/browser provera sa novom Hosting regresijom. Ostale suite iz tabele prošle su u istoj celini; nisu predstavljene kao dodatni različiti testovi pri ponavljanju.

## Obim produkcijske objave i trošak

Objavljene su samo `requestClientOtp`, `verifyClientOtp`, `completeRegistration`, `server` i Hosting. Svih **19 funkcija** je ACTIVE; **15 ostalih funkcija** je potpuno očuvano prema svežem baseline-u. Održavanje, njegov raspored na deset minuta, poslovni indeksi, pravila i resource granice nisu menjani.

Registracija je pri redeploy-u preuzela zajedničke OTP parametre i aktuelnu vrednost `JOB_MAINTENANCE_ENABLED`. Nezavisna provera koda potvrđuje da ih njen handler ne koristi. Svi njeni upotrebljeni poslovni/platformski parametri, servisni nalog, resursi i secret binding-i strogo su očuvani; funkcija održavanja nije ponovo objavljena. Ova usklađenost ne pokreće dodatno održavanje ili SES pozive.

OTP ostaje min 0 / max 2 po funkciji, 256 MiB, CPU 1, concurrency 10; SSR min 0 / max 3, 256 MiB, CPU 1, concurrency 80. Nema novih tajni, njihovih verzija, stalno zagrejanih instanci, polling-a ili poslovnih listener-a. Namenska Google → AWS identifikacija ostaje bez trajnog AWS access key-a.

Ostaju **500 rezervisanih aplikacijskih pokušaja slanja u klizna 24 sata ukupno i tri po email adresi**, sa istim cooldown-om, expiry-jem i limitom pogrešnih kodova. Ranija slanja ostaju uračunata; budžet nije resetovan. Aplikacijski limit ne ograničava ručno SES slanje niti ceo Firebase/AWS račun.

## Oporavak i sledeći korak

Svež prethodni javni SSR source ZIP, odgovarajuća Hosting verzija, odabrani Auth config i konfiguracioni baseline sačuvani su lokalno u ignorisanom `.firebase/otp-magic-retirement/rollback/` i susednim evidence fajlovima. Backup-i i lokalni parametri ne idu u Git. Za problem sa slanjem prvo koristiti postojeći OTP send off gate; za širi incident oba gate-a. Tehnički UI rollback koristi usklađeni javni SSR/Hosting par, uz proveru resursa i stvarnih ruta; ne vraćati stare owner/closed recepte. Ne uključivati automatski magic-link fallback niti resetovati Auth/naloge/budžet. Vraćanje konkretne Auth leaf promene ostaje zasebna kontrolisana odluka sa svežim poređenjem konfiguracije.

Vlasnik može proveriti jednu OTP prijavu na [živom login-u](https://majstorsada.rs/login), zatim refresh i pristup klijentskom panelu; poštovati već iskorišćena tri pokušaja po adresi. Dalje po planu sledi završna priprema za marketing: poslovna prihvatna provera, mobilni/performance pregled, nadzor i release/recovery dokumentacija. Ovaj izveštaj ne odobrava automatski dodatne implementacije ili marketing.

Git commit/push nisu izvršeni. Provere daju konkretnu potvrdu pregledanog stanja; ne predstavljaju garanciju odsustva svih budućih grešaka ili ostanka celog cloud računa u besplatnim kvotama.
