# Javni OTP kao redovna klijentska prijava — izveštaj

<!-- otp-magic-retirement:current -->
Aktuelno stanje posle kontrolisane objave i uklanjanja magic-link prijave: klijenti koriste isključivo šestocifreni OTP na `/login`. Stari `/finishLogin` i sign-in linkovi vode na čistu OTP prijavu, bez korišćenja Firebase koda. Izdavanje/prijava email linkom su isključeni; prijava majstora i administratora lozinkom ostaje uključena. [Aktuelni izveštaj](otp-magic-link-retirement-report.md). Raniji zapisi ispod predstavljaju istoriju završenih celina.
<!-- /otp-magic-retirement:current -->

10. oktobar 2026. Odobrena produkcijska objava je završena. Sajt koristi OTP na redovnom `/login`, bez preview parametra i bez ograničenja na jednu vlasnikovu adresu. Hosting release je objavljen u **20:56:15 UTC** (22:56:15 po lokalnom vremenu).

## Šta je promenjeno

- Na dve OTP funkcije promenjeni su samo `OTP_PUBLIC_ENABLED=false → true` i `OTP_TEST_EMAILS=aleksa@majstorsada.rs → prazno`. Slanje/prijava ostaju uključeni; proxy hops ostaje 1 i dijagnostički prozor ostaje zatvoren.
- Nuxt podrazumevana vrednost i obe lokalne produkcijske dotenv postavke sada biraju `otp`; `.env.example` je usklađen.
- `/finishLogin` i globalni handler za već izdate magic linkove ostaju dostupni. Dve poruke za nevažeći link sada upućuju na ponovni pokušaj prijave, umesto na traženje novog linka. Završavanje linka nije menjano.
- Postojeća magic-link implementacija ostaje za kontrolisan povratak konfiguracije; javna forma sada šalje OTP. Nije dodata alternativna legacy ruta ili query za slanje magic linkova.

## Objavljivanje i očuvanje produkcije

Pre promena sačuvani su svež inventar funkcija, raspored održavanja, indeksi, prethodna konfiguracija i usklađena owner SSR/Hosting verzija za povratak. Kontrolisana objava je izvršena redom:

1. `functions:api:requestClientOtp,functions:api:verifyClientOtp`
2. Udaljena provera javnih parametara, resursa, zatvorene dijagnostike i negativnih HTTP granica.
3. `functions:nuxt-ssr:server,hosting`, iz upravo proverenog produkcijskog build-a.
4. Završni pregled resursa, živog sajta, logova i postojeće klijentske UID veze.

Posle serverske faze ostalih **17 funkcija** bilo je potpuno nepromenjeno prema novom baseline-u. Posle završne faze nepromenjeno je **16 funkcija**, a sva **19** su ACTIVE. Promenjene su upravo OTP funkcije i SSR server. Nisu ponovo objavljivani poslovne funkcije, održavanje, pravila ili indeksi.

| Produkcijska kontrola | Rezultat |
| --- | --- |
| OTP runtime | Node 24; min 0 / max 2 po funkciji; 256 MiB; CPU 1; concurrency 10; timeout 60 s; ista namenska Google identifikacija |
| SSR runtime | Node 24; min 0 / max 3; 256 MiB; CPU 1; concurrency 80; timeout 60 s |
| Održavanje | Ista funkcija, isti raspored na 10 minuta u UTC, iste granice i poslovni parametri |
| Indeksi | Poslovni indeksi očuvani; postojeće OTP konfiguracije spremne |
| Secret Manager | Postojeća vezivanja na verziju 1; bez novih verzija i bez čitanja payload-a tajni |
| Postojeći klijent | Isti Auth UID, iste custom claims i isti UID u klijentskom profilu; bez migracija/brisanja |
| Hosting | Nova FINALIZED verzija; ispravan SSR rewrite; 86 fajlova, 12 novih upload-a |

## Provere

