# Zatvorena cloud objava OTP funkcija — rezultat

Dopuna 10. oktobra 2026, posle vlasnikove probe: dve stvarne OTP prijave su uspešne. Udaljeni receipt-i potvrđuju isti Auth/klijentski UID, oba SES accepted slanja i završen token/profil tok; pregled nije potrošio dodatne pokušaje. Javni/default OTP ostaje sledeća odvojeno odobrena celina. [Aktuelna provera i sledeći korak](otp-owner-live-validation-report.md). Raniji zapisi ispod čuvaju redosled prethodnih celina.

Dopuna 10. oktobra 2026: odobrena produkcijska OTP proba je objavljena i operaterski proverena. Slanje i provera dostupni su samo za aleksa@majstorsada.rs; javni OTP ostaje zatvoren, a obična prijava koristi magic link. Prva stvarna Turnstile → AWS → Firebase prijava sada čeka vlasnikovu probu. [Aktuelni rezultat i uputstvo](otp-owner-deployment-report.md). Raniji zapisi ispod predstavljaju istoriju prethodnih celina.

Dopuna 7. oktobra 2026: lokalna priprema ograničene OTP probe za jednu vlasnikovu adresu je završena. Pripremljeni su indeksni preflight, kandidat sa tačno četiri promene parametara, zaštita postojećeg održavanja i usklađen SSR/Hosting backup. Produkcijski OTP i slanje ostaju zatvoreni; realna Turnstile → AWS → Firebase prijava tek treba da se proveri nakon zasebno odobrene objave. [Aktuelni izveštaj i tačan sledeći korak](otp-owner-preparation-report.md). Stariji zapisi ispod čuvaju stanje ranijih celina.

6. oktobar 2026. Kontrolisana objava dve nove funkcije i merenje IP granice su završeni. Slanje, javna OTP prijava i dijagnostika ostaju zatvoreni. Ovo nije javno uključivanje OTP-a.

## Rezultat na stvarnom Google ulazu

Objavljene su isključivo requestClientOtp i verifyClientOtp iz API codebase-a u europe-west3. Posle merenja ponovo je objavljen isti par funkcija sa praznim OTP_DIAGNOSTICS_WINDOW_START. Nisu objavljivani Hosting/SSR, pravila, indeksi ili scheduler. Postojeća prijava na sajtu nastavlja magic-link tok.

