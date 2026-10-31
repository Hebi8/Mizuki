import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { remarkMarkSectionized } from "../src/plugins/remark-mark-sectionized.mjs";

const layoutSource = await readFile(
	new URL("../src/layouts/Layout.astro", import.meta.url),
	"utf8",
);

const headTagsSource = await readFile(
	new URL("../src/layouts/partials/HeadTags.astro", import.meta.url),
	"utf8",
);

const gridScriptsSource = await readFile(
	new URL("../src/layouts/partials/GridScripts.astro", import.meta.url),
	"utf8",
);

const mainGridLayoutSource = await readFile(
	new URL("../src/layouts/MainGridLayout.astro", import.meta.url),
	"utf8",
);

const rightSidebarLayoutSource = await readFile(
	new URL("../src/scripts/right-sidebar-layout.js", import.meta.url),
	"utf8",
);

const siteConfigSource = await readFile(
	new URL("../src/config/siteConfig.ts", import.meta.url),
	"utf8",
);

const responsiveLayoutStyles = await readFile(
	new URL("../src/styles/layout-responsive.css", import.meta.url),
	"utf8",
);

const gridLayoutUtilsSource = await readFile(
	new URL("../src/utils/grid-layout-utils.ts", import.meta.url),
	"utf8",
);

const settingsPanelSource = await readFile(
	new URL(
		"../src/components/features/settings/SettingsPanel.svelte",
		import.meta.url,
	),
	"utf8",
);

const translationSources = await Promise.all(
	["en", "zh_CN", "zh_TW", "ja"].map((lang) =>
		readFile(
			new URL(`../src/i18n/languages/${lang}.ts`, import.meta.url),
			"utf8",
		),
	),
);

const postContentRailStyles = await readFile(
	new URL("../src/styles/post-content-rails.css", import.meta.url),
	"utf8",
);

