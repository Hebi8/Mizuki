import type { CollectionEntry } from "astro:content";

import {
	getCurrentLocaleLang,
	getDefaultLocaleInfo,
	normalizeLanguageCode,
	type SupportedLocaleLang,
} from "../i18n/locale";

const KNOWN_LANG_SUFFIXES = new Set([
	"en",
	"en_us",
	"en_gb",
	"en_au",
	"zh",
	"zh_cn",
	"zh_tw",
	"cn",
	"tw",
	"ja",
	"ja_jp",
	"jp",
]);

function normalizeLangPart(raw: string): string {
	return raw.trim().toLowerCase().replace(/-/g, "_");
}

function isKnownLanguageSuffix(raw: string): boolean {
	return KNOWN_LANG_SUFFIXES.has(normalizeLangPart(raw));
}

function splitPathAndBase(pathWithoutExt: string) {
	const lastSlashIndex = pathWithoutExt.lastIndexOf("/");
	if (lastSlashIndex < 0) {
		return { dir: "", base: pathWithoutExt };
	}
	return {
		dir: pathWithoutExt.slice(0, lastSlashIndex + 1),
		base: pathWithoutExt.slice(lastSlashIndex + 1),
	};
}

function stripMarkdownExtension(id: string): string {
	return id.replace(/\.(md|mdx|markdown)$/i, "");
}

function normalizePathSeparators(value: string): string {
	return value.replace(/\\/g, "/");
}

function getRelativeContentPathFromFilePath(filePath: string): string {
	const normalized = normalizePathSeparators(filePath).replace(/^\.?\//, "");
	const contentMatch = normalized.match(
		/(?:^|\/)src\/content\/(?:posts|spec)\/(.+)$/i,
	);
	if (contentMatch?.[1]) {
		return contentMatch[1];
	}

	const postsOrSpecMatch = normalized.match(/(?:^|\/)(?:posts|spec)\/(.+)$/i);
	if (postsOrSpecMatch?.[1]) {
		return postsOrSpecMatch[1];
	}

	return normalized;
}

export interface PostVariantInfo {
	idWithoutExt: string;
	canonicalId: string;
	variantLang: string;
	variantLangBase: string;
	fileSuffixLang: string;
}

export function getPostVariantInfo(
	post:
		| string
		| {
				id: string;
				filePath?: string | null;
				data?: { lang?: string | null };
		  },
): PostVariantInfo {
	const id = typeof post === "string" ? post : post.id;
	const filePath = typeof post === "string" ? "" : (post.filePath ?? "");
	const frontmatterLang =
		typeof post === "string" ? "" : (post.data?.lang ?? "");
	const pathSource = filePath
		? getRelativeContentPathFromFilePath(filePath)
		: id;
	const idWithoutExt = stripMarkdownExtension(pathSource);
	const { dir, base } = splitPathAndBase(idWithoutExt);

	let canonicalBase = base;
	let fileSuffixLang = "";

	const dotIndex = base.lastIndexOf(".");
	if (dotIndex > 0) {
		const maybeLang = base.slice(dotIndex + 1);
		if (isKnownLanguageSuffix(maybeLang)) {
			fileSuffixLang = normalizeLanguageCode(maybeLang);
			canonicalBase = base.slice(0, dotIndex);
		}
	}

	const canonicalId = `${dir}${canonicalBase}`;
	const frontmatterLangNormalized = normalizeLanguageCode(frontmatterLang);
	const variantLang = fileSuffixLang || frontmatterLangNormalized;
	const variantLangBase = variantLang.split("_")[0] || variantLang;

	return {
		idWithoutExt,
		canonicalId,
		variantLang,
		variantLangBase,
		fileSuffixLang,
	};
}

type PostVariantLike = {
	id: string;
	filePath?: string | null;
	data?: { lang?: string | null };
};

export function getCanonicalPostSlugFromId(id: string): string;
export function getCanonicalPostSlugFromId(post: PostVariantLike): string;
export function getCanonicalPostSlugFromId(
	post: string | PostVariantLike,
): string {
	return getPostVariantInfo(post).canonicalId;
}

export function getPostVariantLanguageKey(
	post:
		| string
		| {
				id: string;
				filePath?: string | null;
				data?: { lang?: string | null };
		  },
): string {
	const info = getPostVariantInfo(post);
	return info.variantLang || "default";
}

export function getLanguageCandidateChain(preferred?: string | null): string[] {
	const normalizedPreferred = normalizeLanguageCode(
		preferred || getCurrentLocaleLang(),
	);
	const values = [normalizedPreferred, "default", "en"];

	const expanded: string[] = [];
	for (const value of values) {
		if (!value) {
			continue;
		}
		if (!expanded.includes(value)) {
			expanded.push(value);
		}
		const base = value.split("_")[0];
		if (base && !expanded.includes(base)) {
			expanded.push(base);
		}
	}
	return expanded;
}

export function selectPreferredPostVariant<
	T extends {
		id: string;
		filePath?: string | null;
		data?: { lang?: string | null };
	},
>(entries: T[], preferredLang?: string | null): T {
	if (entries.length === 0) {
		throw new Error("selectPreferredPostVariant requires at least one entry");
	}

	const byLang = new Map<string, T>();
	let defaultEntry: T | undefined;

	for (const entry of entries) {
		const info = getPostVariantInfo(entry);
		const key = info.variantLang || "default";
		if (!byLang.has(key)) {
			byLang.set(key, entry);
		}
		if (!info.variantLang && !defaultEntry) {
			defaultEntry = entry;
		}
	}

	for (const candidate of getLanguageCandidateChain(preferredLang)) {
		const direct = byLang.get(candidate);
		if (direct) {
			return direct;
		}
	}

	if (defaultEntry) {
		return defaultEntry;
	}
	return entries[0];
}

function languagesMatch(candidate: string, target: string): boolean {
	const normalizedCandidate = normalizeLanguageCode(candidate);
	const normalizedTarget = normalizeLanguageCode(target);

	if (!normalizedCandidate || !normalizedTarget) {
		return false;
	}

	if (normalizedCandidate === normalizedTarget) {
		return true;
	}

	return normalizedCandidate.split("_")[0] === normalizedTarget.split("_")[0];
}

export function postVariantMatchesLanguage(
	post: PostVariantLike,
	preferredLang?: string | null,
	defaultLang = getDefaultLocaleInfo().lang,
): boolean {
	const info = getPostVariantInfo(post);
	const targetLang = preferredLang || getCurrentLocaleLang();
	const variantLang = info.variantLang || defaultLang;

	return languagesMatch(variantLang, targetLang);
}

export function filterPostVariantsByLanguage<T extends PostVariantLike>(
	entries: T[],
	preferredLang?: string | null,
	defaultLang = getDefaultLocaleInfo().lang,
): T[] {
	return entries.filter((entry) =>
		postVariantMatchesLanguage(entry, preferredLang, defaultLang),
	);
}

export interface PostVariantGroup {
	canonicalId: string;
	variants: CollectionEntry<"posts">[];
	defaultEntry: CollectionEntry<"posts">;
}

export function getPostLanguage(
	post: PostVariantLike,
	fallbackLang?: SupportedLocaleLang,
): string {
	const info = getPostVariantInfo(post);
	return info.variantLang || fallbackLang || getCurrentLocaleLang();
}
