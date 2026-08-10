import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const layoutSource = await readFile(
	new URL("../src/layouts/Layout.astro", import.meta.url),
	"utf8",
);
const headTagsSource = await readFile(
	new URL("../src/layouts/partials/HeadTags.astro", import.meta.url),
	"utf8",
);
const siteConfigSource = await readFile(
	new URL("../src/config/siteConfig.ts", import.meta.url),
	"utf8",
);
const bannerStyles = await readFile(
	new URL("../src/styles/banner.css", import.meta.url),
	"utf8",
);
const markdownExtendStyles = await readFile(
	new URL("../src/styles/markdown-extend.styl", import.meta.url),
	"utf8",
);

describe("Markdown layout regressions", () => {
	it("keeps admonition titles separated from every first content block", () => {
		assert.match(
			markdownExtendStyles,
			/> \.bdm-title\s+[\s\S]*?margin-bottom:\s*\.5rem/,
			"admonition titles must provide their own positive content gap",
		);
		assert.match(
			markdownExtendStyles,
			/> \.bdm-title \+ \*\s+[\s\S]*?margin-top:\s*0/,
			"the first admonition child must not add content-type-specific spacing",
		);
		assert.doesNotMatch(
			markdownExtendStyles,
			/\.bdm-title\s+[\s\S]*?margin-bottom:\s*-/,
			"negative title margins pull marginless content such as tables into the title",
		);
	});
});

describe("Fullscreen banner layout regressions", () => {
	it("does not apply the standard banner sticky compensation in fullscreen", () => {
		assert.match(
			bannerStyles,
			/body\.enable-banner\.fullscreen-banner #main-grid\s*\{[^}]*transform:\s*translateY\(0\)/s,
			"fullscreen must continue to remove the banner extension transform",
		);

		for (const stickyId of [
			"sidebar-sticky",
			"left-sidebar-sticky",
			"right-sidebar-sticky",
		]) {
			assert.ok(
				layoutSource.includes(
					`.enable-banner:not(.fullscreen-banner) #${stickyId}`,
				),
				`${stickyId} must exclude fullscreen from the banner offset compensation`,
			);
			assert.ok(
				!layoutSource.includes(`.enable-banner #${stickyId}`),
				`${stickyId} must not use the unscoped banner offset compensation`,
			);
		}
	});
});

describe("Page scaling regressions", () => {
	it("keeps root-font scaling opt-in and continuous across desktop widths", () => {
		assert.match(
			siteConfigSource,
			/pageScaling:\s*\{[\s\S]*?enable:\s*false/,
			"responsive layout must not depend on root-font scaling by default",
		);
		assert.doesNotMatch(
			headTagsSource,
			/window\.innerWidth\s*<=\s*1280/,
			"legacy scaling must not jump between 1280px and 1281px",
		);
		assert.match(
			headTagsSource,
			/Math\.max\(0\.85, currentWidth \/ targetWidth\)/,
			"opt-in legacy scaling must use one continuous clamp",
		);
	});
});

const cardTocSource = await readFile(
	new URL("../src/components/widgets/card-toc/CardTOC.astro", import.meta.url),
	"utf8",
);

const variablesSource = await readFile(
	new URL("../src/styles/variables.styl", import.meta.url),
	"utf8",
);

const mainStyles = await readFile(
	new URL("../src/styles/main.css", import.meta.url),
	"utf8",
);

describe("Post TOC regressions", () => {
	it("keeps one persistent post TOC and shares the configured depth", () => {
		assert.match(
			mainStyles,
			/body:has\(#page-overlay-data\[data-is-post="true"\]\) #toc-wrapper\s*\{\s*display:\s*none/,
		);
		assert.match(cardTocSource, /const tocDepth = siteConfig\.toc\.depth/);
		assert.match(cardTocSource, /maxLevel,/);
		assert.doesNotMatch(cardTocSource, /maxLevel:\s*3/);
		assert.match(
			variablesSource,
			/--toc-width:\s*clamp\(0rem,[\s\S]*?var\(--page-width\)[\s\S]*?22rem\)/,
		);
	});

});
