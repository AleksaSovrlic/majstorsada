# Kontrola troškova i životni vek poslova

Odobreno 18. septembra 2026. Implementacija na `codex/cost-control`; produkcijska objava i Git push slede odvojeno posle izveštaja.

## Dogovorena pravila

- Dva nova zahteva u klizna 24 sata po klijentu, razmak 60 sekundi i najviše dva neistekla zahteva na čekanju, uključujući započeto slanje.
- Istovremena slanja serijalizuje postojeći klijentski dokument. Ponovljen isti requestId ne zauzima novu kvotu; otkazivanje ne vraća dnevnu kvotu.
- Obrazac se ne čuva pre slanja. Nakon slanja, identifikator u browseru omogućava nastavak već sačuvanog zahteva bez duplikata.
- Rok za slanje fotografija 24 sata od kreiranja; spreman zahtev važi 24 sata od objavljivanja. Prihvaćen posao ne ističe.
- Završene, otkazane i istekle fotografije čuvaju se sedam dana od završetka/otkazivanja/evidentiranog isteka. Napuštena slanja zatvaraju se nakon 24 sata, pa čiste uz 10 minuta razmaka za tekuće funkcije.
- Istorija i recenzije po tri zapisa, starije stranice tek na zahtev. Administratorski pregledi po 20, aktivni poslovi uživo. Opisi, kontakt, ocene i evidencija žetona se ne brišu.
- Majstor bez žetona zadržava pregled i fotografije. Telefon je dostupan samo dodeljenom majstoru; email klijenta nije deo podataka za majstora.
- Nema promene UID-a niti uvođenja OTP-a; naredna prijava je email OTP, ne SMS.

## Tehničke odluke

- Cursor pagination za istoriju: jedan upit po tri zapisa, bez offset-a. Osvežavanje resetuje prikaz; nema trajnog keša privatne istorije.
- Aktivne pretplate ne učitavaju završene poslove. Nova ponuda ima početno ograničenje 20; korisnik eksplicitno proširuje aktivni prozor za još 20. To ponovo čita proširen prozor i zadržava realtime semantiku, umesto komplikovanih nestabilnih granica više realtime stranica.
- Odbijanja se čuvaju kao serverski zapisi po poslu, bez rasta profilnog niza sa limitom 200. Pri prikazu ponude proveravaju se samo odbijanja za učitane ID-ove. Ako su svi učitani poslovi odbijeni, kontrola za sledeće ostaje dostupna. Postojeći niz ostaje čitljiv za kompatibilnost.
- Rok važenja proverava transakcija prihvatanja i finalizacija fotografija. Periodični zadatak ne predstavlja jedinu zaštitu. Brisanje fotografija prvo zatvara pristup, radi po šest tačnih putanja i ponavlja neuspešne operacije; istorija se ne briše.
- Održavanje obrađuje ograničene grupe, inicijalno samo dry-run. Aktivni poslovi se nikada ne biraju za brisanje objavljenih fotografija.
- FCM obrađuje stranice majstora i tokena, uz serversku rezervaciju i sačuvan napredak. Potpuno exactly-once slanje preko FCM i Firestore nije garantovano; oporavak može ponoviti poslednju nedovršenu grupu. Isti posao koristi isti notification tag.
- Lokalna zaštita od naleta API poziva ne dodaje Firestore operacije, ali nije globalni limit niti potpuna bot zaštita. App Check zahteva zasebno podešavanje provajdera i proveru legitimnih browsera; ne uključivati naslepo.

## Obavezne provere

Transakcijske trke i ponavljanja; vremenske granice; otkazivanje/finalizacija/prihvatanje; dry-run i ponovljeno čišćenje; odbijanja preko 200; paginacija sa istim datumima; aktivni poslovi; privatnost i logout; obaveštenja; SSR/SEO i build guardovi. Emulatori ne dokazuju produkcijske indekse, IAM, isporuku poruka ili naplatu.

## Produkcijsko puštanje

