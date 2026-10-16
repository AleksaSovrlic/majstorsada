# Dijagnoza: IndexedDB greška pri dovršavanju OTP prijave

Datum: 15. oktobar 2026. Status: analiza i izolovana reprodukcija; aplikacija, produkcija i Git istorija nisu menjani.

## Nalaz

Prva slika prikazuje Firebase `auth/internal-error` pri IndexedDB `transaction` pozivu, jer se konekcija zatvara. To je problem lokalnog persistence-a prijave u browseru. Pun disk je moguć okidač; pri proveri C: disk je imao oko 1 GiB slobodnog prostora. Ni taj podatak ni screenshot ne dokazuju tačan uzrok zatvaranja konekcije. SDK i browser lifecycle takođe mogu zatvarati konekcije.

Druga poruka „Nalog je promenjen. Osvežite stranicu.” ima konkretno objašnjenje u našem kodu: bezbednosna provera postojeće sesije aktivira se i kada Firebase delimično postavi korisnika, a zatim odbije prijavu zbog greške pri čuvanju. To ne dokazuje stvarnu promenu identiteta.

## Potvrđen redosled

Instalirano: Firebase 12.19.0, @firebase/auth 1.13.6.

1. Naš OTP tok dobije custom token i postavi `completionPending` pre Firebase prijave. Zato input koda nestane i dugme postane „Dovrši prijavu”.
2. SDK `directlySetCurrentUser` prvo postavlja `currentUser`, zatim čeka persistence upis. Ako upis padne, baca `auth/internal-error` i ne vraća prethodni `currentUser`. Auth listener obaveštenje dolazi tek posle uspešnog upisa.
3. `signInWithCustomToken` zato može odbiti Promise nakon delimičnog postavljanja korisnika. Naš `signedInUid` ostaje null, a custom token ostaje samo u memoriji.
4. Sledeći klik pokušava dovršavanje istog toka. U `useClientOtp.ts:167` nailazi na postojeći `currentUser` i prikazuje „Nalog je promenjen”. Nova OTP verifikacija tada se ne šalje.

Relevantna mesta: `app/composables/useClientOtp.ts:164–181,193–208`, `app/plugins/10.firebase.ts:23–29`, SDK `node_modules/@firebase/auth/dist/esm/index-4NFEPWkC.js:2908–2921,3170–3191,6061–6072`. Plugin koristi IndexedDB persistence; njegov sinhroni try/catch oko inicijalizacije ne obrađuje ovu kasniju async grešku pri prijavi.

## Reprodukcija i granice

U izolovanom VM testu stvarnog composable-a mock SDK je postavio očekivani `currentUser`, pa bacio identičnu persistence grešku. Dobijen je isti sled poruka. Reprodukcija je prošla i sa Auth observer obaveštenjem i bez njega. U oba slučaja drugi klik nije slao dodatni mejl ili ponavljao backend OTP proveru, ali nije ni nastavio navigaciju.

Kontrola u kojoj SDK odbija prijavu pre promene `currentUser` uspeva na sledećem kliku. Postojeći retry test u `tests/otp/frontend.test.mjs:115–128` pokriva tu kontrolu; delimična mutacija pre SDK odbijanja nije bila pokrivena.

Ovo potvrđuje nedostatak oporavka pod navedenim SDK ishodom, uz direktnu potvrdu tog redosleda u instaliranom SDK-u. Nije izvedeno namerno punjenje diska ili kvarenje pravog browser profila, niti je pročitan korisnikov Auth storage.

## Produkcijska provera

Javni manifest ima isti frontend identifikator `35a47f7-dirty-83ec4382-820b-4d94-af59-6f08af1dae1e`. OTP revizije su i dalje `requestclientotp-00006-jun` i `verifyclientotp-00006-dim`, sa datumom poslednje promene 11. oktobra. `resolveAccount` je i dalje revizija iz 24. septembra. Nije potvrđena nova objava koja bi prethodila ovom incidentu.

U vremenski odgovarajućim metapodacima dva OTP slanja i dve verifikacije imaju HTTP 200. Prva verifikacija je zabeležena u 22:58:00, druga u 23:00:52 po Europe/Budapest. Posle druge sledi uspešan `resolveAccount` u 23:00:55. Za tri relevantna servisa u pregledanom prozoru nema ERROR zapisa. Browser persistence greška se ne očekuje u ovim serverskim logovima. Podudaranje sa pokušajima zasniva se na vremenu i korisnikovom opisu; mejl, kod, token i telo zahteva nisu čitani.

CSP/GPU/font poruke na slici nisu dokaz uzroka prikazane Firebase IndexedDB greške. Nisu menjana CSP ili Turnstile pravila radi tih poruka.

## Preporuka

Dopuniti pre marketinga obradu ovog delimičnog Auth stanja, jasnu poruku i bezbedan put nastavka ili ponovnog otvaranja prijave. Poseban regresioni test treba da pokrije currentUser-assignment-then-rejection, dugotrajan storage kvar, stvarnu promenu naloga/drugi tab i očuvanje postojećeg OTP toka bez automatskog dodatnog slanja.

Ne uklanjati zaštitu od promene naloga i ne usvajati proizvoljan `currentUser` kao dokaz uspešnog OTP-a. Oporavak mora vezati identitet za konkretni OTP pokušaj i jasno razlikovati dovršenu prijavu od neuspešno sačuvane sesije. Predlog ne podrazumeva promenu Blaze limita ili plaćene instance.

Korisniku je korisno da oslobodi prostor na disku i ponovo pokrene Chrome. Nije potrebno brisanje Firebase naloga ili poslova. Potreban obim i tačan algoritam izmene ostaju za narednu odobrenu celinu; ovom analizom nisu implementirani.

Privatni dokazi su u `.firebase/otp-idb-recovery-repro-result.json`, `.firebase/otp-idb-recovery-repro.generated.mjs` i `.firebase/otp-idb-diagnostic-2026-10-15/production-metadata.json`; Git ih ignoriše.

Primarni izvori: [Firebase SDK izvor za korišćenu verziju](https://github.com/firebase/firebase-js-sdk/blob/firebase@12.19.0/packages/auth/src/core/auth/auth_impl.ts), [Firebase Auth persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence).
