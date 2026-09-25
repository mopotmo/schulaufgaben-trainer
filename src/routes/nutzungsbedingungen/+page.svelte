<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { OPERATOR, PROJECT } from '$lib/config';
</script>

<LegalPage title="Nutzungsbedingungen" updated="September 2026">
	<h2>Was das hier ist</h2>
	<p>
		{PROJECT.name} ist ein privates, kostenloses Angebot zum Üben von Schulaufgaben. Es steht in
		<strong>keinem Zusammenhang mit einer Schule</strong>, einer Lehrkraft oder einer Schulbehörde.
		Nichts, was hier passiert, ist eine Leistungsbewertung.
	</p>

	<h2>Zugang</h2>
	<ul>
		<li>Der Zugang ist eingeladenen Familien vorbehalten. Es gibt keine offene Registrierung.</li>
		<li>Zugangsdaten sind nicht zur Weitergabe bestimmt.</li>
		<li>Jede Familie sieht ausschließlich ihre eigenen Profile, Aufgaben und Korrekturen.</li>
	</ul>

	<h2>Einsatz von künstlicher Intelligenz</h2>
	<p>
		Dieses Angebot arbeitet durchgehend mit KI. Konkret heißt das:
	</p>
	<ul>
		<li>Die Übungsaufgaben werden von einem KI-Modell erzeugt, nicht von einer Lehrkraft.</li>
		<li>Eingereichte Lösungen werden von einer KI gelesen und korrigiert — auch handschriftliche.</li>
		<li>Die angezeigte Note ist eine Schätzung der KI anhand des Korrekturberichts.</li>
		<li>Wer im Trainer eine Rückfrage stellt, schreibt mit einer KI und nicht mit einem Menschen.</li>
		<li>
			Aus Korrekturen und Rückmeldungen leitet das System Hinweise zum Lernstand ab und nutzt sie,
			um die nächsten Aufgaben anzupassen.
		</li>
	</ul>
	<p>
		An allen Stellen, an denen KI-erzeugte Inhalte erscheinen, steht ein entsprechender Hinweis.
		Welcher Anbieter dahintersteht und wohin die Daten gehen, steht in der
		<a href="/datenschutz">Datenschutzerklärung</a>.
	</p>

	<h2>KI-Korrekturen können falsch sein</h2>
	<p>
		Aufgaben und Korrekturen werden von einem KI-Modell erzeugt. Sie können <strong>fachlich falsch,
		unvollständig oder unpassend</strong> sein — auch dann, wenn sie überzeugend klingen. Bitte lesen
		Sie als Eltern gegen, bevor Ihr Kind eine Korrektur als richtig übernimmt. Eine Note, die das
		System anzeigt, ist eine Schätzung und keine Bewertung.
	</p>

	<h2>Verfügbarkeit</h2>
	<p>
		Es besteht kein Anspruch auf Verfügbarkeit. Das Angebot kann jederzeit und ohne Vorankündigung
		eingestellt werden; in diesem Fall werden die gespeicherten Daten gelöscht.
	</p>

	<h2>Keine Weitergabe von Ergebnissen</h2>
	<p>
		Ergebnisse, Korrekturen und Fortschritte werden nicht an die Schule, an Lehrkräfte oder an
		sonstige Dritte weitergegeben.
	</p>

	<h2>Hochgeladene Schulbücher</h2>
	<p>
		Ein hochgeladenes Schulbuch ist eine Kopie eines urheberrechtlich geschützten Werks. Das
		Urheberrecht erlaubt das nur in engen Grenzen, deshalb gilt:
	</p>
	<ul>
		<li>Hochladen dürfen Sie nur Schulbücher, die Ihnen oder Ihrem Haushalt gehören.</li>
		<li>
			Ein hochgeladenes Buch steht ausschließlich Ihrer Familie zur Verfügung. Andere Familien
			sehen es nicht. Die Datei darf nicht an Dritte weitergegeben werden.
		</li>
		<li>
			Wird ein Buch 90 Tage lang nicht zum Erzeugen von Aufgaben genutzt, wird es automatisch
			gelöscht, spätestens zum Ende des Schuljahres am 31. August. In Sicherungskopien kann es
			danach noch bis zu 30 Tage vorhanden sein.
		</li>
	</ul>

	<h2>Fragen</h2>
	<p>
		Bei Fragen oder Problemen: <a href="mailto:{OPERATOR.email}">{OPERATOR.email}</a>. Wer das
		Angebot nicht mehr nutzen möchte, schreibt an dieselbe Adresse — die Daten werden dann gelöscht.
	</p>
</LegalPage>
