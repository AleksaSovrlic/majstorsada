# Pokretanje aplikacije i obaveštenja — izveštaj

Datum: 17. septembar 2026. Implementacija je na grani `codex/startup-notifications` i objavljena je po odobrenju vlasnika. Produkcijske provere su prošle; detalji su u [startup-release.md](startup-release.md). Vlasnik je potvrdio proveru uživo i prijem stvarne push notifikacije, i odobrio Git commit/push.

## Odluka i obim

Realizovana je prva dogovorena etapa: priprema obaveštenja više ne blokira aktiviranje aplikacije i headera. Sačuvano je postojeće čekanje na obnovu Firebase prijave i serversku potvrdu uloge. Šira promena kojom javna stranica postaje interaktivna pre završetka provere naloga nije uvedena.

`app/plugins/messaging.client.ts` odmah obezbeđuje FCM interfejs, a proveru podrške, registraciju service worker-a i sinhronizaciju tokena pokreće u pozadini. Istovremeni pozivi dele inicijalizaciju i sinhronizaciju za isti Firebase User objekat. Greška ostaje ograničena na obaveštenja; sledeći eksplicitni poziv može ponovo pokušati neuspelu inicijalizaciju/sinhronizaciju. Nema tajmera za periodično ponavljanje ili novih polling upita.

U `app/pages/majstor/dashboard.vue` učitavanje sopstvenih poslova počinje pre poziva sinhronizacije obaveštenja. Nuxt zavisnost se hvata pri setup-u, umesto ponovnog uzimanja nakon asinhronog čekanja. To uklanja povezano čekanje koje bi inače ostalo unutar panela.

Nisu menjani header izgled, auth store, provere ruta, serverski API, pravila pristupa, Firebase konfiguracija, zavisnosti, service worker za pozadinske poruke ili poslovni model.

## Merenje

Pre izmene je testiran prethodni kompajlirani build (`e4b6f8b-dirty`, isti ranije objavljeni izvor), a posle izmene novi lokalni produkcioni build (`e56f621-dirty`). Pregledač: headless Edge; tri sveža browser konteksta po scenariju u svakoj verziji. Firebase browser SDK stvarno obnavlja sintetički nalog iz IndexedDB-a. Auth i API odgovori su lokalne simulacije, spoljni upisi su blokirani. Registracija service worker-a u ovom merenju simulira spor/neuspešan servis; uspešna inicijalizacija i upis tokena pokriveni su zasebnim testovima životnog ciklusa.

Medijane, milisekunde:

| Simulirani uslov | Header od početka navigacije, pre | Posle | Od odgovora o ulozi do headera, pre | Posle |
| --- | ---: | ---: | ---: | ---: |
| Bez dodatnog kašnjenja | 752,5 | 539,0 | 84,6 | 61,6 |
| Obaveštenja kasne 2 s | 2702,0 | 608,9 | 2081,1 | 74,4 |
| Potvrda uloge kasni 1 s | 1553,9 | 1808,1 | 68,4 | 70,3 |
| Uloga kasni 1 s i obaveštenja 2 s | 3820,3 | 1813,9 | 2087,0 | 67,0 |

Dokazano poboljšanje je uklanjanje zavisnosti od trajanja pripreme obaveštenja: njen zastoj od 2 s više ne odlaže header. Preostalo vreme posle odgovora o ulozi bilo je približno 60–100 ms. Provera identiteta/uloge i dalje prethodi aktiviranju aplikacije u svim probama.

Scenario sa sporom potvrdom uloge nije ubrzan ovom promenom. Ukupna vremena uključuju pokretanje SDK-a, raspoređivanje procesa, lokalni SSR i učitavanje resursa; varirala su i u pojedinim probama bila veća posle izmene. Tri ponavljanja nisu produkcioni p95, rezultat za mobilni uređaj ili dokaz da svaka poseta postaje brža. Ove brojke ne mere stvarno trajanje produkcionog `resolveAccount` niti cold start-a Cloud Functions.

U svih 12 završnih proba zabeležen je tačno jedan `resolveAccount` poziv po novom učitavanju. U šest proba sa usporenim obaveštenjima korisnik je zatim izabrao vodoinstalatera i otvorio `/zahtev?tip=vodoinstalater`: izabrana usluga je sačuvana, forma otvorena, dodatna provera uloge nije pokrenuta i nije bilo browser izvršnih grešaka.

## Provere

