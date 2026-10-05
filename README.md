# Loupe data branch

Written by the "Data and deploy" workflow: fetch-state.json (one 17Lands request per endpoint and set per UTC day),
filters/latest.json (the active-set list) and snapshots/SET/FORMAT/DATE.json (daily card data, newest 14 kept).
Never edit by hand; delete a snapshot here to make the next build ignore it.
