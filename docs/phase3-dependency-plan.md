# Celina 3 — održavanje zavisnosti i ponovljiv produkcioni build

Status: ŠIRI PLAN IMPLEMENTIRAN I OBJAVLJEN 13. septembra 2026. po odobrenju vlasnika. Automatske produkcione provere prošle; vlasnik je potvrdio ručnu proveru i odobrio Git commit/push. Videti [phase3-release.md](phase3-release.md).
Osnova: commit e4b6f8b951d24b2e80628684562242d67b27656a, prihvaćena produkcijska celina 2.
Pregled: 11. septembar 2026. Verzije i audit nalazi su snimak na dan pregleda.

## Svrha i poslovne granice

Ukloniti poznate probleme u bibliotekama i osigurati da se pri objavljivanju instalira pregledan skup zavisnosti. Korisnik treba da zadrži isti tok prijave, objavljivanja i prihvatanja posla. Ovo priprema stabilnu osnovu za naredne celine: kontrolu zloupotrebe i troškova, zatim OTP.

Obavezni uslovi ostaju:

- Javno registrovan majstor počinje sa nula tokena i postojećim postupkom administratorske provere.
- Majstor sa nula tokena vidi odgovarajuće poslove i fotografije, ali ih ne prihvata bez tokena.
- Telefon klijenta otkriva se dodeljenom majstoru nakon prihvatanja. Email klijenta se ne prikazuje majstoru ni nakon prihvatanja.
- Ponovljeno prihvatanje istog posla ne skida još jedan token; konkurentna prihvatanja ne dodeljuju isti posao dvojici majstora.
- Oporavak posle prekinute registracije/objave, pristup fotografijama i odjava kroz više tabova ostaju očuvani.
- Nema migracije ili brisanja poslova, naloga, uloga ili tokena. Ranije odobrenje za brisanje konkretnih test poslova ne važi za nove podatke.

## Šta je pregled pokazao

Postoje tri zasebna stabla: korenski paket za Nuxt i alate, `functions/` za API i generisani `.output/server/` za SSR. Neki serverski paketi ulaze direktno u kompajlirani kod, pa audit samo SSR foldera nije kompletna provera produkcije. Takođe, paket označen kao razvojna zavisnost u korenu može završiti u SSR-u.

| Audit | Ukupno prijavljenih paketa | Critical | High | Moderate | Low |
| --- | ---: | ---: | ---: | ---: | ---: |
| Korenski paket, uključujući alate | 74 | 9 | 27 | 31 | 7 |
| API, bez razvojnih zavisnosti | 18 | 1 | 3 | 13 | 1 |
| Generisani SSR, bez razvojnih zavisnosti | 18 | 2 | 3 | 11 | 2 |

Brojevi se preklapaju i ne sabiraju se. Ovo nisu potvrđeni napadi niti toliko nezavisnih iskoristivih propusta na sajtu. Potrebno je za svaki nalaz proveriti put zavisnosti, uslove iskorišćavanja i dostupnu ispravku. Među pogođenim porodicama su Nuxt/Nitro/h3, protobufjs, XML parser, gRPC i razvojni alati.

API trenutno zaključava Firebase Admin 13.10.0 i Functions 7.0.2; korenski paket/SSR imaju Admin 13.6.0 i Functions 7.3.2. Razlika nije sama po sebi dokaz greške, ali otežava dosledno održavanje.

Postojeća SSR zaštita čuva direktne verzije i proverava prisustvo lockfile-a. Međutim, `tools/assert-ssr-deps.mjs` odbija samo vrednost `latest`, a ne sve raspone verzija. `tools/deploy-prod.ps1` ponovo generiše SSR lockfile pomoću `npm install`; taj lockfile nije u Git-u. Zato postojeću zaštitu treba dovršiti, naročito za posredne zavisnosti. U ranijem opštem planu izraz „reproducible SSR lockfile” bio je širi od onoga što sadašnja automatizacija zaista garantuje.

## Predložene grupe verzija

Ovo su provereni kandidati iz registra, a ne već testirana kombinacija. Konačan izbor zavisi od čiste instalacije, kompatibilnosti i rezultata testova nakon odobrenja.

| Grupa | Predlog |
| --- | --- |
| Runtime | Zadržati Node 24 i postojeće regione/podešavanja funkcija |
| Firebase server | Admin 14.4.0 i Functions 7.3.2 uskladiti u API i korenskom paketu |
| Firebase browser | Ažurirati u okviru grane 12, kandidat 12.19.0 |
| Nuxt | 4.2.2 → 4.5.2, kompatibilni Nitro 2.13.4 i Vue 3.5.42 |
| Routing i SEO | Vue Router 5, Unhead 3, sitemap 8.5.0, robots 6.2.2 i schema-org 6.3.1 kao povezana grupa |
| Stanje i izgled | Zadržati Pinia 3 sa @pinia/nuxt 0.11.3 i postojeći Tailwind pristup |
| Lokalni alati | Firebase CLI 15.30.0; Java 21 za emulatore, izolovano od sistemske Java instalacije |

