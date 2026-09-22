<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { OPERATOR, PROJECT } from '$lib/config';
</script>

<LegalPage title="Impressum" updated="September 2026">
	<p>
		Angaben nach § 5 DDG. {PROJECT.name} ist ein privates, kostenloses Angebot ohne
		Gewinnerzielungsabsicht.
	</p>

	<h2>Verantwortlich</h2>
	<p>
		{OPERATOR.name}<br />
		{OPERATOR.street}<br />
		{OPERATOR.city}<br />
		{OPERATOR.country}
	</p>

	<h2>Kontakt</h2>
	<p>E-Mail: <a href="mailto:{OPERATOR.email}">{OPERATOR.email}</a></p>

	<h2>Hinweise</h2>
	<ul>
		<li>Kein Handelsregistereintrag, keine Umsatzsteuer-Identifikationsnummer.</li>
		<li>Keine Aufsichtsbehörde im Sinne einer Zulassung — das Angebot ist nicht gewerblich.</li>
		<li>Das Angebot steht in keinem Zusammenhang mit einer Schule oder Schulbehörde.</li>
	</ul>
</LegalPage>
