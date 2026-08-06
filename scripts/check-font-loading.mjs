import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(projectRoot, "dist");
const fontAssetDir = join(distDir, "_astro", "fonts");
const MAX_CUSTOM_FONT_BYTES = 8 * 1024 * 1024;

async function collectFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(path)));
		} else {
			files.push(path);
		}
	}

	return files;
}

const outputFiles = await collectFiles(distDir);
const searchableFiles = outputFiles.filter((path) =>
	[".html", ".css"].includes(extname(path)),
);
const customFontReferences = [];

for (const path of searchableFiles) {
	const content = await readFile(path, "utf8");
	for (const match of content.matchAll(/\/_astro\/fonts\/[^\s"')]+/g)) {
		customFontReferences.push({ path, url: match[0] });
	}
}

const ttfReferences = customFontReferences.filter(({ url }) =>
	/\.ttf(?:$|[?#])/i.test(url),
);
if (ttfReferences.length > 0) {
	throw new Error(
		`Custom TTF references are not allowed:\n${ttfReferences
			.map(({ path, url }) => `- ${path}: ${url}`)
			.join("\n")}`,
	);
}

let customFontBytes = 0;
try {
	const fontFiles = await collectFiles(fontAssetDir);
	for (const path of fontFiles) {
		customFontBytes += (await stat(path)).size;
	}
} catch (error) {
	if (error?.code !== "ENOENT") throw error;
}

if (customFontBytes > MAX_CUSTOM_FONT_BYTES) {
	throw new Error(
		`Custom font output is ${customFontBytes} bytes; budget is ${MAX_CUSTOM_FONT_BYTES} bytes.`,
	);
}

if (
	process.env.MIZUKI_FONT_MODE === "system" &&
	customFontReferences.length > 0
) {
	throw new Error("System font mode must not emit Astro custom font references.");
}

console.log(
	`Font loading check passed: ${customFontReferences.length} references, ${customFontBytes} bytes.`,
);