describe("Page layout variant regressions", () => {
	it("keeps the post layout variant synchronized across Swup navigation", () => {
		assert.match(layoutSource, /data-layout-variant=\{layoutVariant\}/);
		assert.match(
			mainGridLayoutSource,
			/const layoutVariant = postSlug \? "post" : isHomePage \? "home" : "default"/,
		);
		assert.match(
			gridScriptsSource,
			/document\.addEventListener\("swup:page:view", function \(\) \{\s*syncLayoutVariant\(\)/,
		);
	});

	it("expands only post pages with bounded wide-screen dimensions", () => {
		assert.match(
			responsiveLayoutStyles,
			/:root\s*\{[\s\S]*?--layout-page-width:\s*var\(--page-width\)/,
		);
		assert.match(
			responsiveLayoutStyles,
			/@media \(width >= 1920px\)[\s\S]*?html\[data-ultrawide-post="true"\]\[data-layout-variant="post"\][\s\S]*?--layout-page-width:\s*clamp\(104rem, 82vw, 132rem\)/,
		);
		assert.match(
			responsiveLayoutStyles,
			/@media \(width >= 3200px\)[\s\S]*?--layout-page-width:\s*clamp\(132rem, 64vw, 152rem\)/,
		);
		assert.match(
			responsiveLayoutStyles,
			/--layout-sidebar-width:\s*clamp\(17\.5rem, 14vw, 19rem\)/,
		);
		assert.match(gridLayoutUtilsSource, /var\(--layout-sidebar-width\)/);
		assert.match(
			gridLayoutUtilsSource,
			/grid-cols-\[var\(--layout-sidebar-width\)_minmax\(0,1fr\)_var\(--layout-sidebar-width\)\]/,
		);
		assert.match(
			gridLayoutUtilsSource,
			/transition-swup-fade overflow-hidden min-w-0 w-full/,
		);

		const qhdPageWidth = Math.min(132 * 16, Math.max(104 * 16, 2560 * 0.82));
		const uhdPageWidth = Math.min(152 * 16, Math.max(132 * 16, 3840 * 0.64));
		assert.ok(qhdPageWidth / 2560 >= 0.8);
		assert.ok(uhdPageWidth / 3840 >= 0.63);
	});

	it("grows the post reading rail with the wide-screen post card", () => {
		assert.match(
			responsiveLayoutStyles,
			/@media \(width >= 1920px\)[\s\S]*?--post-reading-width:\s*clamp\(48rem, 40vw, 64rem\)/,
		);
		assert.match(
			responsiveLayoutStyles,
			/@media \(width >= 3200px\)[\s\S]*?--post-reading-width:\s*clamp\(64rem, 20vw \+ 24rem, 72rem\)/,
		);

		const readingWidth = (viewport) =>
			viewport >= 3200
				? Math.min(72 * 16, Math.max(64 * 16, viewport * 0.2 + 24 * 16))
				: viewport >= 1920
					? Math.min(64 * 16, Math.max(48 * 16, viewport * 0.4))
					: 48 * 16;

		assert.equal(readingWidth(1920), 48 * 16, "no jump at the first step");
		assert.equal(readingWidth(3200), 64 * 16, "no jump at the second step");
		assert.equal(readingWidth(2560), 64 * 16);
		assert.equal(readingWidth(3840), 72 * 16);

		for (const viewport of [1920, 2560, 3200, 3840]) {
			assert.ok(
				readingWidth(viewport) >= readingWidth(viewport - 320),
				`the rail must not shrink as the viewport grows at ${viewport}px`,
			);
		}
	});

	it("keeps the wide-screen post layout switchable and pre-painted", () => {
		assert.match(
			siteConfigSource,
			/ultrawidePostLayout:\s*\{[\s\S]*?enable:\s*false[\s\S]*?allowSwitch:\s*true/,
			"the wide-screen layout ships disabled and visitor-switchable",
		);
		assert.match(
			layoutSource,
			/data-ultrawide-post=\{siteConfig\.ultrawidePostLayout\?\.enable \? "true" : "false"\}/,
			"the configured default must render into the static HTML",
		);
		assert.match(
			headTagsSource,
			/localStorage\.getItem\("ultrawidePostLayout"\)/,
			"the stored preference must be applied before the first paint",
		);
		assert.match(
			headTagsSource,
			/document\.documentElement\.dataset\.ultrawidePost = String\(/,
		);

		for (const gatedRule of [
			/--layout-page-width:\s*clamp\(104rem/,
			/--layout-page-width:\s*clamp\(132rem/,
		]) {
			const block = responsiveLayoutStyles
				.split("@media")
				.find((chunk) => gatedRule.test(chunk));
			assert.ok(
				block?.includes('html[data-ultrawide-post="true"]'),
				"every wide-screen override must sit behind the opt-out attribute",
			);
		}

		assert.match(
			settingsPanelSource,
			/getStoredUltrawidePostLayout\(\)/,
			"the panel must restore the stored preference on mount",
		);
		assert.match(
			settingsPanelSource,
			/\{#if isUltrawidePostLayoutSwitchable\}[\s\S]*?i18n\(I18nKey\.settingsFeatures\)[\s\S]*?i18n\(I18nKey\.ultrawidePostLayout\)/,
			"the toggle must live in its own Features group",
		);

		for (const translation of translationSources) {
			assert.match(translation, /\[Key\.ultrawidePostLayout\]:/);
			assert.match(translation, /\[Key\.ultrawidePostLayoutHint\]:/);
			assert.match(translation, /\[Key\.settingsFeatures\]:/);
		}
	});

	it("keeps the global grid preference effective on article pages", () => {
		assert.doesNotMatch(
			gridScriptsSource,
			/function getCurrentPostListLayout\(\) \{[\s\S]*?layoutVariant === "post"[\s\S]*?\n\t\}/,
		);
		assert.doesNotMatch(rightSidebarLayoutSource, /function isPostPage\(/);
		assert.match(
			rightSidebarLayoutSource,
			/function getPostListLayout\(\) \{\s*return isLayoutSwitchEnabled\(\)/,
		);
		assert.match(
			rightSidebarLayoutSource,
			/window\.addEventListener\("layoutChange", \(\) => \{\s*applyCurrentPageLayout\(\)/,
		);
		assert.match(
			rightSidebarLayoutSource,
			/event\.key === "postListLayout"\) \{\s*applyCurrentPageLayout\(\)/,
		);
		assert.doesNotMatch(
			rightSidebarLayoutSource,
			/const layout = event\.detail\.layout/,
		);
	});
});

describe("Post content rails", () => {
	it("separates the post reading rail from intrinsically wide content", () => {
		assert.ok(
			layoutSource.includes('import "../styles/post-content-rails.css";'),
			"post rail styles must follow every Markdown rendering path",
		);
		assert.match(responsiveLayoutStyles, /--post-reading-width:\s*48rem/);
		assert.match(
			postContentRailStyles,
			/\.markdown-content\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none\s*!important/,
			"the Markdown root must expose the whole post card to both rails",
		);
		assert.match(
			postContentRailStyles,
			/:where\(\.markdown-content, \.markdown-section\)[\s\S]*?>\s*\*\s*\{[\s\S]*?max-width:\s*min\(100%, var\(--post-reading-width\)\)[\s\S]*?margin-inline-start:\s*0;[\s\S]*?margin-inline-end:\s*auto/,
			"ordinary Markdown blocks must stay on a left-aligned reading rail",
		);
		assert.match(
			postContentRailStyles,
			/\.markdown-section\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;[\s\S]*?margin-inline:\s*0/,
			"generated section wrappers must not add another reading-rail indent",
		);

		for (const wideContentClass of [
			"table-wrapper",
			"expressive-code",
			"rehype-code-group",
			"katex-display",
			"mermaid-diagram-container",
			"image-grid",
		]) {
			assert.ok(
				postContentRailStyles.includes(`.${wideContentClass}`),
				`${wideContentClass} must opt into the wide-content rail`,
			);
		}

		assert.match(
			postContentRailStyles,
			/:where\(\.markdown-content, \.markdown-section\)[\s\S]*?>\s*:is\([\s\S]*?\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin-inline-start:\s*0;[\s\S]*?margin-inline-end:\s*0/,
			"only direct document-flow blocks may occupy the full wide rail",
		);
		assert.doesNotMatch(
			postContentRailStyles,
			/\.markdown-content\s+section|section\s*>\s*:is/,
			"raw or nested section elements must not opt into document rails",
		);
	});

	it("marks only remark-sectionize document sections", () => {
		const sectionized = {
			type: "section",
			data: {
				hName: "section",
				hProperties: { className: ["existing-section-class"] },
			},
			children: [],
		};
		const authoredHtml = {
			type: "html",
			value: "<section><pre>keep local indentation</pre></section>",
		};
		const tree = { type: "root", children: [sectionized, authoredHtml] };

		remarkMarkSectionized()(tree);

		assert.deepEqual(sectionized.data.hProperties.className, [
			"existing-section-class",
			"markdown-section",
		]);
		assert.equal(authoredHtml.data, undefined);
	});
});

it("keeps reading rails opt-in and limited to wide screens", () => {
	assert.match(postContentRailStyles, /@media \(width >= 1920px\)/);
	assert.doesNotMatch(postContentRailStyles, /html\[data-layout-variant/);
	assert.match(postContentRailStyles, /html\[data-ultrawide-post="true"\]/);
});
