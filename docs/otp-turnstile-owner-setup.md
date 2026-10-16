# Turnstile i OTP tajne — uputstvo za vlasnika

5. oktobar 2026. Tehnička priprema je odobrena. Secret Manager API u postojećem Firebase/Google projektu je uključen i potvrđen. OTP ostaje zatvoren; ovaj korak priprema resurse pre posebno odobrene produkcijske objave.

**Status 5. oktobra 2026: vlasnikov deo i operativna priprema tajni su završeni.** Obe tajne imaju jednu omogućenu verziju i potreban scoped IAM pristup. Javni Site key je lokalno konfigurisan; magic-link ostaje aktivan. Koraci ispod su referenca i ne ponavljaju se radi kreiranja dodatnih verzija. Stvarna provera na domenu i objava još nisu izvršene.

## 1. Napravi Cloudflare widget

Otvori [Turnstile u svom Cloudflare nalogu](https://dash.cloudflare.com/?to=/:account/turnstile). Izaberi isti nalog na kome imaš domen majstorsada.rs. Turnstile se otvara na nivou naloga, kroz njegov meni; ovo nije DNS stranica.

Klikni **Add widget** i popuni:

| Polje | Izbor |
| --- | --- |
| Widget name | MajstorSada OTP |
| Hostname management | majstorsada.rs i www.majstorsada.rs |
| Widget mode | Managed |
| Pre-clearance | No / isključeno |

Hostnames unosi bez `https://` i putanje. Kod već određuje action `client_otp` i vezu provere sa trenutnim zahtevom; to ne unosiš u Cloudflare formu. Klikni **Create**. Ovaj postupak je usklađen sa [Cloudflare uputstvom](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/).

Dobićeš dve različite vrednosti:

- **Site key**: javni identifikator widget-a. Njega možeš dostaviti u chat za konfiguraciju aplikacije.
- **Secret key**: serverska tajna. Kopiraš je direktno u Google obrazac iz sledećeg koraka. Ne šalješ je u chat, screenshot ili aplikacijski dotenv.

Managed provera u našem ekranu radi pri zahtevu za kod, a prikazuje se kada je potrebna interakcija. To odgovara [postojećim Turnstile opcijama](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).

## 2. Sačuvaj Secret key u Google Secret Manager-u

Otvori [Secret Manager za naš projekat](https://console.cloud.google.com/security/secret-manager?project=majstorsada-b2ad4). Prijavi se Google nalogom koji ima pristup Firebase projektu. Proveri da je izabran projekat **majstorsada-b2ad4**; to je isti projekat koji već koristi aplikacija.

1. Klikni **Create secret**.
2. **Name**: `OTP_TURNSTILE_SECRET`, tačno tim velikim slovima.
3. **Secret value**: nalepi Cloudflare **Secret key**, bez dodavanja navodnika, razmaka ili novog reda.
4. Ako se prikaže **Secret type**, može ostati **Other**.
5. Ostavi globalni secret sa **Automatic replication** i Google upravljanim šifrovanjem, odnosno podrazumevana podešavanja. Raspored rotacije ostaje nepodešen.
6. Klikni **Create secret**.
7. U **Versions** treba da postoji jedna verzija sa stanjem **Enabled**.

Google obrazac čuva vrednost i kreira početnu verziju, prema [zvaničnom uputstvu](https://docs.cloud.google.com/secret-manager/docs/creating-and-accessing-secrets). Ako secret sa ovim imenom već postoji, pregledamo ga pre promene; postojeći se ne prepisuje niti mu se automatski dodaje druga verzija.

`OTP_HMAC_SECRET` i IAM pristup završiće tehnički operator nakon potvrde ovog koraka. HMAC je zasebna, nasumično generisana aplikacijska tajna; nije Cloudflare Secret key.

## 3. Javi da je završeno

Pošalji javni **Site key** i napiši da je `OTP_TURNSTILE_SECRET` kreiran. Za vizuelnu potvrdu mogu se dostaviti widget podešavanja bez vidljivog Secret key-a i Google lista verzija koja pokazuje naziv/stanje. Prikaz same tajne nije potreban.

Zatim operator:

1. Read-only proverava tačan projekat, globalni secret, verziju i direktne IAM politike, bez čitanja sačuvane tajne.
2. Ako HMAC secret ne postoji, generiše 32 nasumična bajta i čuva ih direktno u Secret Manager-u, bez upisa vrednosti u fajl/log.
3. Dodaje samo `roles/secretmanager.secretAccessor` namenskom `otp-runtime` identitetu na tačno dve pojedinačne tajne, uz očuvanje postojećih uslova i prava drugih identiteta.
4. Dopunjuje lokalnu javnu frontend konfiguraciju Site key-em, uz očuvanje magic-link režima i zatvorenih serverskih gate-ova.
5. Proverava rezultat i daje izveštaj pre produkcijske objave.

Read-only pregled dokazuje konfiguraciju i dostupnost metapodataka. Ispravna pripadnost Site key/Secret key-a i stvarni widget proveravaju se tokom kasnije odobrene cloud provere na domenu aplikacije.

## Trošak i granice

Turnstile Free plan obuhvata neograničen broj provera, pa nam je dovoljan jedan widget sa dva navedena domena. [Cloudflare planovi](https://developers.cloudflare.com/turnstile/plans/).

Secret Manager uključuje šest aktivnih verzija i 10.000 čitanja vrednosti mesečno, zajedno za billing nalog. Planiramo dve verzije; uklapaju se u besplatnu kvotu ako druge tajne tog naloga ne zauzimaju ostatak. Disabled verzije se takođe računaju kao aktivne. Upravljanje resursima se ne naplaćuje. [Google cenovnik](https://cloud.google.com/secret-manager/pricing).

Firebase čita vezane tajne pri pokretanju nove instance, a postojeći kod ne šalje Secret Manager zahtev za svaki OTP. Slanje vezuje dve tajne, a provera koda samo HMAC. Tri čitanja po novoj prijavi je ilustracija kada slanje i provera bez ponovnog slanja pokrenu po jednu hladnu instancu: 100 prijava/dan tokom 30 dana = 9.000 čitanja, unutar kvote od 10.000 ako ostale tajne billing naloga ne potroše preostali deo. Ovo je primer, a ne garantovana granica potrošnje. Stvarna potrošnja zavisi od pokretanja instanci i drugih tajni naloga. Ovo nije celokupan Firebase račun. [Firebase ponašanje tajni](https://firebase.google.com/docs/functions/config-env#how_secrets_are_billed).