# Vlastiti UCSS – redsun.hr

Noćna obnova iskorištenog CSS-a. Web (snippet „Vlastiti UCSS“) sam označava stranice kojima se promijenio sadržaj i do obnove ih servira s punim CSS-om. Ovaj posao svake noći:

1. pita web koje stranice trebaju obnovu (`rs_ucss_queue`),
2. za svaku generira iskorišteni CSS (posjetiteljska i obična verzija),
3. učitava ga „na čekanju“ i uspoređuje izgled s punim CSS-om (mobitel i desktop, raspored svih elemenata, piksele, izbornik),
4. uključuje ga samo ako je izgled isti; inače stranica ostaje na punom CSS-u, a GitHub šalje e-mail.

Ručno pokretanje: Actions → UCSS obnova → Run workflow (ili gumb u WordPressu: Alati → Vlastiti UCSS).

Tajna postavka repozitorija: `RS_UCSS_TOKEN`.
