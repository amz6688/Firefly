/**
 * 本地写作后台
 * 仅监听 127.0.0.1，提供文章编辑、图片上传与 Git 提交推送能力。
 * 启动：pnpm admin
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import matter from "gray-matter";
import { pinyin } from "pinyin-pro";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, "../..");
const POSTS_DIR = path.join(ROOT, "src", "content", "posts");
const IMAGES_DIR = path.join(ROOT, "public", "assets", "images", "game");
const UI_DIR = path.join(import.meta.dirname, "public");
const PASSWORD_FILE = path.join(import.meta.dirname, ".admin-password");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ADMIN_PORT || 4322);
const SESSION_TTL = 12 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// 后台「游戏分类」选项，顺序与首页板块保持一致（必玩榜/手柄专区属于标签型板块）
const CATEGORIES = ["必玩榜", "Steam移植", "手柄专区", "安卓原生", "反编译移植"];
const SECTION_TAGS = ["必玩榜", "手柄专区"];

function toNameList(value) {
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(/[,，]/)
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
}

// 从文章 front-matter 还原后台勾选的分类：分类型写入 category，标签型写入 tags
function selectedCategoriesFromData(data) {
	const categoryNames = toNameList(data.category);
	const tags = toNameList(data.tags);
	const selected = CATEGORIES.filter(
		(name) =>
			categoryNames.includes(name) ||
			(SECTION_TAGS.includes(name) && tags.includes(name)),
	);
	// 保留不在预设列表里的旧分类，避免保存时丢数据
	for (const name of categoryNames) {
		if (!selected.includes(name)) selected.push(name);
	}
	return selected;
}

const MIME_TO_EXT = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/avif": "avif",
};

const STATIC_FILES = {
	"/": ["index.html", "text/html; charset=utf-8"],
	"/index.html": ["index.html", "text/html; charset=utf-8"],
	"/admin.css": ["admin.css", "text/css; charset=utf-8"],
	"/admin.js": ["admin.js", "text/javascript; charset=utf-8"],
};

// 后台预览上传图片：把 /assets/images/game/... 映射到 public 下的实际目录
const IMAGE_URL_PREFIX = "/assets/images/game/";
const IMAGE_CONTENT_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".avif": "image/avif",
	".svg": "image/svg+xml",
};

/** @type {Map<string, number>} */
const sessions = new Map();

let adminPassword = "";

function httpError(status, message) {
	const error = new Error(message);
	error.status = status;
	return error;
}

function sendJson(res, status, data) {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	res.end(body);
}

function parseCookies(header) {
	const cookies = {};
	String(header || "")
		.split(";")
		.forEach((part) => {
			const index = part.indexOf("=");
			if (index === -1) return;
			cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
		});
	return cookies;
}

function getSession(req) {
	const token = parseCookies(req.headers.cookie).admin_session;
	if (!token) return null;
	const expires = sessions.get(token);
	if (!expires || expires < Date.now()) {
		sessions.delete(token);
		return null;
	}
	return token;
}

function sameOrigin(req) {
	const origin = req.headers.origin;
	if (!origin) return true;
	return (
		origin === `http://${HOST}:${PORT}` ||
		origin === `http://localhost:${PORT}`
	);
}

function readJson(req, limit = 40 * 1024 * 1024) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > limit) {
				reject(httpError(413, "请求体过大"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (chunks.length === 0) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(httpError(400, "JSON 解析失败"));
			}
		});
		req.on("error", reject);
	});
}