Nuxt 4.5 uvodi glavne verzije povezanih paketa, uključujući Vite 8 i Unhead 3. Zbog toga ovo zahteva proveru build-a, rutiranja i SEO-a, iako ostajemo na Nuxt-u 4. Izvor: https://github.com/nuxt/nuxt/releases/tag/v4.5.0

Vue Router 5 zadržava uobičajeni javni API, ali integracije generisanja ruta treba uskladiti sa Nuxt-om. Izvor: https://router.vuejs.org/guide/migration/v4-to-v5

Firebase Admin 14 menja podržane Node verzije, uklanja stare API-je i menja obradu grešaka. Postojeći kod koristi modularne importe i Node 24, što smanjuje obim prilagođavanja, ali ne zamenjuje testove. Izvor: https://github.com/firebase/firebase-admin-node/releases/tag/v14.0.0

## Redosled implementacije nakon odobrenja

### 1. Referentno stanje i alati

Zabeležiti referentni commit, tri audita, verzije alata i reprezentativne javne HTML/SEO rezultate. Početi na zasebnoj `codex/` grani. Prethodnih 96 uspešnih testova i prihvaćena produkcija predstavljaju polazni dokaz, ne dokaz ispravnosti budućih verzija.

Obezbediti Java 21 za procese emulatora bez zamene globalnog sistemskog PATH-a. Prebaciti deploy skriptu na lokalni, zaključani Firebase CLI, kao što test runner već radi. Proveriti Windows upravljanje procesima, postojeći discovery workaround i izolaciju demo projekta. Zatim pokrenuti postojeće bezbednosne testove radi izdvajanja eventualnog problema novog test alata od promene aplikacije.

### 2. Firebase serverska grupa

Zajedno ažurirati Functions i Admin zbog deklarisanih međusobnih zahteva. Pregledati zaključane Google Cloud, protobuf i gRPC pakete. Prvo koristiti ispravke koje dolaze kroz podržane verzije roditeljskih paketa. Samo ako ostane konkretan problem razmotriti usko ograničen override sa obrazloženjem i testom kompatibilnosti.

Posebno proveriti Express 5 ponašanje koje dolazi kroz noviji Functions SDK: parsiranje tela, CORS/preflight, HTTP statuse i JSON odgovore. Proveriti Admin greške i mapiranje autentikacije, Firestore transakcija, Storage uslovnih upisa i nevažećih push tokena. Ne slati stvarne poruke radi lokalnog testa; proveriti odgovore dobavljača kontrolisanim testovima.

Pokrenuti kompilaciju API-ja i bezbednosne testove pre naredne grupe.

### 3. Nuxt, browser SDK, routing i SEO

Ažurirati povezane pakete zajedno, ukloniti međusobno neusklađene zahteve i proveriti da nema konflikta ili neželjenog dupliranja Vue/Router/Pinia instanci. Uskladiti konfiguraciju samo gde promenjeni API to zahteva.

Pregledati middleware i navigaciju posle prijave, nastavak prekinute akcije, query parametre, direktno otvaranje privatnih ruta i dinamičke administratorske rute. Sačuvati statičko generisanje javnih stranica, sitemap i robots izlaz, canonical adrese, JSON-LD i postojeće ponašanje završne kose crte. Zadržati `zeroRuntime` sitemap ili odgovarajući podržani način da ostane statički.

Očuvati Firebase Nitro preset, Node 24 i dodatno registrovanje `compiled` hook-a posle preset hook-a. Ne prepisivati hook na način koji uklanja Firebase entry point. Ne uvoditi eksperimentalne Nuxt funkcije u ovoj celini.

### 4. Ponovljiv SSR paket

Uvesti pregledan manifest i lockfile u verzionisanom folderu, predlog `deploy/ssr/`. Posebna eksplicitna komanda osvežava taj par kada namerno menjamo zavisnosti.

Redovan build proverava da generisani manifest odgovara odobrenom manifestu, preuzima zaključano stablo i instalira ga pomoću `npm ci --omit=dev`. Izmena koja zahteva drugi skup zavisnosti zaustavlja pripremu izdanja dok se novi lockfile ne pregleda.

