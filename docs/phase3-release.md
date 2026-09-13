# Celina 3 — produkcijsko izdanje

Objavljeno 13. septembra 2026. po izričitom odobrenju vlasnika. Automatske produkcione provere su prošle. Vlasnik je zatim potvrdio da sve radi u ručnoj proveri i odobrio Git commit/push sa naslovom `build(platform): refresh dependencies and lock SSR deployment builds`.

## Izdanje i obim

- Hosting, SSR i API potvrđuju build `e4b6f8b-dirty`. Oznaka `dirty` beleži da je izvor u trenutku deploy-a bio nekomitovan. Naknadni Git commit ne menja identitet već objavljenog build-a i ne zahteva novu objavu.
- Hosting verzija: `sites/majstorsada-b2ad4/versions/3aa08e35fe6676e0`.
- Objavljeni su API, SSR i Hosting pomoću zaključanog lokalnog Firebase CLI 15.30.0. Svih 14 funkcija je aktivno na Node 24, sa novim revizijama.
- Firestore/Storage pravila i baza nisu migrirani. Objavljeni ruleset identifikatori ostali su isti kao pre ove objave.
- Privatni ulaz sada prikazuje kratko „Učitavanje naloga…“ dok browser odredi nalog i odgovarajuću stranicu. Javne stranice zadržavaju prerender/SSR i proverene SEO podatke.

## Dodatna zaštita pronađena pre objave

Produkcioni SSR već je imao maksimalno tri instance, ali Nuxt konfiguracija je navodila samo region. Pregled SDK-a pokazao je da izostavljene runtime opcije mogu biti resetovane tokom objave. U `nuxt.config.ts` su zato eksplicitno upisane postojeće vrednosti: minimum 0, maksimum 3, memorija 256 MiB, timeout 60 s, concurrency 80, europe-west3.

Kompajlirani Firebase export sada prolazi proveru tih vrednosti u lokalnom SSR testu. Posle objave Cloud Functions API je potvrdio da su prethodni regioni, runtime servisni nalozi, CPU/memorija, timeout, ingress i limiti instanci/concurrency očuvani. Foto funkcija ostaje us-central1 sa concurrency 20; ostale imaju 80. Svih sedam poslovnih write funkcija ostalo je omogućeno.

Deploy skripta koristi file-based discovery već provereno emulatorima, kako bi izbegla Windows HTTP-discovery shutdown problem sa zaključanom kombinacijom CLI/SDK. Ova promena je u lokalnom postupku objavljivanja.

## Rezultati

- Svež produkcioni build i instalacija istih 105 direktnih SSR zavisnosti iz pregledanog lockfile-a: prošli.
- Predeploy provere: 13 build testova; 4 javne i 12 privatnih/kodiranih SSR ruta, uz proveru runtime budžeta, SEO/noindex i hidratacije: prošle. Ranije završene 98 bezbednosnih provera i kompletni emulator browser tokovi ostaju dokumentovani u phase3-report.md.
- Osvežen audit: koren 9 moderate, API 2 moderate; pregledan SSR lock ostao je isti sa 2 moderate. Nema high/critical nalaza u pregledanom skupu. Preostali nalazi opisani su u dependency-advisories.md.
- Live tehničke provere: usklađen build, svih 14 ažuriranih funkcija, očuvane runtime postavke, 13 HTTP provera, odbijanje zahteva bez prijave i CORS politika: prošle.
- Live browser: četiri javne stranice, tri prijavne/registracione forme i tri anonimna preusmeravanja: prošli, bez izvršnih/hydration browser grešaka; mobilna početna stranica nema horizontalno prelivanje.
- Stvarni Auth/Firestore/Storage/Functions tok: ekskluzivna registracija sa nula tokena, ponovljena objava bez duplog posla, upload/finalizacija JPEG-a, autentifikovano čitanje fotografije, privatni telefon, zabrana prihvatanja bez tokena, jedno zaduženje pri prihvatanju i ponavljanju, kontakt samo dodeljenom majstoru, završavanje i ocena: prošli.
- Potvrđeno uklanjanje svih privremenih testnih Auth naloga, profila, posla, kontakta i fotografije. Postojeći podaci su poređeni kontrolnim hash vrednostima i ostali nepromenjeni: 1 admin profil, 3 klijenta, 2 majstora, 1 posao i 2 postojeće fotografije; bez staging objekata.
- Pregled grešaka od vremena Hosting objave do završne provere nije vratio ERROR zapise Cloud Run aplikacije. To je vremenski ograničen pregled, ne trajni monitoring.

