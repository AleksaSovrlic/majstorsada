# Provera stvarne OTP prijave — rezultat

<!-- otp-magic-retirement:current -->
Aktuelno stanje posle kontrolisane objave i uklanjanja magic-link prijave: klijenti koriste isključivo šestocifreni OTP na `/login`. Stari `/finishLogin` i sign-in linkovi vode na čistu OTP prijavu, bez korišćenja Firebase koda. Izdavanje/prijava email linkom su isključeni; prijava majstora i administratora lozinkom ostaje uključena. [Aktuelni izveštaj](otp-magic-link-retirement-report.md). Raniji zapisi ispod predstavljaju istoriju završenih celina.
<!-- /otp-magic-retirement:current -->

Dopuna 10. oktobra 2026, posle javne objave: OTP je sada redovna prijava na `/login` za sve klijentske adrese. Limiti i postojeći UID-ovi su očuvani, a završavanje već izdatih magic linkova ostaje dostupno. [Aktuelni produkcijski izveštaj i proba](otp-public-deployment-report.md). Raniji zapisi ispod opisuju prethodne celine.

10. oktobar 2026, provereno do 20:27:27 UTC. Vlasnik je potvrdio dve uspešne prijave. Operaterski pregled sačuvanih serverskih zapisa i ograničenih metapodataka je završen; u tim probama nije pronađen problem.

Ovo je provera stvarnog owner toka u sadašnjoj konfiguraciji. Javni/default OTP, uklanjanje magic link-a, commit i push nisu izvršeni ovom proverom.

## Šta je potvrđeno

| Provera | Dokaz / rezultat |
| --- | --- |
| Dva različita pokušaja | Dva različita rezervisana request ID-a i dva sačuvana completion receipt-a |
| Realna dostava | Oba receipt-a imaju `delivery=accepted`; dva SES accepted događaja u periodu tih proba; prijem potvrđen od vlasnika |
| Završavanje identiteta i profila | Oba imaju `state=completed`, `identityReady=true`, `profileReady=true`, pogrešnih kodova 0 |
| Ponovna prijava i UID | Oba `targetUid` odgovaraju istom sadašnjem Auth UID-u i `clients/{uid}` profilu |
| Auth i uloge | Jedan rezultat tačnog email lookup-a, potvrđena aktivna adresa i klijentski profil; nema admin/majstor profila za taj UID |
| Stvarni verify odgovori | Dva HTTP 200 odgovora: 20:17:26 i 20:21:00 UTC |
| Greške u periodu vlasnikovih proba | Nula ERROR zapisa za oba OTP servisa i održavanje od početka prve probe do završetka pregleda |
| Budžet | Dve aktivne rezervacije slanja, iste pre/posle pregleda; jedan preostali pokušaj u trenutnom periodu |
| Produkcijske postavke | Svih 19 funkcija ACTIVE; originalnih 15 nepromenjeno, granice instanci/raspored i poslovni indeksi očuvani |
| Stvarni produkcijski režim | Nema emulator/demo/credential-file override-a na dve OTP funkcije |
| Održavanje posle obe prijave | Prirodan OTP maintenance INFO prolaz u 20:25:04 UTC: kandidata/brisanja 0, bez odlaganja |

Prvi zahtev je rezervisan u 20:16:59.990 UTC i SES accepted događaj zapisan u 20:17:00.598 UTC. Drugi zahtev je rezervisan u 20:20:40.212 UTC, a accepted događaj u 20:20:40.568 UTC. Ovi razmaci predstavljaju backend korake nakon rezervacije, ne vreme konačne dostave u inbox ili kompletnu browser prijavu.

Verify HTTP zahtevi su trajali oko 3,37 s i 1,62 s. To su dva stvarna merenja serverskog zahteva; ne predstavljaju garanciju buduće latencije ili test opterećenja.

Raniji log ima sedam ERROR HTTP request zapisa sa statusom 503 pre prve vlasnikove probe. Svih sedam odgovara očekivanom broju ranijih kontrolisanih provera: šest zatvorenih dijagnostičkih ulaza i jedna neodobrena adresa. To su request logovi odbijenih proba, bez aplikacijskih ERROR zapisa. Ovi 503 odgovori nisu pomešani sa stvarnim uspešnim prijavama.