1. Pregledati izveštaj i dry-run postojeće baze. Pregled 18. septembra nalazi samo tri završena test-posla, bez aktivnih poslova. Vlasnik je rekao da migracija test-poslova nije potrebna. Pred objavu ponoviti pregled i dogovoriti uklanjanje konkretnih test-poslova i njihovih fotografija ili zadržavanje stare istorije van nove foto-retencije; ništa se automatski ne briše. Ako se u međuvremenu pojave aktivni stari poslovi, zaustaviti objavu i odrediti njihove rokove pre promene upita.
2. Objaviti indekse i sačekati READY, uključujući query-scope indekse za posao i collection-group indekse za odbijanja i starost FCM tokena.
3. Kontrolisano objaviti usklađene API/rules/UI uz zatvoren write gate tokom promene. Potvrditi Node24 i postojeće budžete; novi održavač ima min0/max1 i 300 s, ostale funkcije ne povećavati.
4. Održavanje prvo ostaje `JOB_MAINTENANCE_ENABLED=false`; pregledati konkretne kandidate, pa omogućiti stvarnu obradu posle odobrenja produkcijske objave.
5. Primena budžeta iz ops/cost-control-budget.json: obaveštenja na $5/$10/$20, bez gašenja aplikacije. Valutu proveriti prema billing nalogu. Ne uključivati automatski spend cap.
6. Potvrditi indekse, sačuvane aktivne poslove i podatke, stvarnu notifikaciju, limite, istek i istoriju. Tek potom odobren Git push.


## Granice i oporavak

- Istek se sprovodi u API-ju odmah na granici roka. Ponuda majstora ima jedan tajmer do sledećeg isteka. Klijentski status i dugme ponovnog slanja prelaze u zatvorenu istoriju kada održavanje evidentira istek: obično do deset minuta kasnije, duže ako obrada kasni. Nema automatskog ponovnog slanja.
- Jedan prolaz obrađuje do 100 stavki svake vrste. Normalan kapacitet je do 14.400 dnevno po vrsti; greške i zaostaci ga smanjuju. Ponovljeni kvar jednog objekta ostavlja ga za sledeći prolaz; velika grupa trajno neispravnih kandidata zahteva intervenciju. Greške se beleže sa ERROR nivoom.
- Objavljivanje fotografija odmah pokušava brisanje privremenih kopija; dodatna provera nakon deset minuta uklanja ostatke. Stari FCM tokeni bez osvežavanja 90 dana brišu se uz update-time preuslov; istovremeno osvežen token ostaje. Prihvaćene fotografije ostaju koliko traje posao.
- Firestore pravila i dalje dopuštaju legitimno čitanje sopstvenih podataka. UI paginacija nije tvrdi serverski limit svih mogućih direktnih SDK upita. Lokalni API limiter ne zaustavlja napad sa mnogo naloga. Pre većeg marketinga pregledati App Check/metrike i kvalitet OTP ograničenja; ne obećavati zaštitu od svake zloupotrebe.
- Rollback: zatvoriti write gate, isključiti stvarno održavanje, vratiti prethodni usklađeni API/rules/UI. Aditivne indekse i nova polja ne uklanjati tokom incidenta. Već obrisane fotografije se ne vraćaju rollbackom aplikacije; postojeća Storage soft-delete politika pruža sedmodnevni operativni prozor oporavka koji treba zasebno proveriti.
- Nakon objave potvrditi Scheduler invoker/IAM, uspešan dry-run, indekse READY, budžetske primaoce i stvarni push na uređaj. Tek onda uključiti održavanje i ponoviti poslovni live test. Ne ostaviti održavanje trajno u dry-run režimu jer se red starih poslova tada ne prazni.


Status 24. septembra: kontrolisana objava i automatizovane produkcijske provere završene; održavanje i upisi uključeni, projektna upozorenja podešena u PLN. Vlasnik je potvrdio uspešnu live proveru i odobrio Git commit/push. Izvršeni koraci i prekid dokumentovani su u [cost-control-release.md](cost-control-release.md).
