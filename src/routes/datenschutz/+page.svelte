<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { OPERATOR, PROCESSORS, PROJECT, SUPERVISORY_AUTHORITY, UPLOAD_RETENTION_DAYS } from '$lib/config';
	import { CONSENT_VERSION } from '$lib/legal';
</script>

<LegalPage title="Datenschutzerklärung" updated="September 2026">
	<p>Informationen nach Art. 13 DSGVO. Textversion: <code>{CONSENT_VERSION}</code></p>

	<h2>1. Verantwortlicher</h2>
	<p>
		{OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}<br />
		E-Mail: <a href="mailto:{OPERATOR.email}">{OPERATOR.email}</a> · <a href="/impressum">Impressum</a>
	</p>

	<h2>2. Zwecke der Verarbeitung</h2>
	<ul>
		<li>Erzeugung von Übungsaufgaben, passend zu Schulart, Jahrgangsstufe und Bundesland</li>
		<li>KI-gestützte Korrektur eingereichter Lösungen</li>
		<li>Anzeige des Lernfortschritts innerhalb der eigenen Familie</li>
	</ul>

	<h2>3. Rechtsgrundlage</h2>
	<p>
		Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO in Verbindung mit Art. 8 DSGVO. Da die Nutzenden
		Kinder unter 16 Jahren sind, wird die Einwilligung durch die Sorgeberechtigten erteilt. Sie wird
		beim ersten Anmelden im System erfasst und dort nachgehalten.
	</p>
	<p>
		Die Einwilligung gilt für alle Kinder, für die das sorgeberechtigte Elternteil in seinem
		Familienzugang ein Profil anlegt — auch für solche, die erst später hinzukommen. Beim Anlegen
		eines weiteren Profils wird die Sorgeberechtigung erneut bestätigt.
	</p>

	<h2>4. Welche Daten verarbeitet werden</h2>
	<ul>
		<li><strong>Profil des Kindes:</strong> Anzeigename (Vorname oder Spitzname), Schulart, Jahrgangsstufe, Bundesland, ein Emoji als Avatar</li>
		<li><strong>Eingaben:</strong> Fach, Thema, Hinweise der Lehrkraft, gewünschter Umfang</li>
		<li><strong>Hochgeladene Dateien:</strong> Fotos oder PDFs von Aufgabenblättern und handschriftlichen Lösungen</li>
		<li><strong>Erzeugte Inhalte:</strong> Übungsaufgaben, Korrekturtexte, daraus abgeleitete Lernhinweise</li>
		<li><strong>Kontaktdaten der einwilligenden Person:</strong> Name und E-Mail-Adresse</li>
		<li><strong>Technische Daten:</strong> ein Sitzungs-Cookie sowie Fehlerprotokolle des Servers</li>
	</ul>
	<p>
		Es werden bewusst <strong>keine Nachnamen der Kinder, keine Geburtsdaten und keine Schulnamen</strong>
		im Klartext erhoben.
	</p>

	<h2>5. Empfänger</h2>
	<ul>
		<li>
			<strong>{PROCESSORS.ai.name}</strong> ({PROCESSORS.ai.country}) — Auftragsverarbeiter für
			{PROCESSORS.ai.purpose}. Übermittelt werden die Eingaben und hochgeladenen Dateien, soweit sie
			für die Aufgabe nötig sind.
		</li>
		<li>
			<strong>{PROCESSORS.hosting.name}</strong> ({PROCESSORS.hosting.country}) —
			{PROCESSORS.hosting.purpose}. Die Server stehen in Deutschland.
		</li>
	</ul>
	<p>
		Mit beiden Anbietern besteht ein Vertrag zur Auftragsverarbeitung. Eine Weitergabe an sonstige
		Dritte findet nicht statt, insbesondere nicht an Schulen oder Lehrkräfte.
	</p>

	<h2>6. Übermittlung in die USA</h2>
	<p>
		Die Verarbeitung durch {PROCESSORS.ai.name} findet in den USA statt. Grundlage sind die
		Standardvertragsklauseln der EU-Kommission zusammen mit dem Auftragsverarbeitungsvertrag. Nach
		Auskunft des Anbieters werden über die Programmierschnittstelle übermittelte Daten nicht zum
		Training von Modellen verwendet.
	</p>

	<h2>7. Websuche</h2>
	<p>
		Bei der Erzeugung von Aufgaben kann das KI-Modell eine Websuche nutzen, um Lehrplanbezug oder
		Kapitelstruktur zu recherchieren. Dabei können das eingegebene <strong>Thema und Hinweise der
		Lehrkraft</strong> in Suchanfragen einfließen. Profildaten des Kindes werden dabei nicht
		übermittelt.
	</p>

	<h2>8. Speicherdauer</h2>
	<ul>
		<li>Hochgeladene Dateien: {UPLOAD_RETENTION_DAYS} Tage, danach automatische Löschung</li>
		<li>Aufgaben, Korrekturen und Lernhinweise: bis zur Löschung des Zugangs</li>
		<li>Nachweis der Einwilligung: bis zur Löschung des Zugangs, zur Erfüllung der Rechenschaftspflicht</li>
		<li>Fehlerprotokolle: kurzfristig, zur Fehlersuche</li>
	</ul>

	<h2>9. Ihre Rechte</h2>
	<p>
		Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
		Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20).
	</p>
	<p>
		<strong>Die Einwilligung können Sie jederzeit widerrufen</strong>, ohne dass dies die
		Rechtmäßigkeit der bis dahin erfolgten Verarbeitung berührt. Eine formlose Nachricht an
		<a href="mailto:{OPERATOR.email}">{OPERATOR.email}</a> genügt. Der Zugang und alle zugehörigen
		Daten werden dann binnen weniger Tage gelöscht.
	</p>
	<p>
		Unabhängig davon besteht ein Beschwerderecht bei einer Aufsichtsbehörde, für dieses Angebot beim
		{SUPERVISORY_AUTHORITY.name} in {SUPERVISORY_AUTHORITY.city}
		(<a href={SUPERVISORY_AUTHORITY.url} rel="noreferrer">{SUPERVISORY_AUTHORITY.url}</a>).
	</p>

	<h2>10. Keine automatisierte Entscheidung</h2>
	<p>
		Es findet <strong>keine automatisierte Entscheidung im Sinne des Art. 22 DSGVO</strong> statt.
		Die angezeigten Korrekturen und Notenschätzungen haben keine rechtliche Wirkung und keinen
		Einfluss auf schulische Bewertungen.
	</p>

	<h2>11. Cookies</h2>
	<p>
		{PROJECT.name} setzt genau ein Cookie: die Sitzungskennung, die Sie angemeldet hält. Sie ist
		technisch notwendig, enthält keine Tracking-Merkmale und wird nach 30 Tagen ungültig. Es werden
		keine Analysewerkzeuge, keine externen Schriftarten und keine Inhalte von Drittanbietern
		eingebunden.
	</p>
</LegalPage>