Prvi pokušaj poslovnog smoke testa otkrio je nekompatibilnost stare lokalne OAuth pomoćne skripte sa novim Firestore/gax transportom (običan objekat zaglavlja umesto Headers). Test je za Firestore prebačen na auth biblioteku njegovog transporta, dok Storage koristi svoju kompatibilnu biblioteku. Aplikacioni kod nije menjan zbog toga; ponovljeni test i nezavisna provera čišćenja su prošli.

Nije slat pravi email, SMS ili push: testni nalozi koriste example.invalid adrese, testni majstori ostaju nedostupni, a test pre objave posla proverava da nema postojećih dostupnih primalaca u testiranoj struci. Vlasnik treba da potvrdi stvarnu isporuku email linka i iskustvo na svom telefonu.

## Blaze

Nema dodatnih upita po poslovnom toku niti novih funkcija, zakazanih poslova ili SMS servisa. Postojeća ograničenja instanci su eksplicitno sačuvana. Sedmodnevna cleanup politika deployment slika potvrđena je u europe-west3 i us-central1; ona se ne odnosi na fotografije korisnika.

Ova objava uključuje uobičajenu Cloud Build obradu i deployment artefakte; produkcione provere potrošile su mali broj stvarnih operacija. To nisu besplatni emulator testovi i ne predstavlja se kao garantovano nulta naplata. Ranije izmeren dodatak početnih JS/CSS resursa od približno 74 KB gzip ostaje stavka za optimizaciju pre marketinga.

## Povratak i dokazi

Pre objave sačuvani su trenutni metapodaci svih funkcija, prethodne Cloud Run revizije, SHA-256 proverenih 14 izvora u ZIP arhivama i prethodna Hosting verzija `sites/majstorsada-b2ad4/versions/8303edfff6eb5de9`. Izvori su iz kompatibilne celine 2; povratak ne sme vraćati staru javnu šemu kontakata. Povratak nije bio potreban. Vraćanje starog izdanja privremeno bi vratilo i prethodne dependency nalaze.

Lokalni dokazi su ignorisani u `.firebase/phase3-release/`: `before.json`, `rollback/manifest.json`, `deploy.log`, `verification.json`, `browser.json`, `smoke.log`, `data-before.json`, `data-after.json`, `final-checks.json`; rezultat čišćenja je i u `.firebase/phase3-smoke-open.json`. Arhive i pristupni podaci se ne dodaju u Git.

## Ručna provera vlasnika

1. Otvoriti https://majstorsada.rs u svežem tabu, osvežiti bez keša i proveriti početnu stranicu i stranice struka na telefonu.
2. Kao klijent prijaviti se pravim email linkom i objaviti jedan testni posao sa fotografijom. Proveriti potvrdu i sopstveni pregled posla.
3. U drugom browser profilu prijaviti odgovarajućeg dostupnog majstora. Proveriti opis/fotografiju i odsustvo telefona i emaila klijenta pre prihvatanja. Ako taj testni nalog ima nula tokena, prihvatanje mora biti odbijeno, a pregled ostati dostupan.
4. Preko admin naloga dodeliti testnom majstoru jedan token po potrebi, prihvatiti posao i proveriti da je skinut tačno jedan token. Osvežiti stranicu: isto prihvatanje ne sme ponovo zadužiti nalog. Telefon mora biti vidljiv dodeljenom majstoru; email klijenta ostaje skriven.
5. Završiti posao i ostaviti jednu ocenu kao klijent. Proveriti status i ocenu. Odjaviti majstora i potvrditi da privatni kontakt nestaje, uključujući drugi otvoreni tab.

Vlasnik je potvrdio ručnu proveru i odobrio Git commit/push. Sledeća poslovna celina je zaštita od zloupotrebe i kontrola troškova, zatim OTP.
