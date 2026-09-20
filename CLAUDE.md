# Schulaufgaben Trainer — Arbeitsanweisungen

SvelteKit + Tailwind + Directus + Anthropic API. Deployment über Coolify auf Hetzner (Nürnberg).
PDF-Erzeugung mit Puppeteer.

## Kontext

Die App wird demnächst für Familien außerhalb des eigenen Haushalts geöffnet (Klassenkameradinnen).
Damit gelten DSGVO-Pflichten und die Datentrennung zwischen Familien muss belastbar sein.

Vor größeren Änderungen lesen:

- `docs/klassen-freigabe-konzept.md` — rechtlicher Rahmen, Rollenmodell, Gesamtplan
- `docs/spec-gruppen-rollen-einwilligung.md` — konkrete Umsetzungs-Spec für den aktuellen Umbau

## Harte Regeln

1. **Kein `getDirectus()` in Route-Handlern.** Jeder Datenzugriff läuft über `src/lib/server/repo/*`.
   Prüfbar mit `grep -rn "getDirectus" src/routes/` — muss leer bleiben.
2. **Jede ID aus Request-Daten ist nicht vertrauenswürdig.** Wenn eine `profileId`, `exerciseId`,
   `bookId` o. ä. aus Form, Query oder Params kommt, muss vor der Nutzung gegen den Session-Scope
   geprüft werden (`assertInScope`). Nie `readItem()` direkt auf eine übergebene ID.
3. **Nie einen Directus-Filter aus einem möglicherweise null-wertigen Wert bauen.**
   `{ _eq: null }` matcht in Directus alle NULL-Zeilen statt keiner. Erst validieren, dann filtern.
4. **Keine externen Ressourcen im Frontend.** Keine CDN-Skripte, keine Google Fonts, keine Analytics.
   Alles selbst ausliefern — sonst wird ein Cookie-Banner nötig.
5. **Nur technisch notwendige Cookies.** Aktuell genau eines: die Session.
6. **Keine Klarnamen von Kindern.** Profile tragen Vorname oder Spitzname. Kein Nachname,
   kein Geburtsdatum, kein Schulname im Klartext.
7. **Keine Lehrer-Funktionen ausliefern.** Die Rolle existiert im Datenmodell, bekommt aber
   vorerst keine UI und keine Berechtigungen.

## Arbeitsweise

- **Erst fragen, dann bauen.** Bei unklarer oder unvollständiger Aufgabenstellung, oder wenn der
  Code von der Spec abweicht: nachfragen statt raten.
- Änderungen am Datenmodell immer zuerst in Directus, dann im Code — und die Typen in
  `src/lib/directus.ts` mitziehen.
- Vor jeder Migration: DB-Backup. Nicht optional.
- Nach größeren Änderungen `npm run build` und `npm run check` laufen lassen.
- Mehrere Lösungsansätze vorschlagen, wenn es mehr als einen sinnvollen gibt.

## Bekannte offene Punkte

Siehe `docs/spec-gruppen-rollen-einwilligung.md`, §1 (Berechtigungslücke) und §10 (offene Fragen).
