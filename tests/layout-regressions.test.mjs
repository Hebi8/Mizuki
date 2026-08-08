import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const layoutSource = await readFile(
	new URL("../src/layouts/Layout.astro", import.meta.url),
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
