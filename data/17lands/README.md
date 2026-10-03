# 17Lands Card Data exports

Put the files you download from 17Lands' Card Data page here and commit them.

1. Open the set's export link (run `npm run status` to list them). It opens the Table view with every column group on.
2. Keep the defaults: All time, all users, no color, rarity or deck filters.
3. Choose **Export data → Download as CSV**.

Keep the downloaded names (`card-ratings-YYYY-MM-DD.csv`, sometimes with ` (1)`); the date in the name is the export date. Keep old exports: each new one is checked against the previous one. The set is recognized from the card names, and the format comes from `data/config/sets.json`. To override the format for one file, put an exact 17Lands event name in its name, for example `card-ratings-2026-10-03 QuickDraft.csv`.