function localToday() {
	const now = new Date();
	const offset = now.getTimezoneOffset() * 60 * 1000;
	return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function normalizeDate(value) {
	const text = String(value || "").slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : localToday();
}

function safeSlug(value) {
	const raw = String(value || "")
		.trim()
		.toLowerCase();
	if (!raw) return "";
	return raw
		.replace(/\s+/g, "-")
		.replace(/[^\p{L}\p{N}_-]+/gu, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

const ENGLISH_NAME_STOPWORDS = new Set([
	"v",
	"ver",
	"version",
	"android",
	"apk",
	"ios",
	"ipa",
	"pc",
	"steam",
	"mod",
	"mods",
	"game",
	"games",
	"dlc",
	"update",
	"plus",
	"pro",
	"lite",
	"hd",
	"the",
	"of",
	"and",
	"for",
	"with",
	"by",
	"in",
	"on",
	"new",
]);

function cleanEnglishName(value) {
	const words = String(value || "")
		.replace(/[’']/g, "")
		.split(/\s+/)
		.filter(Boolean);
	const kept = words.filter((word) => {
		const lower = word
			.toLowerCase()
			.replace(/^[^a-z0-9]+/, "")
			.replace(/[^a-z0-9]+$/, "");
		return (
			lower &&
			!ENGLISH_NAME_STOPWORDS.has(lower) &&
			!/^v?\d/.test(lower)
		);
	});
	return safeSlug(kept.join(" ")).slice(0, 40);
}

// 从标题或正文中识别游戏英文名，用于生成链接别名
function detectEnglishName(text) {
	const source = String(text || "");
	if (!source.trim()) return "";

	for (const match of source.matchAll(/[（(]\s*([^（）()\n]{2,60})\s*[）)]/g)) {
		const name = cleanEnglishName(match[1]);
		if (name) return name;
	}

	const versioned =
		/([A-Za-z][A-Za-z0-9'’._:-]*(?:\s+[A-Za-z][A-Za-z0-9'’._:-]*){0,4})\s*(?:v|ver\.?|version)\s*\d/i.exec(
			source,
		);
	if (versioned) {
		const name = cleanEnglishName(versioned[1]);
		if (name) return name;
	}

	const phrases =
		source.match(
			/[A-Za-z][A-Za-z0-9'’._:-]*(?:\s+[A-Za-z][A-Za-z0-9'’._:-]*){0,4}/g,
		) || [];
	for (const phrase of phrases) {
		const name = cleanEnglishName(phrase);
		if (name.length >= 2) return name;
	}

	return "";
}

function autoSlug(title, extra = "") {
	const english =
		detectEnglishName(title) || detectEnglishName(extra);
	if (english) return english.slice(0, 60);

	const bracketedName = /《([^》]{1,40})》/.exec(String(title || ""));
	const baseTitle = bracketedName ? bracketedName[1] : title;
	const syllables = pinyin(String(baseTitle || title || ""), {
		toneType: "none",
		type: "array",
	}).join("-");
	const slug = safeSlug(syllables);
	if (slug) return slug.slice(0, 60);
	return `post-${localToday().replace(/-/g, "")}-${String(Date.now()).slice(-4)}`;
}

function formatDate(value) {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const offset = date.getTimezoneOffset() * 60 * 1000;
	return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

async function findPostFile(slug) {
	for (const extension of [".md", ".mdx"]) {
		const file = path.join(POSTS_DIR, slug + extension);
		try {
			await fs.access(file);
			return file;
		} catch {
			// 继续尝试下一个扩展名
		}
	}
	return null;
}

async function listPosts() {
	const files = (await fs.readdir(POSTS_DIR)).filter((file) =>
		/\.(md|mdx)$/i.test(file),
	);
	const posts = [];
	for (const file of files) {
		const raw = await fs.readFile(path.join(POSTS_DIR, file), "utf8");
		const { data, content } = matter(raw);
		const slug = file.replace(/\.(md|mdx)$/i, "");
		posts.push({
			slug,
			title: String(data.title || slug),
			published: formatDate(data.published),
			description: String(data.description || ""),
			tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
			categories: selectedCategoriesFromData(data),
			image: String(data.image || ""),
			draft: Boolean(data.draft),
			words: content.replace(/\s/g, "").length,
		});
	}
	posts.sort((a, b) => (b.published || "").localeCompare(a.published || ""));
	return posts;
}

async function readPost(slug) {
	const file = await findPostFile(slug);
	if (!file) throw httpError(404, "文章不存在");
	const raw = await fs.readFile(file, "utf8");
	const { data, content } = matter(raw);
	return {
		slug,
		title: String(data.title || ""),
		published: formatDate(data.published),
		description: String(data.description || ""),
		tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
		categories: selectedCategoriesFromData(data),
		image: String(data.image || ""),
		body: content.replace(/^\n+/, ""),
	};
}

function buildMarkdown(post) {
	const selected = post.categories ?? [];
	const categoryNames = selected.filter((name) => !SECTION_TAGS.includes(name));
	const sectionTags = selected.filter((name) => SECTION_TAGS.includes(name));
	const tags = [...new Set([...(post.tags ?? []), ...sectionTags])];

	const lines = ["---", `title: ${JSON.stringify(post.title)}`, `published: ${post.published}`];
	if (post.description) {
		lines.push(`description: ${JSON.stringify(post.description)}`);
	}
	lines.push(`tags: [${tags.map((tag) => JSON.stringify(tag)).join(", ")}]`);
	if (categoryNames.length === 1) {
		lines.push(`category: ${JSON.stringify(categoryNames[0])}`);
	} else if (categoryNames.length > 1) {
		lines.push(`category: ${JSON.stringify(categoryNames)}`);
	}
	if (post.image) {
		lines.push(`image: ${JSON.stringify(post.image)}`);
	}
	lines.push("---", "");
	return `${lines.join("\n")}${String(post.body || "").replace(/^\n+/, "")}`;
}

function normalizePostPayload(payload) {
	const title = String(payload.title || "").trim();
	if (!title) throw httpError(400, "标题不能为空");

	const published = normalizeDate(payload.published);
	const tags = Array.isArray(payload.tags)
		? payload.tags.map((tag) => String(tag).trim()).filter(Boolean)
		: String(payload.tags || "")
				.split(/[,，]/)
				.map((tag) => tag.trim())
				.filter(Boolean);

	const description = String(payload.description || "").trim();
	const body = String(payload.body || "");

	return {
		title,
		slug:
			safeSlug(payload.slug) ||
			autoSlug(title, `${description}\n${body}`.slice(0, 4000)),
		published,
		description,
		tags,
		categories: toNameList(payload.categories ?? payload.category).filter(
			(name, index, list) => list.indexOf(name) === index,
		),
		image: String(payload.image || "").trim(),
		body,
	};
}

async function savePost(post, originalSlug) {
	const targetFile = path.join(POSTS_DIR, `${post.slug}.md`);
	if (originalSlug && originalSlug !== post.slug) {
		const oldFile = await findPostFile(originalSlug);
		if (oldFile) await fs.unlink(oldFile);
	}
	await fs.writeFile(targetFile, buildMarkdown(post), "utf8");
	return post.slug;
}

function imageBaseName(value) {
	return (
		safeSlug(
			String(value || "").replace(/\.(png|jpg|jpeg|webp|gif|avif)$/i, ""),
		).slice(0, 60) || "image"
	);
}

const WATERMARK_TEXT = "acegame.cc.cd";

// 在图片右下角加上站点水印；处理失败时保留原图
async function addWatermark(buffer) {
	try {
		const image = sharp(buffer).rotate();
		const meta = await image.metadata();
		if (!meta.width || !meta.height) return buffer;

		const fontSize = Math.max(
			12,
			Math.round(Math.min(meta.width, meta.height) * 0.032),
		);
		const textWidth = Math.round(fontSize * 0.62 * WATERMARK_TEXT.length);
		const paddingX = Math.round(fontSize * 0.55);
		const paddingY = Math.round(fontSize * 0.32);
		const width = textWidth + paddingX * 2;
		const height = fontSize + paddingY * 2;
		const radius = Math.round(height * 0.2);
		const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
			<rect width="100%" height="100%" rx="${radius}" fill="rgba(0,0,0,0.36)" />
			<text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central"
				font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600"
				fill="rgba(255,255,255,0.92)">${WATERMARK_TEXT}</text>
		</svg>`;

		const margin = Math.max(
			8,
			Math.round(Math.min(meta.width, meta.height) * 0.025),
		);
		return await image
			.composite([
				{
					input: Buffer.from(svg),
					top: Math.max(0, meta.height - height - margin),
					left: Math.max(0, meta.width - width - margin),
				},
			])
			.toBuffer();
	} catch {
		return buffer;
	}
}

async function persistImage(folder, baseName, extension, buffer) {
	const folderName = safeSlug(folder) || "uploads";
	const name = imageBaseName(baseName);
	const directory = path.join(IMAGES_DIR, folderName);
	if (!directory.startsWith(IMAGES_DIR + path.sep)) {
		throw httpError(400, "非法的图片目录");
	}
	await fs.mkdir(directory, { recursive: true });

	let fileName = `${name}.${extension}`;
	let counter = 2;
	while (true) {
		try {
			await fs.access(path.join(directory, fileName));
			fileName = `${name}-${counter}.${extension}`;
			counter += 1;
		} catch {
			break;
		}
	}

	const output = await addWatermark(buffer);
	await fs.writeFile(path.join(directory, fileName), output);
	return `/assets/images/game/${folderName}/${fileName}`;
}

// 封面 / 正文图片统一压缩为 1024×526 的 jpg，且不超过 300KB
const IMAGE_MAX_WIDTH = 1024;
const IMAGE_MAX_HEIGHT = 526;
const IMAGE_MAX_BYTES = 300 * 1024;

async function convertToJpeg(buffer) {
	try {
		const base = sharp(buffer)
			.resize({
				width: IMAGE_MAX_WIDTH,
				height: IMAGE_MAX_HEIGHT,
				fit: "cover",
				position: "centre",
			})
			.flatten({ background: "#ffffff" });
		for (const quality of [90, 85, 80, 75, 70, 65, 60, 55, 50, 45]) {
			const output = await base
				.clone()
				.jpeg({ quality, mozjpeg: true })
				.toBuffer();
			if (output.length <= IMAGE_MAX_BYTES) return output;
		}
		return await base.clone().jpeg({ quality: 40, mozjpeg: true }).toBuffer();
	} catch {
		return buffer;
	}
}

// 正文图片按 shot-1、shot-2 … 依次命名
async function nextShotBase(folder) {
	const folderName = safeSlug(folder) || "uploads";
	const directory = path.join(IMAGES_DIR, folderName);
	const used = new Set();
	try {
		const files = await fs.readdir(directory);
		for (const file of files) {
			const match = /^shot-(\d+)\./i.exec(file);
			if (match) used.add(Number(match[1]));
		}
	} catch {
		// 目录不存在时从 1 开始
	}
	// 取最小的未占用序号，删除中间图片后再上传会补上空位，编号不会一直变大
	let index = 1;
	while (used.has(index)) index += 1;
	return `shot-${index}`;
}

async function uploadImage({ folder, filename, dataUrl, role }) {
	const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(dataUrl || ""));
	if (!match) throw httpError(400, "不支持的图片数据");
	const extension = MIME_TO_EXT[match[1].toLowerCase()];
	if (!extension) throw httpError(400, "仅支持 png / jpg / webp / gif / avif");

	const buffer = Buffer.from(match[2], "base64");
	if (buffer.length === 0) throw httpError(400, "图片内容为空");
	if (buffer.length > MAX_IMAGE_BYTES) throw httpError(413, "单张图片不能超过 15MB");

	// 封面固定为 header.jpg，正文图片依次为 shot-1.jpg、shot-2.jpg …
	if (role === "cover") {
		return persistImage(folder, "header", "jpg", await convertToJpeg(buffer));
	}
	if (role === "shot") {
		return persistImage(
			folder,
			await nextShotBase(folder),
			"jpg",
			await convertToJpeg(buffer),
		);
	}
	return persistImage(folder, filename, extension, buffer);
}

function extensionFromUrl(pathname) {
	const match = /\.(png|jpg|jpeg|webp|gif|avif)$/i.exec(pathname || "");
	if (!match) return "";
	const extension = match[1].toLowerCase();
	return extension === "jpeg" ? "jpg" : extension;
}

async function downloadImage({ url, folder, filename, role }) {
	let parsed;
	try {
		parsed = new URL(String(url || ""));
	} catch {
		throw httpError(400, "图片地址无效");
	}
	if (!/^https?:$/.test(parsed.protocol)) {
		throw httpError(400, "仅支持 http/https 图片地址");
	}

	let response;
	try {
		response = await fetch(parsed.href, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
				Accept: "image/*,*/*;q=0.8",
				Referer: `${parsed.protocol}//${parsed.host}/`,
			},
			redirect: "follow",
			signal: AbortSignal.timeout(20000),
		});
	} catch {
		throw httpError(502, "图片下载失败，请检查地址是否可访问");
	}

	if (!response.ok) {
		throw httpError(502, `图片下载失败（HTTP ${response.status}）`);
	}

	const contentType = (response.headers.get("content-type") || "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	const extension =
		MIME_TO_EXT[contentType] || extensionFromUrl(parsed.pathname);
	if (!extension) throw httpError(415, "无法识别图片格式，仅支持 png / jpg / webp / gif / avif");

	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.length === 0) throw httpError(400, "图片内容为空");
	if (buffer.length > MAX_IMAGE_BYTES) throw httpError(413, "单张图片不能超过 15MB");

	const fallbackName = decodeURIComponent(
		parsed.pathname.split("/").pop() || "",
	);
	// 封面固定为 header.jpg，正文图片依次为 shot-1.jpg、shot-2.jpg …
	if (role === "cover") {
		return persistImage(folder, "header", "jpg", await convertToJpeg(buffer));
	}
	if (role === "shot") {
		return persistImage(
			folder,
			await nextShotBase(folder),
			"jpg",
			await convertToJpeg(buffer),
		);
	}
	return persistImage(folder, filename || fallbackName, extension, buffer);
}

async function git(args, timeout = 60000) {
	try {
		const { stdout, stderr } = await execFileAsync("git", args, {
			cwd: ROOT,
			timeout,
			maxBuffer: 10 * 1024 * 1024,
			windowsHide: true,
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});
		return {
			ok: true,
			output: [stdout, stderr].filter(Boolean).join("\n").trim(),
		};
	} catch (error) {
		return {
			ok: false,
			output: [error.stdout, error.stderr, error.message]
				.filter(Boolean)
				.join("\n")
				.trim(),
		};
	}
}

async function handleApi(req, res, url) {
	const pathname = url.pathname;
	const method = req.method || "GET";

	if (pathname === "/api/login" && method === "POST") {
		const body = await readJson(req, 1024 * 1024);
		const given = Buffer.from(String(body.password || ""));
		const expected = Buffer.from(adminPassword);
		const matched =
			given.length === expected.length &&
			crypto.timingSafeEqual(given, expected);
		if (!matched) {
			sendJson(res, 401, { error: "密码不正确" });
			return;
		}
		const token = crypto.randomBytes(24).toString("base64url");
		sessions.set(token, Date.now() + SESSION_TTL);
		res.setHeader(
			"Set-Cookie",
			`admin_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}`,
		);
		sendJson(res, 200, { ok: true });
		return;
	}

	if (pathname === "/api/logout" && method === "POST") {
		const token = parseCookies(req.headers.cookie).admin_session;
		if (token) sessions.delete(token);
		res.setHeader(
			"Set-Cookie",
			"admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
		);
		sendJson(res, 200, { ok: true });
		return;
	}

	if (pathname === "/api/session" && method === "GET") {
		sendJson(res, 200, { ok: Boolean(getSession(req)) });
		return;
	}

	if (!getSession(req)) {
		sendJson(res, 401, { error: "登录已过期，请重新登录" });
		return;
	}

	if (!["GET", "HEAD"].includes(method) && !sameOrigin(req)) {
		sendJson(res, 403, { error: "非法的请求来源" });
		return;
	}

	if (pathname === "/api/meta" && method === "GET") {
		const posts = await listPosts();
		const categories = new Set(CATEGORIES);
		const tags = new Set(SECTION_TAGS);
		for (const post of posts) {
			post.categories.forEach((name) => {
				if (!categories.has(name)) categories.add(name);
			});
			post.tags.forEach((tag) => tags.add(tag));
		}
		sendJson(res, 200, {
			categories: [...categories],
			tags: [...tags],
			today: localToday(),
		});
		return;
	}

	if (pathname === "/api/slug" && method === "GET") {
		const title = url.searchParams.get("title") || "";
		const text = url.searchParams.get("text") || "";
		sendJson(res, 200, { slug: autoSlug(title, text) });
		return;
	}

	if (pathname === "/api/posts" && method === "GET") {
		sendJson(res, 200, { posts: await listPosts() });
		return;
	}

	if (pathname === "/api/posts" && method === "POST") {
		const post = normalizePostPayload(await readJson(req));
		if (await findPostFile(post.slug)) {
			sendJson(res, 409, { error: `已存在同名文章：${post.slug}` });
			return;
		}
		await savePost(post);
		sendJson(res, 201, { ok: true, slug: post.slug });
		return;
	}

	if (pathname.startsWith("/api/posts/")) {
		const slug = decodeURIComponent(pathname.slice("/api/posts/".length));
		if (!slug) throw httpError(400, "缺少文章标识");

		if (method === "GET") {
			sendJson(res, 200, await readPost(slug));
			return;
		}

		if (method === "PUT") {
			const post = normalizePostPayload(await readJson(req));
			if (post.slug !== slug && (await findPostFile(post.slug))) {
				sendJson(res, 409, { error: `已存在同名文章：${post.slug}` });
				return;
			}
			await savePost(post, slug);
			sendJson(res, 200, { ok: true, slug: post.slug });
			return;
		}

		if (method === "DELETE") {
			const file = await findPostFile(slug);
			if (!file) {
				sendJson(res, 404, { error: "文章不存在" });
				return;
			}
			await fs.unlink(file);
			sendJson(res, 200, { ok: true });
			return;
		}
	}

	if (pathname === "/api/upload" && method === "POST") {
		const body = await readJson(req);
		const imagePath = await uploadImage(body);
		sendJson(res, 200, { ok: true, path: imagePath });
		return;
	}

	if (pathname === "/api/download-image" && method === "POST") {
		const body = await readJson(req, 1024 * 1024);
		const imagePath = await downloadImage(body);
		sendJson(res, 200, { ok: true, path: imagePath });
		return;
	}

	if (pathname === "/api/delete-image" && method === "POST") {
		const body = await readJson(req, 1024 * 1024);
		const deleted = await deleteImage(body.path);
		sendJson(res, 200, { ok: true, deleted });
		return;
	}

	if (pathname === "/api/git/status" && method === "GET") {
		const branch = await git(["branch", "--show-current"]);
		const status = await git(["status", "--porcelain"]);
		sendJson(res, 200, {
			branch: branch.output,
			status: status.output,
		});
		return;
	}

	if (pathname === "/api/git/commit" && method === "POST") {
		const body = await readJson(req, 1024 * 1024);
		const wantsPush = Boolean(body.push);
		const message = String(body.message || "").trim() || "chore(post): 更新文章内容";

		const add = await git([
			"add",
			"-A",
			"--",
			"src/content/posts",
			"public/assets/images/game",
		]);
		if (!add.ok) throw httpError(500, `git add 失败\n${add.output}`);

		const status = await git(["status", "--porcelain"]);
		if (!status.output) {
			sendJson(res, 200, {
				ok: true,
				message: "没有需要提交的改动",
				output: "没有需要提交的改动",
			});
			return;
		}

		const commit = await git(["commit", "-m", message]);
		if (!commit.ok) throw httpError(500, `git commit 失败\n${commit.output}`);

		let output = `已提交：${message}\n\n${commit.output}`;
		if (wantsPush) {
			const push = await git(["push"], 120000);
			output += `\n\n${push.ok ? "推送成功" : "推送失败"}\n${push.output}`;
			if (!push.ok) {
				sendJson(res, 500, { ok: false, error: "推送失败", output });
				return;
			}
		}
		sendJson(res, 200, {
			ok: true,
			message: wantsPush ? "已提交并推送" : "已提交",
			output,
		});
		return;
	}

	sendJson(res, 404, { error: "接口不存在" });
}

async function loadPassword() {
	if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
	try {
		const saved = (await fs.readFile(PASSWORD_FILE, "utf8")).trim();
		if (saved) return saved;
	} catch {
		// 文件不存在时自动生成
	}
	const generated = crypto.randomBytes(9).toString("base64url");
	await fs.writeFile(PASSWORD_FILE, `${generated}\n`, { mode: 0o600 });
	return generated;
}

// 删除已上传到 public/assets/images/game 下的图片文件
async function deleteImage(imagePath) {
	const raw = String(imagePath || "");
	if (!raw.startsWith(IMAGE_URL_PREFIX)) return false;
	const relative = decodeURIComponent(raw.slice(IMAGE_URL_PREFIX.length));
	const filePath = path.resolve(IMAGES_DIR, relative);
	if (!filePath.startsWith(IMAGES_DIR + path.sep)) return false;
	try {
		await fs.unlink(filePath);
		return true;
	} catch {
		return false;
	}
}

async function serveGameImage(res, pathname) {
	const relative = decodeURIComponent(pathname.slice(IMAGE_URL_PREFIX.length));
	const filePath = path.resolve(IMAGES_DIR, relative);
	if (!filePath.startsWith(IMAGES_DIR + path.sep)) {
		res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Not Found");
		return;
	}
	try {
		const content = await fs.readFile(filePath);
		res.writeHead(200, {
			"Content-Type":
				IMAGE_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ||
				"application/octet-stream",
			"Cache-Control": "no-store",
		});
		res.end(content);
	} catch {
		res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Not Found");
	}
}

async function serveStatic(res, pathname) {
	const entry = STATIC_FILES[pathname];
	if (!entry) {
		res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Not Found");
		return;
	}
	const [filename, contentType] = entry;
	const content = await fs.readFile(path.join(UI_DIR, filename));
	res.writeHead(200, {
		"Content-Type": contentType,
		"Cache-Control": "no-store",
	});
	res.end(content);
}

async function main() {
	adminPassword = await loadPassword();
	await fs.mkdir(IMAGES_DIR, { recursive: true });

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
			if (url.pathname.startsWith("/api/")) {
				await handleApi(req, res, url);
				return;
			}
			if (url.pathname.startsWith(IMAGE_URL_PREFIX)) {
				await serveGameImage(res, url.pathname);
				return;
			}
			await serveStatic(res, url.pathname);
		} catch (error) {
			const status = error?.status || 500;
			if (status >= 500) console.error(error);
			sendJson(res, status, { error: error?.message || "服务器错误" });
		}
	});

	setInterval(() => {
		const now = Date.now();
		for (const [token, expires] of sessions) {
			if (expires < now) sessions.delete(token);
		}
	}, 60 * 60 * 1000).unref();

	server.on("error", (error) => {
		if (error.code === "EADDRINUSE") {
			console.error(`端口 ${PORT} 已被占用，可用 ADMIN_PORT=其他端口 pnpm admin`);
			process.exit(1);
		}
		throw error;
	});

	server.listen(PORT, HOST, () => {
		console.log("");
		console.log("  猫猫游戏小站 · 写作后台已启动");
		console.log(`  地址：http://${HOST}:${PORT}`);
		console.log(`  管理密码：${adminPassword}`);
		console.log("  密码保存在 scripts/admin/.admin-password，可用 ADMIN_PASSWORD 环境变量覆盖");
		console.log("  按 Ctrl+C 退出");
		console.log("");
	});
}

main().catch((error) => {
	console.error("后台启动失败：", error);
	process.exit(1);
});
