# Kontrola troškova — produkcijsko izdanje

Objava završena 24. septembra 2026. po odobrenju vlasnika. Poslovni upisi su ponovo otvoreni, periodično održavanje je uključeno. Tehničke i automatizovane poslovne provere produkcije su prošle. Vlasnik je potvrdio da ručne provere na produkciji prolaze i odobrio Git commit/push.

## Prekid i bezbedan nastavak

Prvi pokušaj 18. septembra uspešno je zatvorio poslovne upise i objavio indekse, ali je Firebase CLI odbio naredni deploy bez potvrde uključivanja retry politike notifikacija. Usage limit je potom sprečio završnu proveru. Pri nastavku 24. septembra na produkciji je zatečeno prethodno Hosting/API izdanje sa zatvorenim poslovnim upisima. To znači da u zatečenoj konfiguraciji registracija profila i poslovne izmene nisu bile omogućene, iako je javni sajt bio dostupan.

Pre nastavka upoređeni su stvarni Cloud Functions/Hosting/rules metapodaci, 175 kontrolnih vrednosti izvora i artefakata i hash vrednosti postojećih podataka. Nisu nađene neočekivane promene. Objava je nastavljena uz potvrdu već odobrene i testirane retry politike; nije ponavljano brisanje/migracija niti pravljen novi build aplikacije. Firebase predeploy ponovo je kompajlirao isti API izvor i proverio SSR zaključane zavisnosti.

Pouka za sledeću objavu: sve CLI potvrde proveriti pre zatvaranja upisa, a pri svakom prekidu prvo očitati stvarno cloud stanje. Uspešan početak komande nije dokaz završenog deploy-a. Ako je objava zaustavljena pre bilo kakve promene API/rules/UI, vratiti prethodne upise čim je to moguće; pri delimičnoj promeni prvo završiti ili vratiti usklađeno izdanje.

## Objavljeno stanje

- Build `3dbbf1b-dirty`; oznaka je očekivana jer odobrena implementacija još nije komitovana.
- Hosting verzija `sites/majstorsada-b2ad4/versions/81c930b78a1be5ef`; prethodna verzija `sites/majstorsada-b2ad4/versions/422cc4886d2696d8`.
- Svih 17 funkcija je ACTIVE na Node 24. Nove su `cancelJob`, `dismissJob` i `maintainJobs`. Postojeći runtime servisni nalozi, CPU/memorija, timeout i ograničenja instanci ostali su isti. Minimum je nula; poslovne funkcije imaju maksimum tri instance, održavanje jednu.
- Održavanje: svakih deset minuta, concurrency 1, timeout 300 s, 256 MiB. Scheduler stvarno izvršava funkciju, bez IAM greške. PUBLIC_WRITES_ENABLED i JOB_MAINTENANCE_ENABLED su uključeni gde su potrebni; lokalna produkcijska konfiguracija je usklađena.
- Svi potrebni indeksi potvrđeni su READY pre objave; objavljena Firestore/Storage pravila tačno odgovaraju izvoru.
- API health, Hosting manifest i SSR/javne stranice potvrđuju isti build, bez demo konfiguracije.
- Čuvanje deployment artefakata i dalje je sedam dana u europe-west3 i us-central1; nije uvedena stalno upaljena instanca.

## Provere na produkciji

1. Prošlo je 15 HTTP/tehničkih provera: verzije, runtime, pravila, autentifikacija i CORS. Neautentifikovani poslovni pozivi se odbijaju.
2. Prošlo je 10 browser provera: javne stranice sa očuvanim SEO podacima, prijavne forme, anonimna preusmeravanja i mobilna širina. Nema browser/hydration grešaka ni horizontalnog prelivanja.
3. Stvarni push service worker se registrovao na root scope i aktivirao bez greške. Nije tražena dozvola niti slata stvarna notifikacija.
4. Privremeni produkcijski nalozi prošli su registraciju bez mešanja uloga, slanje/idempotentni retry, upload/finalizaciju, autorizovane fotografije, zabranu prihvatanja bez žetona, tačno jedno zaduženje, dodeljeni kontakt, završetak i ocenu. Provereni su novi feed/history/review indeksi, dva zahteva u 24 sata, odbijanje trećeg i idempotentno otkazivanje sa sedmodnevnim rokom slika.
5. Prvi Scheduler dry-run nije pronašao postojeće kandidate i nije imao greške. Nakon uključivanja, namenski test je potvrdio stvarno brisanje zatvorene fotografije, očuvanje prihvaćene fotografije, istek nedovršenog slanja i očuvanje kontakata.
6. Uklonjeni su svi privremeni test-nalozi, dokumenti, kontakti, odbijanja i aktivni test-objekti u Storage-u. Soft-delete politika može zadržati male obrisane test-objekte sedam dana.
7. Završno poređenje potvrđuje nepromenjene prethodne podatke: jedan admin, tri klijenta, dva majstora, tri završena posla, četiri fotografije i nula staging objekata. To poređenje obuhvata pregledane profile/poslove i navedene Storage prefikse, ne svaku moguću kolekciju projekta.
8. Pregled ERROR logova do 09:08 UTC prikazuje samo očekivani HTTP 503 kojim je test potvrđivao zatvoren write gate; nema neočekivanih grešaka u tom vremenskom prozoru.

