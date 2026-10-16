# AWS uloga za slanje OTP mejlova

Status 5. oktobra 2026: vlasnik je kreirao ulogu; kompletni dostavljeni prikazi politika su pregledani i lokalni ARN je podešen. [Završni izveštaj](otp-aws-preparation-report.md). Uputstvo ispod ostaje zapis urađenih koraka; ulogu ne kreirati ponovo.

Google priprema je završena. Sada vlasnik u već otvorenom AWS nalogu kreira jednu IAM ulogu. IAM je globalni servis; SES dozvola u pripremljenoj politici ograničena je na Frankfurt. Ovaj korak ne šalje mejlove i ne menja Zoho, DNS ili prijavu na sajtu.

## 1. Kreiranje uloge

1. U AWS pretrazi upisati **IAM** i otvoriti servis.
2. Proveriti da je otvoren AWS nalog **722769295504**. To je nalog u kome je potvrđen SES domen `majstorsada.rs`.
3. Levo **Roles**, pa **Create role**.
4. Izabrati **Custom trust policy**.
5. Otvoriti `ops/otp-aws-trust.json` iz projekta i kopirati ceo sadržaj, od prve `{` do poslednje `}`. Zalepiti umesto početne politike. Nema placeholder-a ili brojeva za ručnu zamenu.
6. **Next**. Na ekranu za permissions ne dodavati managed policies; prava ćemo uneti kao tačnu inline politiku odmah posle kreiranja. Nastaviti sa **Next**.
7. **Role name**: `MajstorSadaOtpSender`.
8. **Description**: `Client OTP email sending from the dedicated MajstorSada Google runtime.`
9. Pregledati trust policy i kreirati sa **Create role**. Ako postoji istoimena uloga ili konzola prijavi grešku u politici, prvo pregledati postojeće stanje; ne zamenjivati ga drugom širokom ulogom.

Trust policy veruje samo stvarnom novom Google identitetu `114954723264955273114` i audience-u `majstorsada-otp-ses`. Dodatni Google OIDC provider nije potreban; ne praviti IAM user, SMTP user ili access key.

## 2. Dozvola za SES

1. Otvoriti upravo kreiranu ulogu **MajstorSadaOtpSender**.
2. Tab **Permissions** → **Add permissions** → **Create inline policy**.
3. U policy editor-u izabrati **JSON**.
4. Otvoriti `ops/otp-aws-send.json` i kopirati ceo sadržaj. Zalepiti umesto početnog JSON-a.
5. Nastaviti (**Next**, odnosno **Review policy**, zavisno od prikaza konzole).
6. **Policy name**: `MajstorSadaOtpSesSend`.
7. Kreirati politiku.

Politika dozvoljava samo `ses:SendEmail`, za postojeći SES domain identity u Frankfurtu, sa pošiljaocem `noreply@majstorsada.rs` i feedback adresom `aleksa@majstorsada.rs`. Ne dodavati `AmazonSESFullAccess`, administratorsku ili drugu politiku ovoj ulozi.

## 3. Potvrda

Na ulozi treba da postoji jedna inline permissions policy i tačna trust policy iz pripremljenog fajla. Kopirati **Role ARN** iz vrha stranice i dostaviti ga za sledeću konfiguraciju. ARN je javni identifikator, nije tajna. Ako je uloga napravljena sa navedenim imenom i bez posebne putanje, očekivani ARN je `arn:aws:iam::722769295504:role/MajstorSadaOtpSender`; ipak kopirati stvarni ARN sa AWS stranice.

Limit od 500 OTP pokušaja u 24 sata implementiran je i proveren u lokalnom serverskom kodu sa zajedničkom bazom. Postaje operativan tek nakon odobrene OTP objave. AWS IAM politika određuje ko i sa koje adrese sme da šalje, ne sprovodi tu dnevnu aplikacijsku kvotu. Stvarno preuzimanje privremenih AWS dozvola i SES slanje potvrđuju se kasnije, u ograničenoj proveri posle odobrene objave.

## Izvori

- [AWS kreiranje uloge sa custom trust policy](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-custom.html)
- [AWS IAM politike](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_manage-edit.html)
- [AWS Google condition keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html)