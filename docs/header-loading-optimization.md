# Optimizacija učitavanja zaglavlja

Izmena je lokalno proverena 16. oktobra, a uz odobrenje korisnika kontrolisano objavljena 17. oktobra 2026. po lokalnom vremenu. Objavljeni su resolveAccount, SSR i Hosting, iz istog testiranog artefakta. Završne produkcijske provere opisane su ispod.

U aplikaciji je Firebase Messaging izdvojen iz statičkog importa u dinamički import unutar postojeće funkcije ensureMessagingReady(). Podešavanje Nuxt plugina ostaje sinhrono, uz istu zavisnost od Firebase i auth-init plugina. Jedan deljeni readyPromise obuhvata učitavanje SDK-a, proveru podrške, registraciju service worker-a i postavljanje slušaoca. Dobijanje tokena koristi isti učitani SDK. Postojeće ponašanje dozvole, zaštite od zastarele sesije i ponovnog pokušaja ostaje pokriveno testovima.

Backend ima dve uske izmene. setGlobalOptions sada dolazi iz javnog firebase-functions/options ulaza umesto širokog v2 ulaza koji učitava dodatne providere. Postojeći sinhroni telefonski parser učitava se lokalnim require pozivom tek u funkciji phone(). Parser, pravila validacije i redosled validacije pre pristupa bazi ostaju isti. Prva radnja koja proverava telefon plaća odloženo učitavanje; Node zatim koristi keš modula. Obnavljanje naloga ne učitava telefonske metapodatke.

Auth tok, provera tokena, obrada konflikta uloga i postojeća transakcija koja zajedno čita admins, tradespeople i clients nisu menjani. Nema promene pravila pristupa, šeme, endpoint-a, kvota, regiona, minimuma instanci ili načina rada transakcije. Poređenje stvarnog kompajliranog ulaza potvrđuje iste definicije svih 18 funkcija i specifikacije svih 18 parametara. Paketima i lock datotekama nisu dodavane zavisnosti.

Sačuvani grafovi baseline-graph.json i after-graph.json pokazuju da početni statički graf izvršavanja ima 820.948 umesto 845.919 sirovih bajtova, odnosno 260.814 umesto 267.950 gzip bajtova. To je 24.971 manje sirovih i 7.136 manje gzip bajtova u tom grafu. Messaging više nije u statičkom grafu. Ovo nije obećanje istog smanjenja ukupnog preuzimanja: Nuxt SSR može ranije da pošalje prefetch za dinamički chunk.

Izolovana merenja backenda pokazuju 650 umesto 761 modula pri pokretanju, odnosno 111 manje unapred učitanih modula i približno 8–10 MiB manje lokalne RSS memorije. Medijane lokalnog učitavanja modula poboljšane su približno 13–24% u dva kontrolisana poređenja. Pojedinačna merenja variraju. Ove vrednosti ne predstavljaju produkciono vreme cele obnove prijave, brzinu zaglavlja ili korisnički p95; mreža, provera tokena i pokretanje cloud instance nisu izmereni tim probe-om.

Sačuvani logovi potvrđuju 627 uspešnih Node testova: 63 startup, 3 kontrole troškova, 51 build, 3 zavisnosti, 196 cloud-konfiguracionih, 157 čistih OTP, 39 Firestore OTP i 115 bezbednosnih testova. Startup komanda sada prvo kompajlira funkcije i uključuje 25 backend provera uz 38 Messaging provera. Prošli su i OTP i poslovni E2E tokovi sa stvarnim lokalnim emulatorima. Logovi su u .firebase/header-optimization-local/checks/.

