# Produkcijska proba korisničkog toka — vremena i dijagnoza

Datum: 12. oktobar 2026. Proba u logovima: 00:44–00:46, Europe/Budapest. Korisnik je potvrdio prijavu, slanje posla, prihvatanje, završavanje i ocenjivanje. Pročitani su produkcijski logovi; aplikacija, cloud podešavanja i Git istorija nisu menjani.

## Izmerena vremena

Za svaki prvi poziv browser je poslao OPTIONS (CORS provera), zatim stvarni POST. Kolona „zbir” sabira njihova zasebna serverska trajanja, ne meri klik do završenog prikaza.

| Radnja | OPTIONS | POST | Zbir serverskih trajanja |
| --- | ---: | ---: | ---: |
| Slanje OTP koda | 1,74 s | 1,35 s | 3,09 s |
| Potvrda OTP koda | 2,35 s | 2,42 s | 4,77 s |
| Provera naloga posle prijave | 1,53 s | 0,50 s | 2,04 s |
| Slanje posla | 1,84 s | 0,96 s | 2,80 s |
| Prihvatanje posla | 1,53 s | 0,56 s | 2,09 s |
| Završavanje posla | 2,46 s | 0,62 s | 3,08 s |
| Ocenjivanje | 1,73 s | 0,73 s | 2,46 s |

Svi POST odgovori su 200; OPTIONS odgovori su 204. Za sedam relevantnih servisa u prozoru 00:44–00:47 nema ERROR zapisa. Postoji jedan uspešan niz navedenih radnji; povezivanje sa korisnikovom probom zasniva se na vremenu, jedinstvenom nizu i njegovoj potvrdi, bez čitanja mejla, UID-a, sadržaja posla ili komentara.

Kasnija provera naloga, oko 53 sekunde posle prve, koristila je istu toplu instancu: OPTIONS 0,003 s i POST 0,089 s. To nije uzastopno dupliranje provere uloge nakon OTP-a. Moguće je da je poziv za drugi nalog, pa ova razlika nije kontrolisani benchmark iste prijave.

## Potvrđen uzrok dodatnog čekanja

Za svih sedam prvih funkcija postoji platform događaj pokretanja nove instance sa razlogom `AUTOSCALING`. Pokretanje, startup probe i prvi OPTIONS/POST povezani su po servisu, reviziji i identifikatoru instance. Hladni startovi su zato potvrđeni, ne samo pretpostavljeni.

Svaka funkcija je zaseban servis sa `minInstances: 0`. Prijava ne zagreva automatski servis koji prihvata ili završava posao. Posle mirovanja browserov OPTIONS može biti prvi zahtev koji pokrene instancu. To odgovara opaženom čekanju na više različitih radnji.

OPTIONS trajanje nije tačno trajanje hladnog starta: intervali platform pokretanja i request logova ne poklapaju se potpuno. Prvi POST takođe može inicijalizovati lazy klijente, credentials ili konekcije. Iz postojećih logova ne možemo podeliti 2,42 s OTP provere na Firestore, Auth i potpisivanje tokena.

Četiri poslovna POST-a traju manje od sekunde. Njihove revizije nisu menjane poslednjom OTP performance objavom. Ovaj uzorak ne pokazuje da OTP usporava ostale poslovne endpoint-e. Ne predstavlja poređenje sa ranijom verzijom ili dokaz performansi za veliki broj korisnika.

## Šta ova vremena ne uključuju

Google definiše request latency kao serversko vreme od prijema zahteva do slanja odgovora. Nije izmereno ukupno browser čekanje: browser Turnstile pre slanja, dostava mejla u inbox, mrežni razmaci, Firebase `signInWithCustomToken`, navigacija i direktni Firestore listener/read pozivi nisu svi obuhvaćeni ovim zbirovima.

Ako je posao imao fotografije, njihova lokalna kompresija i Storage upload nisu u `createJob` vremenu. Ocenjivanje posle HTTP odgovora dodatno čeka `history.refresh()` odnosno Firestore čitanje. Sam status 200 ne razlikuje novo izvršenje od bezbednog idempotentnog odgovora; korisnikova potvrda završenog toka dopunjuje logove.

## Procena i preporuka

Tok je u ovoj probi uspešan, bez zabeleženih grešaka. Performanse prvog korišćenja imaju prostor za poboljšanje: hladni startovi su stvarni, a prvi OTP verifier POST od 2,42 s treba dalje razložiti pre izbora izmene. To samo po sebi nije dokaz neispravne logike.

Preporuka je mali, ciljani pregled startup inicijalizacije i merenje OTP faza na hladnim/toplim instancama, bez privatnih podataka. Ne uvoditi stalne instance, periodične warm-up pozive ili menjati poslovne tokove samo na osnovu ovog jednog uzorka. Zadržavanje `minInstances: 0` štedi stalni trošak, uz povremeno čekanje posle mirovanja. Nova implementacija ili produkcijska izmena nije izvršena u ovoj analizi.

Privatni dokazi: `.firebase/otp-performance-release/user-flow-request-latencies.json`, `user-flow-startup-evidence.json`, `user-flow-error-check.json`. Identifikatori i arhive iz tog direktorijuma ne objavljuju se u Git-u.

Izvori za tumačenje: [Google definicija HTTP latency](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#HttpRequest), [Cloud Run startup događaji](https://docs.cloud.google.com/run/docs/logging#instance-scaling), [Uticaj pokretanja instanci](https://docs.cloud.google.com/run/docs/tips/general#start_containers_quickly).