## Granica dokaza i privatnost

Pre obe prijave sačuvano stanje je bilo `new-client`, bez Auth naloga. Nije snimljen poseban UID između prve i druge prijave, jer je vlasnik obe završio pre narednog operaterskog pregleda. Zato se potvrda oslanja na dva različita trajno sačuvana, završena receipt-a koja koriste isti sadašnji UID, a ne na zamišljenu međuprobu. `targetKind` nije korišćen kao dokaz novog naloga: servis ga posle osiguravanja naloga pretvara u `existing`.

`completed` se u ovom kodu upisuje tek nakon uspešnog Firebase custom-token mintovanja i provere klijentske uloge. Dva HTTP 200 verify odgovora potvrđuju uspešan odgovor OTP endpoint-a sa tokenom. Browser razmena tokena i ulazak u aplikaciju potvrđeni su vlasnikovom probom; sam server receipt ne beleži tu razmenu niti sadrži token. U stvarnom režimu accepted SES slanje zahteva Google identitet, uspešno pribavljene privremene AWS STS kredencijale i SES odgovor. Token/slanje nisu bili emulator stub.

Tačan Auth lookup traži samo neophodna polja za proveru naloga. Profili se čitaju maskom samo `uid`. Budžet je čitan maskom samo `reservations`, zatim tačno dva challenge dokumenta sa maskama samo `email`, `createdAt`, `state`, `delivery`, `targetUid`, `identityReady`, `profileReady` i `wrongAttempts`. Nije rađeno listanje naloga, profila ili OTP kolekcija. Kodovi, code/session hash-evi, HMAC vrednost, privatni ključevi, tokeni i sadržaj request body-ja nisu čitani. U ignorisanim dokazima sačuvani su otisci UID/request ID-a, statusi i vremena.

Audit nije slao mejlove, pravio/menjao naloge, potrošio treći pokušaj ili menjao produkcijsku konfiguraciju. Nije potreban još jedan vlasnikov OTP pokušaj za ovu proveru. Granice od tri pokušaja po adresi i 500 ukupno već su testirane lokalnim transakcionim testovima i potvrđene produkcijskim parametrima; namerno nisu iscrpljivane na stvarnom SES-u.

Nema tvrdnje da su ovim pregledom provereni svi budući korisnici, performanse pod velikim opterećenjem, buduća inbox reputacija ili ukupni Firebase/AWS račun. Nisu čitani tuđi profili ili stari poslovni sadržaji. Direktne politike i prethodni lokalni/regresioni testovi ostaju dokumentovani u [izveštaju objave](otp-owner-deployment-report.md) i [pripremi](otp-owner-preparation-report.md).

## Sledeća celina

Kontrolisani owner tok ima potvrđeno stvarno slanje i prijavu, uključujući isti UID pri ponavljanju. Nisu potrebna dodatna AWS/Cloudflare/Zoho podešavanja za ovu probu.

Predlog je zasebno odobreno javno uključivanje OTP-a: ukloniti owner ograničenje kroz server konfiguraciju, promeniti podrazumevani klijentski UI na OTP i zadržati iste limite, resursne granice, zaštite uloga i UID pravila. Objavu izvesti usko, uz proveru kompatibilnosti i spreman povratak. Postojeći magic-link završni tok privremeno sačuvati za ranije poslate linkove i oporavak. Njegovo uklanjanje ide tek posle potvrde javne/default objave; provider za prijavu lozinkom majstora/admina ne gasiti.

Pre te objave treba predstaviti konkretan plan i sačekati odobrenje. Ovaj korisnikov izveštaj o uspešnoj probi nije protumačen kao odobrenje javne promene ili git push-a.

## Dokazi

Ignorisani `.firebase/otp-owner-validation/` sadrži `identity-receipts.json`, `runtime-events.json` i `production-context.json`. Aktuelni produkcijski inventar i metapodaci potvrđeni su postojećim stage verifier-om; početni baseline i odobreni plan ostaju sačuvani. Ovi privatni dokazi ne idu u git.