Pojačati proveru pre deploy-a: prisutan lockfile, saglasnost manifesta i lockfile-a, tačne direktne verzije bez raspona/tagova, očekivani Node runtime i entry point. Obuhvatiti i direktan `firebase deploy` put postojećom predeploy proverom. Testirati stvarne negativne slučajeve: nedostajući lockfile, promenjen manifest i pogrešan runtime. Ne uređivati generisani `.output` ručno kao trajno rešenje.

Ponovljivost ovde znači isto zaključano stablo npm zavisnosti; ne znači identične bajtove svakog build-a ili potpunu kontrolu nad upravljanim cloud okruženjem.

### 5. Završne provere i izveštaj

- Čista instalacija iz zaključanih datoteka, API kompilacija i produkcioni Nuxt build.
- Svih postojećih 96 bezbednosnih testova; dodatni testovi samo za nove rizike kompatibilnosti. Ne ublažavati očekivanja radi prolaska testa.
- Browser tokovi na emulatorima: registracija, prijava, objava i oporavak objave, fotografije, prihvatanje, konkurencija, jednokratno skidanje tokena, prikaz telefona i odjava.
- Pokretanje kompajliranog SSR-a lokalno i provera javnih ruta, odgovora, učitavanja i hydration grešaka. Postojeći emulator browser test koristi razvojni Nuxt i sam ne dokazuje ponašanje produkcionog build-a. Test okruženje mora ostati odvojeno od artefakata za stvarni deploy.
- Poređenje javnih URL-ova, SEO izlaza, statičkih stranica i noindex ponašanja privatnih ruta. Provera relevantnih kodiranih putanja i ruta obuhvaćenih framework ispravkama.
- Tri nova audita i pregled biblioteka ugrađenih u server bundle, uz razdvajanje alata od isporučenog koda.
- Poređenje veličine browser/server paketa i reprezentativnog vremena odgovora. Lokalna merenja nisu garancija cloud cold-start vremena.
- Pregled razlika koji potvrđuje da nisu dodati Firestore upiti/listeneri, pozivi pri renderovanju ili promene poslovnih dozvola.

Izveštaj navodi stvarne završne verzije, komande i rezultate, preostale nalaze i uticaj na objavljivanje. Cilj su uklonjene poznate critical/high ranjivosti u isporučenim putanjama. Preostali nalaz zahteva pojedinačno objašnjenje uslova, dostupnosti ispravke i odluke; nerazjašnjen relevantan ozbiljan nalaz blokira preporuku za produkciju. Nula nalaza nije dokaz apsolutne bezbednosti, niti unapred obećani ishod.

## Blaze i operativni uticaj

Projektovani dodatak broju aplikacionih Firestore čitanja, upisa i brisanja po istom poslovnom toku je 0. Nema novih periodičnih poslova, dodatnih funkcija ili minInstances; zadržavaju se postojeći regioni, memorija, maksimalni broj instanci i konfiguracija dostave fotografija.

To ne znači garantovano isti račun do poslednje decimale: biblioteke mogu promeniti CPU vreme, memoriju i veličinu prenosa. Zato proveravamo build i reprezentativno izvršavanje. Lokalni demo emulatorski testovi ne koriste produkcionu bazu. Kasniji deploy uključuje cloud build i skladištenje artefakata, a produkcijski smoke test nekoliko stvarnih operacija. Ovde ne uvodimo SMS ili novi plaćeni servis. Besplatne kvote i procena ukupnog obima saobraćaja ostaju predmet zasebnog modela potrošnje; dependency upgrade sam ne određuje broj besplatnih korisnika.

## Odobrenja, objavljivanje i oporavak

Odobrenje ovog plana pokriva lokalnu implementaciju, potrebne lokalne alate i testove opisane iznad. Posle njih sledi izveštaj pre produkcijskog objavljivanja i Git push-a.

Za naknadno odobrenu produkciju: pripremiti prethodni kompatibilni artefakt za povratak, proveriti stvarne verzije i runtime parametre, objaviti API/SSR/Hosting i proveriti usklađenost build identiteta. Firestore/Storage pravila i podaci ne zahtevaju promenu ovom celinom. Privremene produkcijske test podatke identifikovati zasebno i ukloniti samo te podatke. Zatim vlasnik proverava ključne korisničke tokove.

Povratak mora koristiti izdanje kompatibilno sa šemom i privatnošću celine 2. Ne vraćati staru implementaciju pre razdvajanja kontakta i fotografija. Ako je povratak nužan zbog regresije, evidentirati da privremeno vraća i prethodne dependency nalaze, pa pripremiti ispravku.

Ako podržana nadogradnja zahteva promenu poslovnog ponašanja, novu infrastrukturu ili bitno širi zahvat, taj deo se prvo obrazlaže korisniku. Sledeća celina ostaje zaštita od zloupotrebe i kontrola troškova, pa tek onda OTP.