Provereno je svih šest podrazumevanih javnih adresa: cloudfunctions.net, hash run.app i deterministički run.app alias za svaku funkciju. Google potvrđuje ove alternativne ulaze u [Cloud Run dokumentaciji](https://docs.cloud.google.com/run/docs/triggering/https-request#service_url); zato provera samo frontend adrese ne bi bila dovoljna za globalno podešavanje proxy lanca.

Na svakoj adresi poslato je pet autentifikovanih varijanti: bez dodatnog X-Forwarded-For, sa lažnim IPv4 prefiksom, IPv6 prefiksom, više prefiksa i neispravnim prefiksom. Lažno CF-Connecting-IP zaglavlje nije promenilo izbor. Stvarna izlazna adresa nezavisno je potvrđena preko fiksnog AWS HTTPS reflektora, bez čuvanja IP vrednosti.

Svih 30 pokušaja prošlo je. Stvarni IP bio je poslednji element X-Forwarded-For lanca, odnosno kandidat OTP_TRUSTED_PROXY_HOPS=1. Broj elemenata po pet varijanti bio je 1, 2, 2, 4, 2 na svakom ulazu. Pouzdani završetak lanca bio je jednak kroz sve varijante i aliase. Predlog je pregledan; parametar i dalje ostaje 0 dok sledeća celina ne uključi odobreni owner test. Alat ne menja tu vrednost automatski.

Ovo je stvarno merenje trenutnih Google ruta iz operatorove mreže, uz pokušaje podmetanja zaglavlja. Nije dokaz svake buduće mrežne topologije. Promena regiona, ulazne rute, dodatnog proxy-ja ili load balancera zahteva novu proveru. Ne koristiti prvi element zaglavlja ili CF-Connecting-IP kao zamenu za proverenu granicu. [Google opis zaglavlja](https://docs.cloud.google.com/functions/docs/reference/headers).

## Potvrđena završna konfiguracija u cloud-u

| Parametar / granica | Stanje obe funkcije |
| --- | --- |
| OTP_ENABLED | false |
| OTP_PUBLIC_ENABLED | false |
| OTP_SEND_ENABLED | false |
| OTP_TEST_EMAILS | prazno |
| OTP_DIAGNOSTICS_WINDOW_START | prazno |
| OTP_TRUSTED_PROXY_HOPS | 0 |
| OTP_DAILY_LIMIT | 500 |
| Identitet | otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com |
| Runtime / memorija | Node.js 24 / 256 MiB |
| Minimalne / maksimalne instance | 0 / 2 po funkciji |
| Paralelni zahtevi / timeout | 10 / 60 sekundi |
| Status | ACTIVE |

Request funkcija koristi samo OTP_HMAC_SECRET i OTP_TURNSTILE_SECRET verzije 1; verify funkcija samo OTP_HMAC_SECRET verziju 1. Završna provera Google dozvola i metapodataka tajni ima status verified, bez blokada ili preostalih akcija. Operator nije čitao njihove vrednosti niti kreirao nove verzije ili trajne AWS ključeve.

Na svih šest URL-ova dva puta je potvrđen 503/unavailable bez autentifikacije i bez IP odgovora posle završne objave. Udaljena prazna vrednost dijagnostičkog prozora potvrđena je dodatno, pa rezultat ne zavisi od isteka 30 minuta. Običan poslovni POST na obe frontend adrese takođe vraća 503/unavailable.

## Očuvanje postojeće aplikacije

Inventar pre objave obuhvatio je svih 17 postojećih funkcija u europe-west3 i us-central1. Posle objave ostaje istih 17 plus dve nove OTP funkcije. Postojeće funkcije zadržale su ACTIVE status, vreme poslednje izmene i konfiguraciju. Za dva Firestore triggera Google vraća eventFilters u promenljivom redosledu: upoređen je potpuni odgovor uz isprobavanje samo redosleda tog niza, čime je potvrđeno da nema promene vrednosti ili drugih polja. Ostalih 15 potpunih otisaka odgovora poklopilo se neposredno.

Javni sajt je završnom read-only proverom vratio 200 i HTML. Objavljivanje nije menjalo postojeći frontend ili SSR server. Ova provera ne zamenjuje budući test stvarne OTP forme.

## Poboljšanja postupka objave

Prvi pokušaj stao je pre cloud kreiranja zbog 10-sekundnog lokalnog roka Firebase analize koda. Za naredne uske objave procesno je postavljen FUNCTIONS_DISCOVERY_TIMEOUT=120 prema [zvaničnom Firebase uputstvu](https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization). To ne menja 60-sekundni rok funkcije ili ponašanje aplikacije.

Drugi pokušaj stao je pre upload-a jer pinned Firebase CLI u non-interactive režimu traži eksplicitne vrednosti svih nesecret parametara, čak i kada SDK navodi default. Dopisani su OTP_SEND_ENABLED=false i prazni OTP_TEST_EMAILS u ignorisani projektni dotenv, uz backup i potvrdu da ostale stavke nisu promenjene. Preflight sada proverava kompletnu deklarisanu listu parametara, uključujući postojeće poslovne parametre, da se isti propust otkrije pre naredne objave.

Alat sada prikazuje poznate, sanitizovane auth/API/filesystem kodove grešaka, bez odgovora provajdera, tokena, putanja ili proizvoljnih poruka. Probe i zatvaranje dopunjeni su proverom sva tri tipa javnih Google adresa. Run adrese prihvataju se samo iz strogo proverenih metapodataka dve konkretne funkcije; proizvoljne rute odbijaju se pre prosleđivanja operatorovog tokena.

## Testovi i trag provere

Danas su prošli:

- Cloud alati i bezbednosne politike: 163/163, uključujući nove provere parametara, sanitizacije i javnih aliasa.
- OTP runtime, HTTP i dijagnostičke granice: 26/26.
- Functions TypeScript build i oba kontrolisana cloud deploy-a.
- Stvarna autentifikovana IP provera: 30/30.
- Dve završne provere svih šest dijagnostičkih adresa i dve provere zatvorenog poslovnog OTP-a.
- Google IAM/secret metadata preflight, završna konfiguracija, očuvanje postojećih funkcija i git diff --check.

Preostali lokalni OTP servis, frontend/widget/transport, emulatori, desktop/mobilni browser, poslovna bezbednost i SSR manifest prošli su u prethodnoj celini; danas nisu ponavljani bez promene njihovog izvora. Prethodnih 394 imenovana testa i 11 novih testova čine 405 različitih testova, ali taj zbir ne predstavlja jedno današnje ponovno izvršavanje svih suite-ova.

Sanitizovani cloud dokazi i privatni backup-i čuvaju se u ignorisanom .firebase/otp-ingress direktorijumu: probe.json, inventory-before.json, inventory-after.json, runtime-after.json, existing-functions-verification.json i final-verification.json. Izveštaji ne sadrže IP adrese, OAuth tokene ili vrednosti serverskih tajni. Git commit i push nisu izvršeni.

## Trošak ove celine

OTP provere nisu pokretale SES slanje, OTP Firestore transakcije ili Auth naloge. Ova celina ima 30 dijagnostičkih invokacija, 12 završnih provera zatvaranja, dva poslovna odbijena POST-a, Google pozive za identitet/metapodatke i cloud build/artefakte. Funkcije imaju minInstances=0. Dnevni limit od 500 mejlova je aplikacijska granica za budući OTP tok; ne ograničava ručno SES slanje ili sve Firebase troškove. Ovim izveštajem se ne tvrdi da je svaki cloud trošak nula.

## Sledeća celina i vlasnikov deo

Sledeća celina je kontrolisani test stvarne AWS/Google/Turnstile veze uz jednu odobrenu adresu vlasnika: upis potvrđenog proxy koraka, ograničeni serverski owner režim, stvarno SES slanje i prijava Firebase namenskim tokenom. Frontend podrazumevano zadržava magic link; javni OTP ostaje isključen. Potrebno je proveriti i odgovarajuće produkcijske indekse/održavanje OTP evidencije u planu te celine pre objave owner preview-a.

Operator prvo priprema precizan plan i testni ulaz. Vlasnik zatim otvara taj ulaz, prolazi stvarni Turnstile, proverava prijem mejla i unosi kod; time potvrđujemo kompletan realni tok. U ovoj završenoj IP celini vlasnik nema dodatna podešavanja u AWS-u, Zoho-u ili Cloudflare-u. Stvarni STS/SES poziv iz novog runtime-a, Turnstile uparivanje ključeva i udaljeno potpisivanje Firebase tokena još nisu testirani i ne predstavljaju već potvrđen rezultat.
