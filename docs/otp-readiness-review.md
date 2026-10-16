# Ponovna provera OTP implementacije

<!-- otp-magic-retirement:current -->
Aktuelno stanje posle kontrolisane objave i uklanjanja magic-link prijave: klijenti koriste isključivo šestocifreni OTP na `/login`. Stari `/finishLogin` i sign-in linkovi vode na čistu OTP prijavu, bez korišćenja Firebase koda. Izdavanje/prijava email linkom su isključeni; prijava majstora i administratora lozinkom ostaje uključena. [Aktuelni izveštaj](otp-magic-link-retirement-report.md). Raniji zapisi ispod predstavljaju istoriju završenih celina.
<!-- /otp-magic-retirement:current -->

Dopuna 10. oktobra 2026, posle vlasnikove probe: dve stvarne OTP prijave su uspešne. Udaljeni receipt-i potvrđuju isti Auth/klijentski UID, oba SES accepted slanja i završen token/profil tok; pregled nije potrošio dodatne pokušaje. Javni/default OTP ostaje sledeća odvojeno odobrena celina. [Aktuelna provera i sledeći korak](otp-owner-live-validation-report.md). Raniji zapisi ispod čuvaju redosled prethodnih celina.

Dopuna 10. oktobra 2026: odobrena produkcijska OTP proba je objavljena i operaterski proverena. Slanje i provera dostupni su samo za aleksa@majstorsada.rs; javni OTP ostaje zatvoren, a obična prijava koristi magic link. Prva stvarna Turnstile → AWS → Firebase prijava sada čeka vlasnikovu probu. [Aktuelni rezultat i uputstvo](otp-owner-deployment-report.md). Raniji zapisi ispod predstavljaju istoriju prethodnih celina.

Dopuna 7. oktobra 2026: lokalna priprema ograničene OTP probe za jednu vlasnikovu adresu je završena. Pripremljeni su indeksni preflight, kandidat sa tačno četiri promene parametara, zaštita postojećeg održavanja i usklađen SSR/Hosting backup. Produkcijski OTP i slanje ostaju zatvoreni; realna Turnstile → AWS → Firebase prijava tek treba da se proveri nakon zasebno odobrene objave. [Aktuelni izveštaj i tačan sledeći korak](otp-owner-preparation-report.md). Stariji zapisi ispod čuvaju stanje ranijih celina.

Dopuna 6. oktobra 2026: završena je odobrena kontrolisana cloud objava dve OTP funkcije. Svih 30 IP proba na šest javnih Google adresa prošlo je; dijagnostika je zatvorena i to je potvrđeno udaljenom konfiguracijom i HTTP proverama. Svih 17 prethodnih funkcija je nepromenjeno. Poslovni OTP, slanje i javni OTP ostaju isključeni, proxy parametar ostaje 0, a sajt nastavlja magic-link prijavu. [Završni izveštaj i sledeća celina](otp-ingress-deployment-report.md). Raniji zapisi ispod opisuju prethodne faze.

Dopuna 5. oktobra 2026: završena je lokalna priprema kratkotrajne owner dijagnostike i preciznog postupka objave samo dve OTP funkcije. [Izveštaj i sledeći korak](otp-ingress-preparation-report.md). Dijagnostički prozor i poslovni OTP su zatvoreni; deployment čeka posebno odobrenje. Raniji plan ispod ostaje istorijski kontekst.

Dopuna 5. oktobra 2026: pregledana je AWS uloga koju je vlasnik kreirao i stvarni ARN je vezan za lokalnu konfiguraciju uz zatvoren OTP. [AWS izveštaj](otp-aws-preparation-report.md). Slede Turnstile i dve serverske tajne; stvarna STS/SES veza još nije testirana iz Google runtime-a.

Dopuna 4. oktobra 2026: namenski Google identitet i njegova IAM prava su kreirani i provereni. [Izveštaj pripreme](otp-google-preparation-report.md). Detalji ranijeg pregleda ispod odnose se na stanje pre te cloud pripreme.

Dopuna nakon odobrenog održavanja biblioteka: Functions i oba SSR stabla sada imaju 0 audit nalaza; završne provere su opisane u [izveštaju o bibliotekama](dependency-maintenance.md). Ostatak ovog dokumenta čuva rezultate početnog pregleda pre te izmene.

4. oktobar 2026. Pregled lokalnog koda na main/35a47f7. Aplikacijski izvori, cloud podešavanja, produkcija, commit i push nisu menjani. Ovaj izveštaj dopunjuje pregled od 28. septembra.

## Ocena

OTP tok je funkcionalno spreman za kontrolisano povezivanje stvarnih servisa. Nije nađen potvrđen lokalni blokator u izdavanju koda, očuvanju UID-a, kontroli uloga ili kvotama. Javna produkcijska spremnost još nije potvrđena. Pre naredne objave treba razrešiti sveže dependency nalaze i proveriti Google/AWS/Turnstile integracije, IP granicu i operativna upozorenja.

## Danas ponovljene provere

| Provera | Rezultat |
| --- | --- |
| OTP HTTP, transport i frontend | 38/38 |
| OTP servis, identitet i održavanje na Firestore emulatoru | 36/36 |
| Bezbednost, transakcije, privatnost i Storage pravila | 115/115 |
| Pokretanje aplikacije i notifikacije | 28/28 |
| Paginacija i kontrola troška | 3/3 |
| Zaštita SSR manifesta i lockfile-a | 13/13 |
| OTP HTTP kroz lokalne Auth/Functions/Firestore emulatore | Prošlo |
| OTP desktop i mobilni Edge browser | Prošlo, bez browser grešaka |
| git diff --check | Prošlo |