Test kompajliranog pregledača prošao je svih 30 navigacija bez izvršnih grešaka: obe uloge, pet scenarija i tri ponavljanja. Posebno zadržava svaki HTTP odgovor za Messaging chunk i proverava da ispravno zaglavlje i završena hidratacija nastaju dok su odgovori još zadržani. Prva provera je pogrešno pretpostavljala jedan HTTP zahtev. Sačuvani trag je pokazao SSR prefetch i stvarni import; ispravljen test beleži vrstu i svrhu svakog zahteva. HTTP broj nije dokaz broja inicijalizacija, koju zasebno potvrđuju lifecycle testovi. [Playwright rutiranje isključuje HTTP keš](https://playwright.dev/python/docs/api/class-browsercontext#browser-context-route); zato test ne tumači dva takva zahteva kao dve inicijalizacije.

Izmene ne uvode dodatne API pozive, čitanja baze, slanje poruka ili stalno aktivne instance. Postojeći izvori naplate ostaju; nema garancije da će ukupan račun ostati nula niti da će ušteda biti određeni iznos. Navedene lokalne provere koriste emulatore ili sintetičke odgovore, bez objavljivanja produkcionih resursa.

Završni SSR test prošao je četiri javne stranice i 12 privatnih/noindex ruta, uz očuvan SEO, OTP ulaz, preusmeravanja starog email-link toka i oporavak nedostajućeg lazy fajla bez petlje osvežavanja. Potvrđen je usklađen SSR/Hosting build `a6c318a-dirty-a20d5aad-5bae-4673-84ce-fe894c49afa1`. Svaka startup navigacija ima tačno jednu Auth i jednu serversku proveru uloge; u svih šest proba sa SDK-om zadržanim dve sekunde header i hidratacija završeni su pre puštanja SDK odgovora.

Ukupna lokalna vremena headera nisu dokazala ponovljivo ubrzanje. U scenariju bez namernog kašnjenja medijane su bile:

| Uloga | Pre | Posle |
| --- | ---: | ---: |
| Klijent | 305,1 ms | 388,4 ms |
| Majstor | 275,1 ms | 345,3 ms |

To su po tri ponavljanja sa sintetičkim Auth/API odgovorima, u odvojenim sesijama i promenljivim lokalnim uslovima. Zabeležena su i kašnjenja samih lokalnih fixture odgovora. Ove brojeve ne koristimo kao dokaz uzročnog ubrzanja ili usporenja aplikacije. Dokazana korist su manji početni graf, manje serverskih modula i odsustvo zavisnosti headera od SDK odgovora. Nije dokazano da je ranije čekanje od približno tri sekunde nestalo; pokretanje uspavane funkcije i stvarna mreža ostaju deo toka.

Sledeći korak posle objave jeste korisnikova provera već prijavljenog klijenta i majstora u Chrome-u i PWA-u, pri prvom i ponovljenom otvaranju. Treba potvrditi i stvarnu push notifikaciju u pozadini i na uređaju koji prvi put daje dozvolu. Lokalni adapteri i emulatori ne dokazuju isporuku preko Google FCM-a i operativnog sistema. Migracija naloga, poslova ili baze nije potrebna.

Detaljni lokalni tragovi, grafovi, merenja i logovi sačuvani su u ignorisanom `.firebase/header-optimization-local/`, a završne browser probe u `.firebase/startup/after.json`. Ponovljivi testovi i njihovo uputstvo nalaze se u `tests/startup/`.


## Produkcijska objava 17. oktobra 2026.

Objavljen je prethodno testirani build `a6c318a-dirty-a20d5aad-5bae-4673-84ce-fe894c49afa1`, bez ponovne izgradnje frontenda. Nova revizija resolvera je `resolveaccount-00005-puf`, SSR-a `server-00048-pih`, a završna Hosting verzija `bff4941c599799f7`. Objavljeni izvor preuzet je preko tačnih generacija arhiva i upoređen sa lokalnim artefaktom: svih 17 API fajlova i 104 SSR fajla odgovara bajt po bajt. Arhive nisu izvršavane niti raspakovane.

Provera svih 19 cloud funkcija potvrdila je da je preostalih 17 funkcija nepromenjeno, uključujući oba OTP endpoint-a i održavanje poslova. Sačuvani su runtime limiti, broj minimalnih i maksimalnih instanci, service account, tajne, invoker ovlašćenja, Auth konfiguracija, raspored održavanja, pravila pristupa i indeksi. Nisu menjani nalozi, poslovi ili podaci. Nisu uvedene stalno aktivne instance ili dodatna čitanja po obnovi prijave.

Za objavu samo resolvera korišćena je privremena izolovana Firebase konfiguracija. Ona je sačuvala njegove postojeće tri poslovne vrednosti umesto da ih preuzme iz različite lokalne konfiguracije. Zbog discovery parametara sadašnjeg API paketa dodato je 13 netajnih OTP konfiguracionih ključeva; oni su u resolveru neaktivni, bez OTP ruta, tajni ili dodatnih ovlašćenja. Firebase CLI je uklonio staru eksplicitnu sistemsku oznaku `FUNCTION_SIGNATURE_TYPE=http`; HTTP je podrazumevani režim. Provera prihvata isključivo taj tačan prelaz za resolver uz isti target, entrypoint i odsustvo event triggera. Stvarni HTTP odgovor 401 za neprijavljenog korisnika, OPTIONS 204 i GET 405 dodatno potvrđuju rad adaptera. Dozvoljeni produkcijski origin dobija CORS zaglavlje, strani origin ga ne dobija. Kanonski firebase.json i lokalna produkcijska env datoteka nisu menjani.

Hosting je prvo dobio tri nova nepromenljiva fajla, uz stari HTML i manifest. Posle uspešne SSR provere objavljen je završni skup od 96 fajlova: 86 fajlova kandidata, osam zadržanih starih Nuxt fajlova i dva postojeća Firebase init fajla. Nije bilo brisanja. Svi remote hash-evi i Hosting konfiguracija provereni su prema planu. Na Firebase domenu i majstorsada.rs prošle su 34 provere fajlova i dokumenata; novi i zadržani stari fajlovi dostupni su. Sačuvani su prethodni izvori, konfiguracija i Hosting identifikatori za povratak.

Browser provera objavljenog interfejsa prošla je javni SEO, OTP formu, učitavanje Turnstile skripte bez pokretanja izazova, uklonjeni magic-link ulaz, prijavu majstora i administratora, kao i mobilni prikaz. Nema izvršnih ili hidratacionih grešaka ni neuspelih Nuxt resursa. Posebna proba prošla je svih 30 startup scenarija sa sintetičkim Auth/API odgovorima i osam anonimnih desktop/mobile provera. Svaka startup navigacija imala je tačno jednu sintetičku Auth i jednu resolver proveru. U svih šest proba sa zadržanim Messaging odgovorima zaglavlje i hidratacija završeni su pre puštanja odgovora. To potvrđuje odsustvo te blokade u objavljenom kodu; ne meri stvarno trajanje serverske obnove prijave ili FCM isporuku.

Završni produkcijski testovi nisu slali OTP ili push poruke niti menjali naloge. Preostala ručna provera obuhvata postojeće stvarne prijave u Chrome-u i PWA-u, prvo i ponovljeno otvaranje, pristup odgovarajućem panelu i stvarnu push notifikaciju. Nije obećano uklanjanje celog ranije primećenog čekanja od približno tri sekunde: stvarna Auth provera, mreža i pokretanje uspavane cloud instance ostaju deo toka.

U metapodacima serverskih logova za resolver, SSR, oba OTP endpoint-a i održavanje nema ERROR zapisa od početka objave do završne provere u 01:28 po lokalnom vremenu. Ovo je provera ograničenog vremenskog prozora, ne zamena za korisnikovu probu.

Evidencija objave nalazi se u ignorisanom `.firebase/header-loading-release-2026-10-17/`: verifikacije konfiguracije, objavljenog izvora, Hosting plana i fajlova, HTTP/browser rezultati, metapodaci logova i arhive za povratak. Tehničke datoteke sa privatnom konfiguracijom ostaju izvan Git-a.


## Naknadne dorade interfejsa 17. oktobra 2026.

Korisnik je nakon prve objave potvrdio prijem stvarne push notifikacije. Zatim su uz zasebno odobrenje objavljene tri male dorade: uklonjen je pasus o sačuvanom zahtevu i broju otpremljenih fotografija, uklonjen je podnaslov o modernim SaaS panelima i postojeći kontakt za dopunu žetona postavljen je na 0644389171. Logika fotografija, obrada grešaka, napredak otpremanja i tok dopune nisu menjani.

Nova objava koristi build `a6c318a-dirty-5db92063-ec04-4843-9b2d-3e83367508a1`, SSR reviziju `server-00049-tuj` i Hosting verziju `e00794a5589d5bb1`. Ovoga puta objavljeni su samo SSR i Hosting. Svih 18 API funkcija, uključujući resolver i OTP, ostalo je identično prethodnoj produkciji. Sačuvani su i konfiguracija, Auth, IAM, pravila, indeksi, raspored i granice resursa.

Prošlo je 51 postojećih build provera, SSR provera četiri javne i 12 privatnih ruta, kao i fokusirana desktop/mobilna provera stvarnih Vue šablona sa sintetičkim stanjem otpremanja fotografije i stvarnim kodom komponente za dopunu uz sintetički store. Provera objavljenog izvora potvrdila je svih 104 SSR fajla. Posle objave prošle su 44 provere fajlova/dokumenata na oba domena i produkcijska desktop/mobilna provera javnih stranica i prijave, bez browser grešaka. U pregledanim metapodacima pet serverskih servisa nema ERROR zapisa od početka ove objave do završne provere u 16:41 po lokalnom vremenu. Nisu slati OTP mejlovi niti menjani nalozi ili poslovi.

Prethodni fajlovi su zadržani za otvorene kartice, a izvor prethodnog SSR-a i Hosting identifikatori sačuvani su za povratak. Evidencija je u `.firebase/ui-copy-release-2026-10-17/`.