| Provera | Rezultat |
| --- | --- |
| OTP runtime, HTTP, transport, frontend, widget, dijagnostika i održavanje | 85 testova prošlo; frontend/widget podskup od 38 testova ponovo prošao posle promene konfiguracije (nije dodatnih 38 različitih testova) |
| SSR manifest i zaključane zavisnosti | 25 testova prošlo |
| OTP Auth/Firestore/Functions emulatori i pregledač | Prošlo: javne testne adrese, jedan mejl pri ponavljanju istog request ID-a, vezivanje sesije, pogrešan kod, custom-token razmena, kreiranje klijenta, isti UID/profil/poslovi, zabrana drugih uloga i nepotvrđenih naloga; desktop i mobilni oporavak izgubljenih odgovora/reload-a |
| Poslovni HTTP i browser tok | Prošlo: CORS/Auth/parsing/limiti tela, završavanje stvarnog emulator magic linka pod OTP-default režimom, zahtev/fotografije/privatnost/tokeni/prihvatanje/kontakt/završetak/ocena/oporavak uloge/odjava |
| Produkcijski build i stvarni SSR export | Prošlo: redovni `/login` prikazuje OTP, četiri javne SEO stranice očuvane, 12 privatnih ruta noindex, bez browser grešaka |
| Audit produkcijskih zavisnosti | Functions i SSR: 0 poznatih ranjivosti. Ovo nije tvrdnja da celokupan razvojni dependency tree nema ranjivosti |
| Produkcijski HTTP | Proizvoljna validno oblikovana adresa i vlasnikova adresa sa namerno nevažećim bot tokenom daju 403; CORS 204; šest dijagnostičkih adresa ostaje zatvoreno |
| Produkcijski pregledač | Običan i preview login prikazuju OTP; desktop/mobilni izgled bez horizontalnog preliva; master/admin login i legacy completion ruta rade; javni naslovi/H1/canonical očuvani; 0 page errors |
| Produkcijski logovi | Od početka rollout-a do završnog pregleda: 0 neočekivanih ERROR zapisa za OTP servise, SSR i održavanje; šest 503 request logova odgovara namernim probama zatvorene dijagnostike |

Pri povezivanju operatorskih i Google vremenskih oznaka korišćena je tolerancija od dve sekunde. Izdvojeni očekivani zapisi moraju biti isključivo request logovi dve OTP funkcije, statusa 503, neposredno oko šest potvrđenih dijagnostičkih proba; aplikacijski ERROR zapisi se ne izuzimaju.

HTTP probe nisu promenile metadata globalnog OTP budžeta i nisu napravile challenge dokumente. Operaterske produkcijske provere nisu poslale nijedan mejl niti napravile Auth nalog. Dve prethodne vlasnikove stvarne prijave već su dokazale realan Turnstile → Google identitet → AWS STS → SES → Firebase tok. Nove provere potvrđuju javni režim i redovni ulaz; nisu predstavljene kao novo stvarno slanje na drugu produkcijsku adresu.

## Limiti i troškovi

Ostaju isti: najviše 500 OTP pokušaja slanja u periodu od 24 sata ukupno i tri po adresi, uz postojeće rezervacije, cooldown, IP/burst i limit pogrešnih kodova. Prethodna slanja ostaju uračunata; budžet nije resetovan. Ne uvode se stalno zagrejane instance, novi scheduler, dodatni poslovni listeneri ili novi secret-i. Javna dostupnost povećava potrošnju samo u meri stvarnog korišćenja/odbijenih zahteva. Aplikacijski limit ne ograničava ručno SES slanje iz AWS konzole niti sve ostale Firebase/AWS troškove.

## Sledeći korak

Vlasnik proverava **jednu prijavu preko https://majstorsada.rs/login u privatnom prozoru**, bez preview parametra. Dovoljno je potvrditi da kod stigne, prijava uspe i ostane aktivna nakon osvežavanja. Za proveru proširenja na druge adrese može koristiti sopstvenu drugu klijentsku adresu; ne majstorski/administratorski nalog. Vlasnikova ranije korišćena adresa ima dva već iskorišćena pokušaja u aktuelnom 24-časovnom periodu.

Posle potvrde planira se odvojena celina za uklanjanje preostalog klijentskog magic-link toka, uz očuvanje prijave majstora i administratora. Git commit/push nisu izvršeni u ovoj celini.

Operaterski dokazi i backup-i ostaju lokalni u ignorisanom `.firebase/otp-public-rollout/`. Ne slati ih u Git niti deliti dotenv/credential/secret payload-e.