# Optimizacija pokretanja — produkcijsko izdanje

Objavljeno 17. septembra 2026. u 23:39 po vremenu Beograda/Budimpešte (21:39 UTC), po izričitom odobrenju vlasnika. Automatizovane provere objavljene verzije su prošle. Vlasnik je zatim potvrdio da provera uživo prolazi i da je stvarna push notifikacija stigla, i izričito odobrio Git commit/push.

## Objava

- Build: `e56f621-dirty`. Oznaka beleži da odobrene izmene još nisu komitovane; ne označava grešku pri objavi. Naknadni commit ne menja identitet već objavljenog artefakta.
- Hosting verzija: `sites/majstorsada-b2ad4/versions/422cc4886d2696d8`.
- Prethodna Hosting verzija za povratak: `sites/majstorsada-b2ad4/versions/3aa08e35fe6676e0`.
- Objavljen je upravo lokalni produkcioni artefakt koji je prošao startup, SSR i browser provere. Sačuvane su 102 SHA-256 kontrolne vrednosti izvora i artefakata; završna provera potvrdila je da nisu promenjeni tokom objave.
- Korišćen je zaključani Firebase CLI 15.30.0, isti ciljevi i predeploy provere kao u `tools/deploy-prod.ps1`: Firestore, Storage, Functions i Hosting. Ponovljen build Nuxt-a je izostavljen da bi se objavio tačno testirani artefakt; pregledani SSR lock, prisustvo/identitet artefakata, produkcijska konfiguracija i nepromenjenost pravila/konfiguracije/zavisnosti provereni su pre objave. Firebase predeploy je ponovo izgradio API i proverio SSR zavisnosti. Discovery je ostao file-based, kao u prethodnoj provereno uspešnoj objavi.
- Svih 14 postojećih funkcija ima novu aktivnu reviziju na Node 24. Poslovni API nije funkcionalno menjan; objavljen je u okviru postojećeg postupka usklađivanja verzije.
- Firestore i Storage ruleset identiteti ostali su isti. Nema migracije baze ili naloga.

## Rezultati na produkciji

- API health, Hosting manifest i SSR/prerender HTML potvrđuju isti build; nema demo konfiguracije.
- Svih 14 funkcija je aktivno. Očuvani su regioni, runtime servisni nalozi, CPU/memorija, ingress, timeout, concurrency i ograničenja instanci. Minimum je 0, maksimum 3, memorija 256 MiB i timeout 60 s; concurrency ostaje 20 za slike i 80 za ostale funkcije. Poslovni write gate ostaje uključen kao pre objave.
- Prošlo je 13 HTTP provera, uključujući odbijanje neautentifikovanih zahteva za nalog, kreiranje/prihvatanje posla i fotografije, uz proveru dozvoljenih i nedozvoljenih CORS origin-a.
- Prošlo je 10 live browser provera: četiri javne stranice sa SEO podacima, tri prijavne/registracione forme i tri anonimna preusmeravanja. Nema izvršnih/hydration grešaka ni horizontalnog prelivanja na mobilnoj širini.
- Ponovljeno je svih 12 kontrolisanih startup proba nad stvarno objavljenim JavaScript-om, sa sintetičkom prijavom i potpuno presretnutim Auth/API odgovorima. Svaka proba imala je jednu proveru uloge. U svih šest proba sa obaveštenjima odloženim dve sekunde header se pojavio pre njihovog završetka; navigacija vodoinstalater → zahtev sačuvala je izabranu uslugu bez dodatne provere uloge. Ova provera nije pozivala stvarni produkcijski `resolveAccount` za testni nalog i nije merila njegov cold start.
- U zasebnom svežem anonimnom browseru stvarni `/firebase-messaging-sw.js` uspešno se registrovao na root scope i ostao u stanju `activated`, bez workera koji čeka/instalira. Nije tražena dozvola za obaveštenja i nije bilo browser grešaka. Test čeka stvarni `serviceWorker.ready` i potom potvrđuje aktivirano stanje.
- Kontrolne hash vrednosti postojećih podataka pre/posle su iste: 1 admin profil, 3 klijenta, 2 majstora, 2 posla, 3 fotografije i 0 staging objekata. Ovo obuhvata pregledane profile/poslove i listu fotografija; nije potpuni audit svih kolekcija/subkolekcija.
- Pregled Cloud Run ERROR logova od Hosting objave do 21:44:32 UTC nije vratio greške. Ovo je vremenski ograničena provera, ne trajni monitoring.

## Potrošnja i granice provere

Nisu dodate funkcije, periodični poslovi, novi account upiti ili stalno aktivne instance. Sedmodnevno čišćenje deployment slika potvrđeno je u europe-west3 i us-central1; ne odnosi se na fotografije korisnika. Objava ima uobičajenu Cloud Build/artefakt potrošnju, a read-only produkcijske provere mali broj stvarnih čitanja/poziva. Ne tvrdi se garantovano nulta naplata.

Nisu kreirani produkcijski nalozi/poslovi niti slati pravi email, SMS ili push. Registracija service worker-a i simulirani transportni testovi ne dokazuju Google FCM/OS isporuku na vlasnikovom telefonu. Tok prijave i potvrde uloge ostaje blokirajući kao pre; promena uklanja dodatno čekanje na obaveštenja, ne garantuje trenutno učitavanje na svakoj vezi.

## Provera vlasnika

1. Kao već prijavljen korisnik osvežiti početnu stranicu bez odjave i otvoriti svoj panel. Proveriti i na telefonu.
2. Kao klijent izabrati vodoinstalatera i otvoriti „Pošalji zahtev“: forma treba da pripada istom nalogu i da sačuva izabranu uslugu. Kao majstor proveriti učitavanje svojih poslova.
3. Proveriti stvarni prijem push obaveštenja na sopstvenom testnom nalogu sa aplikacijom u pozadini. Ako je moguće, proveriti i uređaj koji prvi put uključuje obaveštenja.

Vlasnik je potvrdio uspešnu ručnu proveru i prijem stvarne notifikacije. Odobren je Git commit/push; naziv commita: `perf(startup): decouple notification setup from app loading`.

## Dokazi i povratak

U ignorisanom `.firebase/startup-release/` sačuvani su metapodaci prethodnih funkcija i Hosting izdanja, 14 prethodnih ZIP izvora sa SHA-256 manifestom, kontrolne vrednosti podataka, artefakt manifest, deploy log, tehničke/browser/worker/startup provere i završne provere logova i cleanup politike. Nije bilo potrebe za povratkom. Povratak koristi prethodni usklađeni Hosting/SSR/API skup; nema vraćanja ili brisanja korisničkih podataka.
