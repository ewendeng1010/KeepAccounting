# KeepAccounting

Une application de comptabilité simple basée sur Node.js et SQLite, prenant en charge :

- L'inscription et la connexion des utilisateurs
- L'ajout d'enregistrements de revenus/dépenses
- L'affichage du revenu total, des dépenses totales et du solde
- Le filtrage des enregistrements par plage de dates
- La persistance des données dans une base de données SQLite

## Mode de démarrage

```bash
node server.js
```

Après le démarrage, accédez à :

```text
http://localhost:3000
```

## Emplacement de la base de données

Le fichier de base de données par défaut sera créé à l'emplacement suivant :

```text
data/accounting.db
```

Si vous souhaitez personnaliser le chemin du fichier de base de données, vous pouvez transmettre la variable d'environnement `DB_PATH` au démarrage.