Testovi nisu slali pravi email, SMS ili push: korišćeni su rezervisani example.invalid nalozi, test-profili su bili nedostupni i pre kreiranja je potvrđeno da nema stvarnih dostupnih primalaca za testiranu struku. Stvarnu dostavu push-a proverava vlasnik na svom uređaju.

Tri ranija završena test-posla i njihove četiri fotografije zadržani su. Nemaju novu oznaku roka fotografija, pa nisu retroaktivno uključeni u novo čišćenje. Nije bilo potrebe za migracijom; eventualno uklanjanje tih konkretnih test-podataka je zaseban korak.

## Budžet

Billing nalog koristi PLN. Projektni mesečni budžet je 76,06 PLN, sa pragovima 25%, 50% i 100%: približno 19,02 / 38,03 / 76,06 PLN. To odgovara dogovorenim 5 / 10 / 20 USD po NBP kursu 3,803 od 17. septembra, korišćenom pri podešavanju 18. septembra. Pragovi su fiksni u PLN i ne menjaju se automatski sa kursom. Podešavanje je ponovo potvrđeno 24. septembra.

Raniji budžet celog billing naloga od 20 PLN sa pragovima 50/90/100% sačuvan je; novi budžet je ograničen na projekat. Billing Budget API je uključen. Email upozorenja koriste podrazumevane billing primaoce; stvarna dostava upozorenja nije izazivana testnom potrošnjom. Nema automatskog gašenja niti tvrdog limita naplate.

Izvor konfiguracije je `ops/cost-control-budget.json`; koristi važeće REST v1 polje `notificationsRule`. Valuta budžeta mora odgovarati billing nalogu. [Budget API](https://docs.cloud.google.com/billing/docs/reference/budget/rest/v1/billingAccounts.budgets), [NBP USD API](https://api.nbp.pl/api/exchangerates/rates/a/usd/2026-09-17/?format=json).

## Provera vlasnika

- Osvežiti sajt i otvoriti oba panela, po mogućnosti i na telefonu. Proveriti prethodne poslove i istoriju; po tri zapisa, dodatni na klik kada postoje.
- Poslati jedan zahtev sa fotografijom. Kao odgovarajući majstor proveriti fotografiju, skriven telefon pre prihvatanja, jedan potrošen žeton i telefon posle prihvatanja. Završiti i oceniti posao.
- Po želji poslati drugi zahtev nakon najmanje minuta i otkazati ga. Treći novi zahtev u istih kliznih 24 sata treba da bude odbijen. Otkazivanje ne vraća dnevnu kvotu.
- Proveriti stvarni push na uređaju sa uključenim obaveštenjima i aplikacijom u pozadini.
- Za istek i brisanje nije potrebno ručno čekati 24 sata/sedam dana radi odobravanja: granice su pokrivene lokalnim testovima i ograničenom produkcijskom probom. Prilikom normalnog korišćenja pratiti prvi stvarni ciklus.

## Dokazi i povratak

Ignorisani `.firebase/cost-release/` sadrži prethodne cloud metapodatke, 14 prethodnih ZIP izvora, manifest 175 hash vrednosti, snimke stanja pri nastavku, deploy logove, otvoreni/zatvoreni smoke test, browser/worker rezultate, Scheduler dry-run i retention probe, budžetski zapis i završnu proveru logova. Dodatni test-cleanup izveštaji su `.firebase/cost-smoke-closed.json` i `.firebase/cost-smoke-open.json`.

Povratak mora koristiti usklađene prethodne Hosting/SSR/API/rules artefakte, sa isključenim održavanjem i kontrolisanim write gate-om. Aditivne indekse i nove podatke ne brisati tokom povratka. Posle uspešne ručne provere vlasnik je odobrio Git commit/push sa nazivom `feat(jobs): add lifecycle policies and optimize dashboard loading`.
