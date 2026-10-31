import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	parseMarkdownImageAlt,
	rehypeMarkdownImages,
} from "../src/plugins/rehype-markdown-images.mjs";
import { matchesNoReferrerDomain } from "../src/utils/image-referrer.ts";

describe("Markdown AST enhancements", () => {
	it("enhances Markdown images without discarding existing attributes", () => {
		const image = {
			type: "element",
			tagName: "img",
			properties: {
				src: "https://img.example.com/photo.webp",
				srcSet: "/small.webp 480w, /large.webp 960w",
				alt: "A useful description w-75%",
				title: "Visible caption",
				width: 960,
				height: 540,
				className: ["existing-image"],
				style: "border-radius: 1rem",
				dataCredit: "Author",
			},
			children: [],
		};
		const tree = {
			type: "root",
			children: [
				{ type: "element", tagName: "p", properties: {}, children: [image] },
			],
		};

		rehypeMarkdownImages({ noReferrerDomains: ["*.example.com"] })(tree);

		const figure = tree.children[0];
		assert.equal(figure.tagName, "figure");
		assert.deepEqual(figure.properties.className, ["markdown-image-figure"]);
		assert.equal(figure.children[0], image);
		assert.equal(image.properties.alt, "A useful description");
		assert.equal(image.properties.loading, "lazy");
		assert.equal(image.properties.decoding, "async");
		assert.equal(image.properties.referrerPolicy, "no-referrer");
		assert.equal(image.properties.width, 960);
		assert.equal(image.properties.height, 540);
		assert.match(image.properties.style, /border-radius: 1rem/);
		assert.match(image.properties.style, /width: 75%/);
		assert.equal(figure.children[1].children[0].value, "Visible caption");
	});

	it("uses alt text independently and leaves invalid width tokens untouched", () => {
		assert.deepEqual(parseMarkdownImageAlt("Diagram"), {
			alt: "Diagram",
			width: undefined,
		});
		assert.deepEqual(parseMarkdownImageAlt("Diagram w-101%"), {
			alt: "Diagram w-101%",
			width: undefined,
		});
		assert.deepEqual(parseMarkdownImageAlt("Diagram w-0%"), {
			alt: "Diagram w-0%",
			width: undefined,
		});
	});

	it("applies no-referrer rules to raw HTML but skips structural wrapping", () => {
		const tree = {
			type: "root",
			children: [
				{
					type: "raw",
					value:
						'<div class="image-grid"><img src="https://i.example.com/a.png" alt="Grid w-50%" data-credit="A"></div>',
				},
				{
					type: "raw",
					value:
						'<img src="https://cdn.example.net/b.png" alt="Raw" title="Raw caption">',
				},
			],
		};

		rehypeMarkdownImages({ noReferrerDomains: ["*.example.com"] })(tree);

		const gridImage = tree.children[0].children[0];
		assert.equal(gridImage.tagName, "img");
		assert.equal(gridImage.properties.alt, "Grid w-50%");
		assert.equal(gridImage.properties.referrerPolicy, "no-referrer");
		assert.equal(tree.children[1].tagName, "figure");
		assert.equal(tree.children[1].children[0].properties.alt, "Raw");
	});

	it("honors data-no-enhance and existing figure boundaries", () => {
		const makeImage = (alt) => ({
			type: "element",
			tagName: "img",
			properties: { src: "/image.webp", alt, title: "No duplicate caption" },
			children: [],
		});
		const protectedImage = makeImage("Protected w-40%");
		const figureImage = makeImage("Figure w-50%");
		const tree = {
			type: "root",
			children: [
				{
					type: "element",
					tagName: "div",
					properties: { dataNoEnhance: true },
					children: [protectedImage],
				},
				{
					type: "element",
					tagName: "figure",
					properties: {},
					children: [figureImage],
				},
			],
		};

		rehypeMarkdownImages()(tree);

		assert.equal(tree.children[0].children[0], protectedImage);
		assert.equal(protectedImage.properties.alt, "Protected w-40%");
		assert.equal(tree.children[1].children[0], figureImage);
		assert.equal(figureImage.properties.alt, "Figure w-50%");
		assert.equal(tree.children[1].children.length, 1);
	});

	it("matches only valid HTTP image host patterns", () => {
		assert.equal(
			matchesNoReferrerDomain("https://i.hdslb.com/a.webp", ["*.hdslb.com"]),
			true,
		);
		assert.equal(
			matchesNoReferrerDomain("https://hdslb.com/a.webp", ["*.hdslb.com"]),
			false,
		);
		assert.equal(matchesNoReferrerDomain("/local.webp", ["*"]), false);
	});
});