Ukupno 233 imenovana testa, uz HTTP i browser end-to-end scenarije. Provereni su paralelni zahtevi, 500 ukupnih i tri slanja po adresi, pogrešan kod, izgubljeni odgovori, reload, ponavljanje istog zahteva bez novog mejla, nastavak posle greške provere uloge, UID/profil/poslovi i odbijanje privilegovanih/nepotvrđenih naloga. Desktop test potvrdio je brisanje sačuvanog OTP toka nakon prijave. Lokalni testovi nisu slali AWS mejlove; testne tajne i parametri uklonjeni su po završetku. Backend TypeScript build prošao je ponovo.

Puni Nuxt build, postojeći poslovni browser tok i SSR/startup browser provere prošli su 28. septembra. Danas nisu ponavljani niti uračunati u gornji zbir.

## Audit biblioteka pre održavanja (istorijski nalaz)

Functions npm audit --omit=dev: 3 high, 2 moderate, 0 critical. Pregledani SSR lockfile u deploy/ssr: 7 high, 2 moderate, 0 critical. Brojevi uključuju roditeljske pakete i ponovljene lance; nisu broj nezavisnih propusta. Raniji izveštaj sa samo dve umerene stavke više nije aktuelan.

- @fastify/busboy 3.2.0: multipart DoS; zakrpa od 3.2.1. Firebase Admin ovde obrađuje multipart odgovore Google API-ja, nije nađen direktan browser upload ulaz.
- @grpc/grpc-js: Functions 1.14.4, SSR uključuje i 1.9.16. Nalaz zahteva serversku proveru sertifikata preko getAuthContext; naš Firestore tok koristi klijenta. Proveriti kompatibilne zakrpljene grane 1.14.5/1.13.6 i sve lockfile-ove.
- brace-expansion 2.1.4: DoS na nepouzdanom glob obrascu; takav aplikacijski ulaz nije nađen. Pregledati kompatibilnu zakrpu, uključujući povezani nalaz za verzije pre 2.1.7.
- devalue 5.9.2 u SSR-u: nalazi serializacije i obrade podataka; audit nudi 5.9.4. Nije pronađeno aplikacijsko prosleđivanje Node Buffer-a u SSR payload; ovo nije zamena za zakrpu.

Nema dokaza da je sajt kompromitovan ili da je OTP endpoint direktno iskoristiv. Pre sledeće objave preporučujem kompatibilna ažuriranja, pregled zaključanih stabala i ponovne testove/audit. Ne koristiti npm audit fix --force: SSR audit zbog gRPC lanca predlaže i neprikladan downgrade Firebase-a. Ranije uuid/gaxios umerene stavke ostaju predmet pregleda.

Primarni izvori: [Busboy](https://github.com/fastify/busboy/security/advisories/GHSA-xjh9-v7x6-24jw), [gRPC](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j), [brace-expansion](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-qhr7-859c-m2p7), [devalue](https://github.com/sveltejs/devalue/security/advisories/GHSA-j22f-vq7h-c4qm).

## Granice potvrde

Auth, Firestore i kasnija zamena custom tokena nisu jedna transakcija. Kod proverava identitet i ulogu pre i posle udaljenog potpisivanja, ali promena nakon poslednje provere nije globalno atomski isključena. Postojeći poslovni API koristi verifyIdToken bez provere opoziva, pa deaktiviranje već prijavljenog naloga ne prekida odmah svaki izdat ID token. Ovo prethodi OTP-u i nije blokator owner testa; važno je za postupak kod incidenta. [Firebase dokumentacija](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

Izgubljeni verify odgovor neposredno pre isteka koda može se kratko oporaviti u istom otvorenom tabu. Reload ne čuva kod ni memorijski marker za taj izuzetni oporavak, pa može biti potreban novi OTP u okviru kvota.

## Sledeći koraci i podela poslova

1. Završeno lokalno: održavanje biblioteka i regresiona validacija; detalji su u [izveštaju](dependency-maintenance.md).
2. Završeno 4. oktobra: namenski Google server identitet, ograničene IAM dozvole i konkretne AWS policy vrednosti. Nula privatnih ključeva; stvarno potpisivanje iz novog runtime-a proverava se posle kontrolisane objave.
3. Sledeće, ti u AWS-u uz [gotove politike i uputstvo](otp-aws-role-setup.md): kreiranje ograničene IAM uloge i dostavljanje njenog ARN-a. ARN nije tajna. SES domen i Zoho se ne podešavaju ponovo.
4. Ti u Cloudflare-u: Managed Turnstile widget za naš domen. Ja: konfiguracija, HMAC tajna i bezbedno skladištenje tajni. Secret se unosi lokalno u Secret Manager, ne u chat.
5. Posle odobrene kontrolisane objave, ja: stvarne dozvole/STS/potpisivanje/Turnstile, IP granica i upozorenja, pa test ograničen na vlasnika. Ti proveravaš OTP mejl i prijavu na svom uređaju.
6. Posle uspešnog testa i posebnog odobrenja: javni OTP. Do tada magic link ostaje podrazumevan.

IP dijagnostika ne može samo da pozove zatvoreni OTP endpoint: gate odbija pre čitanja IP-ja. Pripremljena je privremena Google-autentifikovana owner dijagnostika bez SES/Firestore rada preko direktnog cloudfunctions.net URL-a, zatim potvrda na stvarnom OTP endpointu u owner režimu. Ne uključivati javno slanje radi merenja; privremenu dijagnostiku ukloniti nakon provere.

500 je serverski aplikacijski limit, ne granica svih Firebase/AWS troškova. Pragovi 400/450/500 su log signali; cloud i billing upozorenja tek treba podesiti i proveriti.
