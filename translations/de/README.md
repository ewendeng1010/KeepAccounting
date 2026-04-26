# KeepAccounting

Eine einfache Buchhaltungsanwendung basierend auf Node.js und SQLite mit folgenden Funktionen:

- Benutzerregistrierung und -anmeldung
- Hinzufügen von Einnahmen-/Ausgabenbuchungen
- Anzeige von Gesamteinnahmen, Gesamtausgaben und Saldo
- Filtern von Buchungen nach Datumsbereich
- Persistierung der Daten in einer SQLite-Datenbank

## Starten

```bash
node server.js
```

Nach dem Start aufrufen:

```text
http://localhost:3000
```

## Datenbankpfad

Die Standarddatenbankdatei wird erstellt unter:

```text
data/accounting.db
```

Wenn Sie einen benutzerdefinierten Pfad für die Datenbankdatei festlegen möchten, können Sie beim Start die Umgebungsvariable `DB_PATH` übergeben.