- `npm run test:startup`: 27/27. Usporena podrška i registracija, čekanje aktivacije workera, zajednički paralelni pozivi, prolazne greške i ponovni pokušaj, nedozvoljena uloga, odsustvo prijave, zabrana/opoziv dozvole za obaveštenja, odjava/promena naloga tokom sinhronizacije, deduplikacija tokena i prijem foreground/background poruka kroz simulirane transporte. Test se izvršava nad stvarnim izvornim kodom dodatka, dashboard mounted callback-a i service worker-a.
- `npm run test:security`: 98/98 na demo emulatorima, uključujući prava pristupa, privatne kontakte/fotografije, upise poslova, paralelna prihvatanja i jedinstveno zaduživanje tokena.
- `npm run test:build`: 13/13 provera manifest/lockfile/runtime zaštita.
- `npm run build`: prošao; 105 SSR direktnih zavisnosti instalirano iz postojećeg pregledanog lockfile-a. Nema promene zavisnosti. Postojeća npm upozorenja o tranzitivnim paketima ostaju deo prethodno dokumentovanog dependency stanja.
- `npm run test:startup:browser`: 12/12 proba novog kompajliranog build-a i šest prelazaka na formu tokom pripreme obaveštenja; bez izvršnih grešaka.
- `npm run test:ssr`: četiri javne stranice, očuvan SEO/schema/sitemap, 12 privatnih/noindex ruta, mobilna širina i hidratacija bez grešaka; potvrđeni postojeći SSR runtime limiti.
- `npm run test:e2e`: prošao. HTTP CORS/metode/autentifikacija/ograničenje veličine zahteva; browser registracija i oporavak, email link na emulatoru, izgubljeni create odgovor i oporavak fotografija, autentifikovane fotografije, privatnost pre prihvatanja, zabrana prihvatanja bez tokena, admin dodela, jedno zaduženje, kontakt posle prihvatanja, završavanje/ocena, greška i oporavak provere uloge, preusmeravanja između uloga i odjava u drugim tabovima. Bez izvršnih/hydration grešaka. Produkcioni artefakt je posle demo provere ponovo potvrđen kao `e56f621-dirty` sa produkcionim projektom i bez demo projekta.

Prilikom pripreme browser provere ispravljeni su isključivo problemi testnog koda: init skripta se sada izvršava samo u ciljnom origin-u, a izbor usluge proverava odgovarajuće dugme umesto nepostojećeg select polja. Generički Windows server helper ostavljao je SSR potomke; provereni test procesi su ugašeni, a namenski runner proverava slobodan port i zatvara sopstveno stablo procesa. Konačni browser/SSR testovi su ponovljeni sa tim runner-ima.

## Funkcije, troškovi i granice

Korisnik može koristiti aplikaciju dok se pripremaju obaveštenja. Na uređaju koji tek registruje push, spremnost obaveštenja i dalje zavisi od završetka registracije/aktivacije/tokena. Postojeći registrovani service worker zadržava svoj mehanizam prijema poruka. Nije dodat namerni zastoj za obaveštenja: priprema počinje tokom pokretanja dodatka, a aplikacija je više ne čeka.

Registracija push tokena i čišćenje zastarelih tokena zadržavaju postojeću strukturu upisa i upita. Istovremeni pozivi za isti nalog dele rad; test potvrđuje jedan upis i jedan dedupe upit u tom slučaju. Nema novih Cloud Functions, dodatnih account lookup poziva u proverenom toku, polling-a, SMS-a ili povećanja min/max instanci. Nema novih obaveznih Blaze resursa. Naknadna zasebna otvaranja panela mogu ponovo sinhronizovati token kao i ranije; nije uveden trajni keš koji bi skrivao osvežavanje tokena.

Testovi ove izmene nisu pravili produkcijske naloge/poslove niti slali pravi email, SMS ili push. Lokalni adapteri i emulatori ne dokazuju isporuku preko Google FCM infrastrukture i OS-a na stvarnom telefonu. To ostaje obavezna ručna provera pri odobrenoj objavi: postojeći prijavljen majstor sa dozvoljenim obaveštenjima, novi uređaj koji prvi put daje dozvolu, prijem obaveštenja sa aplikacijom u pozadini i prikaz poslova dok se obaveštenja pripremaju.

## Objavljivanje i povratak

Sve navedene lokalne automatizovane provere su prošle. Vlasnik je zatim odobrio produkcijsku objavu, koja je završena uz uspešne live provere; vidi [startup-release.md](startup-release.md). Vlasnik je naknadno potvrdio proveru uživo i stvarni prijem push notifikacije, i odobrio Git commit/push.

Posle odobrenja primeniti postojeći kontrolisani postupak objave i provere usklađenih build identiteta. Poslovni API i pravila pristupa nemaju funkcionalne izmene; postojeća deploy skripta ipak objavljuje ceo usklađeni skup. Odraditi proveru na stvarnom uređaju. Sama objava može imati uobičajenu Cloud Build/artefakt potrošnju, odvojeno od potrošnje aplikacije tokom korišćenja. Povratak je prethodni usklađeni frontend/SSR build; nema migracije baze, naloga, fotografija ili poslova.

Naziv commita: `perf(startup): decouple notification setup from app loading`.

Sirova merenja i logovi ostaju lokalno, ignorisani u `.firebase/startup/`. Ponovljivi testovi i uputstvo su u `tests/startup/`.
