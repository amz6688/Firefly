const $ = (selector) => document.querySelector(selector);

const els = {
	login: $("#login"),
	loginForm: $("#login-form"),
	password: $("#password"),
	loginError: $("#login-error"),
	app: $("#app"),
	logout: $("#logout"),
	newPost: $("#new-post"),
	search: $("#search"),
	postList: $("#post-list"),
	title: $("#title"),
	slug: $("#slug"),
	published: $("#published"),
	categoryOptions: $("#category-options"),
	description: $("#description"),
	tags: $("#tags"),
	image: $("#image"),
	coverPreview: $("#cover-preview"),
	pickCover: $("#pick-cover"),
	clearCover: $("#clear-cover"),
	fileCover: $("#file-cover"),
	body: $("#body"),
	undoEdit: $("#undo-edit"),
	redoEdit: $("#redo-edit"),
	detectLinks: $("#detect-links"),
	netdiskPanel: $("#netdisk-panel"),
	netdiskInput: $("#netdisk-input"),
	netdiskFill: $("#netdisk-fill"),
	netdiskCancel: $("#netdisk-cancel"),
	pickShots: $("#pick-shots"),
	fileShots: $("#file-shots"),
	wordCount: $("#word-count"),
	savePost: $("#save-post"),
	deletePost: $("#delete-post"),
	gitBranch: $("#git-branch"),
	gitStatus: $("#git-status"),
	gitOutput: $("#git-output"),
	gitRefresh: $("#git-refresh"),
	commitMessage: $("#commit-message"),
	gitCommit: $("#git-commit"),
	gitPush: $("#git-push"),
	toast: $("#toast"),
	tagSuggestions: $("#tag-suggestions"),
	importText: $("#import-text"),
	importImages: $("#import-images"),
	smartParse: $("#smart-parse"),
	importFoundImages: $("#import-found-images"),
	smartClear: $("#smart-clear"),
	bodyImagesGrid: $("#body-images-grid"),
	bodyImagesPanel: $("#body-images"),
	imageLightbox: $("#image-lightbox"),
	imageLightboxImg: $("#image-lightbox-img"),
	imageLightboxClose: $("#image-lightbox-close"),
};

const GAME_TEMPLATE = `## 游戏信息

- **游戏语言**：中文
- **操作方式**：触屏
- **游戏类型**：
- **游戏版本**：
- **游戏大小**：
- **注意事项**：无

## 游戏简介

## 下载地址

- 夸克网盘：
- 百度网盘：

## 游戏图片`;

// 必玩榜 / 手柄专区属于标签型板块，勾选后同步写入标签
const SECTION_TAG_CATEGORIES = ["必玩榜", "手柄专区"];

// 游戏相关标签关键词，自动粘贴时用于补足标签数量
const GAME_TAG_RULES = [
	[/\b3D\b/i, "3D"],
	[/\b2D\b/i, "2D"],
	[/像素/, "像素风"],
	[/第一人称/, "第一人称"],
	[/第三人称/, "第三人称"],
	[/心理恐怖/, "心理恐怖"],
	[/恐怖/, "恐怖"],
	[/解谜|益智/, "解谜"],
	[/动作/, "动作"],
	[/射击/, "射击"],
	[/冒险/, "冒险"],
	[/角色扮演|\bRPG\b/i, "角色扮演"],
	[/开放世界/, "开放世界"],
	[/生存/, "生存"],
	[/沙盒/, "沙盒"],
	[/模拟经营|模拟/, "模拟经营"],
	[/策略/, "策略"],
	[/横版/, "横版"],
	[/平台跳跃|跳跃/, "平台跳跃"],
	[/roguelike|肉鸽/i, "Roguelike"],
	[/卡牌/, "卡牌"],
	[/塔防/, "塔防"],
	[/竞速|赛车/, "竞速"],
	[/格斗/, "格斗"],
	[/音乐|音游/, "音乐"],
	[/恋爱|乙女/, "恋爱"],
	[/二次元/, "二次元"],
	[/联机|多人/, "联机"],
	[/单机/, "单机"],
	[/养成/, "养成"],
	[/经营/, "经营"],
	[/末日|丧尸/, "末日"],
	[/科幻/, "科幻"],
	[/武侠|仙侠/, "武侠"],
	[/休闲/, "休闲"],
];

// 关键词命中不足 6 个时用于兜底的通用游戏标签
const GAME_TAG_FALLBACKS = [
	"安卓游戏",
	"单机游戏",
	"手游",
	"休闲",
	"冒险",
	"解谜",
];

function categoryInputs() {
	return [...els.categoryOptions.querySelectorAll('input[type="checkbox"]')];
}

function getSelectedCategories() {
	return categoryInputs()
		.filter((input) => input.checked)
		.map((input) => input.value);
}

function ensureCategoryOption(name) {
	const value = String(name || "").trim();
	if (!value) return;
	if (categoryInputs().some((input) => input.value === value)) return;
	const label = document.createElement("label");
	label.className = "category-option";
	const input = document.createElement("input");
	input.type = "checkbox";
	input.value = value;
	input.addEventListener("change", () => {
		if (!SECTION_TAG_CATEGORIES.includes(value)) return;
		const tags = els.tags.value
			.split(/[,，]/)
			.map((tag) => tag.trim())
			.filter(Boolean);
		const index = tags.indexOf(value);
		if (input.checked && index === -1) tags.push(value);
		if (!input.checked && index !== -1) tags.splice(index, 1);
		els.tags.value = tags.join(", ");
	});
	label.append(input, document.createTextNode(value));
	els.categoryOptions.appendChild(label);
}

// 传入分类数组；不在预设列表中的旧分类会自动补一个复选框
function setSelectedCategories(values) {
	const selected = Array.isArray(values) ? values.map(String) : [];
	for (const name of selected) ensureCategoryOption(name);
	for (const input of categoryInputs()) {
		input.checked = selected.includes(input.value);
	}
}

const state = {
	posts: [],
	currentSlug: null,
	today: "",
	busy: false,
	importUrls: [],
	importCoverUrl: "",
	slugTouched: false,
	// 本地图片重复上传同名文件时，用版本号强制刷新预览，避免浏览器继续显示旧图
	mediaVersion: 0,
	coverDeletePromise: null,
};

let toastTimer = 0;

function toast(message, isError = false) {
	els.toast.textContent = message;
	els.toast.hidden = false;
	els.toast.style.background = isError
		? "rgba(192, 57, 43, 0.94)"
		: "rgba(43, 38, 34, 0.92)";
	window.clearTimeout(toastTimer);
	toastTimer = window.setTimeout(() => {
		els.toast.hidden = true;
	}, 2600);
}

async function api(path, options = {}) {
	const response = await fetch(path, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
	let data = {};
	try {
		data = await response.json();
	} catch {
		// 忽略非 JSON 响应
	}
	if (!response.ok) {
		if (response.status === 401 && path !== "/api/login") {
			showLogin();
		}
		throw new Error(data.error || `请求失败 (${response.status})`);
	}
	return data;
}

function showLogin() {
	els.login.hidden = false;
	els.app.hidden = true;
	els.password.value = "";
	els.password.focus();
}

function showApp() {
	els.login.hidden = true;
	els.app.hidden = false;
}

function setBusy(busy) {
	state.busy = busy;
	for (const button of [
		els.savePost,
		els.deletePost,
		els.gitCommit,
		els.gitPush,
		els.gitRefresh,
		els.pickCover,
		els.pickShots,
		els.smartParse,
		els.importFoundImages,
	]) {
		button.disabled = busy;
	}
}

function updateWordCount() {
	const count = els.body.value.replace(/\s/g, "").length;
	els.wordCount.textContent = `${count} 字`;
}

function displayImageUrl(src) {
	// 只给本地图片加版本号，远程图片保持原地址
	return src.startsWith("/assets/") ? `${src}?v=${state.mediaVersion}` : src;
}

function updateCoverPreview() {
	const value = els.image.value.trim();
	if (value) {
		els.coverPreview.style.backgroundImage = `url("${displayImageUrl(value)}")`;
		els.coverPreview.classList.add("has-image");
		els.coverPreview.textContent = "";
	} else {
		els.coverPreview.style.backgroundImage = "";
		els.coverPreview.classList.remove("has-image");
		els.coverPreview.textContent = "无封面";
	}
}

function collectBodyImages() {
	const sources = new Set();
	for (const item of collectImageOccurrences(els.body.value || "")) {
		sources.add(item.src);
	}
	return [...sources];
}

let dragImageSrc = "";

function clearImageDropMarkers() {
	els.bodyImagesGrid
		.querySelectorAll(".body-image-item")
		.forEach((item) => item.classList.remove("dragging", "drop-target"));
}

function collectImageOccurrences(body) {
	const results = [];
	for (const match of body.matchAll(
		/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)|<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
	)) {
		const src = match[1] || match[2];
		if (!src || src.startsWith("data:")) continue;
		results.push({
			start: match.index,
			end: match.index + match[0].length,
			text: match[0],
			src,
		});
	}
	return results;
}

function replaceImageSrc(text, src) {
	return text
		.replace(
			/(!\[[^\]]*\]\(\s*)[^)\s]+/,
			(match, prefix) => prefix + src,
		)
		.replace(
			/(<img[^>]*\bsrc=["'])[^"']+(["'])/i,
			(match, prefix, suffix) => prefix + src + suffix,
		);
}

// 拖动缩略图调整正文图片顺序
function reorderBodyImages(from, to) {
	const images = collectBodyImages();
	if (from === to || from < 0 || to < 0) return;
	if (from >= images.length || to >= images.length) return;

	const reordered = [...images];
	const [moved] = reordered.splice(from, 1);
	reordered.splice(to, 0, moved);
	const rank = new Map(reordered.map((src, index) => [src, index]));

	const body = els.body.value;
	const occurrences = collectImageOccurrences(body).map((item) => ({
		...item,
		rank: rank.has(item.src) ? rank.get(item.src) : reordered.length,
	}));
	const sorted = [...occurrences].sort((a, b) => a.rank - b.rank);

	// 只替换每处图片的 src，保留原来的 Markdown / HTML 写法
	let result = "";
	let cursor = 0;
	occurrences.forEach((item, index) => {
		const nextSrc = sorted[index].src;
		result += body.slice(cursor, item.start) + replaceImageSrc(item.text, nextSrc);
		cursor = item.end;
	});
	result += body.slice(cursor);
	if (result === body) return;

	els.body.value = result;
	updateWordCount();
	pushBodyHistory();
	renderBodyImages();
	toast("图片顺序已调整");
}

function renderBodyImages() {
	const grid = els.bodyImagesGrid;
	if (!grid) return;
	const images = collectBodyImages();
	grid.innerHTML = "";

	if (!images.length) {
		const empty = document.createElement("span");
		empty.className = "body-images-empty";
		empty.textContent = "暂无图片，点击「上传图片」添加";
		grid.appendChild(empty);
		return;
	}

	for (const src of images) {
		const figure = document.createElement("figure");
		figure.className = "body-image-item";
		figure.draggable = true;
		figure.title = "拖动可调整顺序";

		const image = document.createElement("img");
		image.src = displayImageUrl(src);
		image.alt = "正文图片";
		image.loading = "lazy";
		image.draggable = false;
		image.title = "点击查看大图";
		image.addEventListener("click", () => openBodyImagePreview(src));

		const name = document.createElement("span");
		name.className = "body-image-name";
		name.textContent = src.split("/").pop() || src;
		name.title = src;

		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "body-image-remove";
		remove.textContent = "×";
		remove.title = "从正文中删除这张图片";
		remove.setAttribute("aria-label", "从正文中删除这张图片");
		remove.addEventListener("click", (event) => {
			event.stopPropagation();
			removeBodyImage(src);
		});

		figure.append(image, name, remove);

		figure.addEventListener("dragstart", (event) => {
			dragImageSrc = src;
			figure.classList.add("dragging");
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", src);
		});
		figure.addEventListener("dragend", () => {
			dragImageSrc = "";
			clearImageDropMarkers();
		});
		figure.addEventListener("dragover", (event) => {
			if (!dragImageSrc || dragImageSrc === src) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			figure.classList.add("drop-target");
		});
		figure.addEventListener("dragleave", () => {
			figure.classList.remove("drop-target");
		});
		figure.addEventListener("drop", (event) => {
			event.preventDefault();
			const from = collectBodyImages().indexOf(dragImageSrc);
			const to = collectBodyImages().indexOf(src);
			dragImageSrc = "";
			clearImageDropMarkers();
			reorderBodyImages(from, to);
		});

		grid.appendChild(figure);
	}
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 删除已上传到 public 下的图片文件（远程图片不处理）
async function deleteUploadedImage(src) {
	if (!src.startsWith("/assets/images/game/")) return;
	try {
		await api("/api/delete-image", {
			method: "POST",
			body: JSON.stringify({ path: src }),
		});
	} catch {
		// 文件已不存在或删除失败时不阻塞正文编辑
	}
}

// 将指定图片从一段正文文本中移除
function stripImageFromText(text, src) {
	const escaped = escapeRegExp(src);
	return text
		.replace(new RegExp(`!\\[[^\\]]*\\]\\(\\s*${escaped}[^)]*\\)\\n?`, "g"), "")
		.replace(new RegExp(`<img[^>]*\\bsrc=["']${escaped}["'][^>]*>\\n?`, "gi"), "");
}

// 从正文 Markdown 中移除指定图片
function removeBodyImage(src) {
	const before = els.body.value;
	const body = stripImageFromText(before, src);
	if (body === before) {
		toast("正文中未找到该图片", true);
		return;
	}
	els.body.value = body;
	// 图片文件已一并删除，历史记录里也要清掉，避免撤销/恢复把图片引用带回来
	for (let i = 0; i < bodyHistory.entries.length; i += 1) {
		bodyHistory.entries[i] = stripImageFromText(bodyHistory.entries[i], src);
	}
	updateWordCount();
	renderBodyImages();
	pushBodyHistory();
	void deleteUploadedImage(src).then(() => {
		// 删除完成后再允许同名图片刷新预览
		state.mediaVersion += 1;
		renderBodyImages();
	});
	toast("图片已从正文和文件中移除");
}

function openBodyImagePreview(src) {
	if (!els.imageLightbox) return;
	els.imageLightboxImg.src = displayImageUrl(src);
	els.imageLightbox.hidden = false;
}

function closeBodyImagePreview() {
	if (!els.imageLightbox) return;
	els.imageLightbox.hidden = true;
	els.imageLightboxImg.src = "";
}

async function loadMeta() {
	try {
		const meta = await api("/api/meta");
		state.today = meta.today;
		els.categoryOptions.innerHTML = "";
		for (const category of meta.categories) {
			ensureCategoryOption(category);
		}
		els.tagSuggestions.innerHTML = "";
		for (const tag of meta.tags) {
			const option = document.createElement("option");
			option.value = tag;
			els.tagSuggestions.appendChild(option);
		}
	} catch (error) {
		toast(error.message, true);
	}
}

function renderPosts() {
	const keyword = els.search.value.trim().toLowerCase();
	const posts = state.posts.filter((post) =>
		!keyword || post.title.toLowerCase().includes(keyword),
	);
	els.postList.innerHTML = "";
	if (posts.length === 0) {
		const empty = document.createElement("li");
		empty.textContent = keyword ? "没有匹配的文章" : "还没有文章";
		empty.style.cursor = "default";
		els.postList.appendChild(empty);
		return;
	}
	for (const post of posts) {
		const item = document.createElement("li");
		if (post.slug === state.currentSlug) item.classList.add("active");
		item.dataset.slug = post.slug;
		const title = document.createElement("div");
		title.className = "post-title";
		title.textContent = post.title;
		const meta = document.createElement("div");
		meta.className = "post-meta";
		meta.textContent = `${post.published || "未设置日期"}${
			post.categories && post.categories.length
				? ` · ${post.categories.join(" / ")}`
				: ""
		}`;
		item.append(title, meta);
		item.addEventListener("click", () => {
			selectPost(post.slug);
		});
		els.postList.appendChild(item);
	}
}

async function loadPosts() {
	const data = await api("/api/posts");
	state.posts = data.posts;
	renderPosts();
}

function fillPost(post) {
	els.title.value = post.title;
	els.slug.value = post.slug;
	state.slugTouched = true;
	els.published.value = post.published || state.today;
	els.description.value = post.description;
	els.tags.value = post.tags.join(", ");
	els.image.value = post.image;
	setSelectedCategories(post.categories);
	els.body.value = post.body;
	els.deletePost.hidden = false;
	updateCoverPreview();
	updateWordCount();
	renderBodyImages();
	resetBodyHistory();
	renderPosts();
}

async function selectPost(slug) {
	try {
		const post = await api(`/api/posts/${encodeURIComponent(slug)}`);
		state.currentSlug = slug;
		fillPost(post);
	} catch (error) {
		toast(error.message, true);
	}
}

function startNewPost() {
	state.currentSlug = null;
	state.slugTouched = false;
	els.title.value = "";
	els.slug.value = "";
	els.published.value = state.today;
	els.description.value = "";
	els.tags.value = "";
	els.image.value = "";
	setSelectedCategories([]);
	els.body.value = GAME_TEMPLATE;
	els.deletePost.hidden = true;
	updateCoverPreview();
	updateWordCount();
	renderBodyImages();
	resetBodyHistory();
	renderPosts();
	els.title.focus();
}

function collectPost() {
	return {
		title: els.title.value.trim(),
		slug: els.slug.value.trim(),
		published: els.published.value,
		description: els.description.value.trim(),
		tags: els.tags.value,
		categories: getSelectedCategories(),
		image: els.image.value.trim(),
		body: els.body.value,
	};
}

async function savePost() {
	if (state.busy) return;
	const payload = collectPost();
	if (!payload.title) {
		toast("请先填写标题", true);
		els.title.focus();
		return;
	}
	setBusy(true);
	try {
		const result = state.currentSlug
			? await api(`/api/posts/${encodeURIComponent(state.currentSlug)}`, {
					method: "PUT",
					body: JSON.stringify(payload),
				})
			: await api("/api/posts", {
					method: "POST",
					body: JSON.stringify(payload),
				});
		state.currentSlug = result.slug;
		els.slug.value = result.slug;
		state.slugTouched = true;
		els.deletePost.hidden = false;
		await loadPosts();
		refreshGitStatus();
		toast("文章已保存");
	} catch (error) {
		toast(error.message, true);
	} finally {
		setBusy(false);
	}
}

async function deletePost() {
	if (state.busy || !state.currentSlug) return;
	const title = els.title.value.trim() || state.currentSlug;
	if (!window.confirm(`确定删除《${title}》吗？此操作不可撤销。`)) return;
	setBusy(true);
	try {
		await api(`/api/posts/${encodeURIComponent(state.currentSlug)}`, {
			method: "DELETE",
		});
		startNewPost();
		await loadPosts();
		refreshGitStatus();
		toast("文章已删除");
	} catch (error) {
		toast(error.message, true);
	} finally {
		setBusy(false);
	}
}

function readAsDataURL(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("读取图片失败"));
		reader.readAsDataURL(file);
	});
}

async function uploadFile(file, role = "") {
	if (!file.type.startsWith("image/")) {
		throw new Error(`${file.name} 不是图片文件`);
	}
	const dataUrl = await readAsDataURL(file);
	let folder = state.currentSlug;
	if (!folder) {
		const title =
			els.title.value.trim() ||
			els.importText.value
				.split("\n")
				.find((line) => line.trim()) ||
			"";
		folder = (
			await api(
				`/api/slug?title=${encodeURIComponent(title)}&text=${encodeURIComponent(els.importText.value.slice(0, 2000))}`,
			)
		).slug;
	}
	const result = await api("/api/upload", {
		method: "POST",
		body: JSON.stringify({
			folder,
			filename: file.name,
			role,
			dataUrl,
		}),
	});
	return result.path;
}

function insertAtCursor(textarea, text) {
	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const value = textarea.value;
	textarea.value = value.slice(0, start) + text + value.slice(end);
	const cursor = start + text.length;
	textarea.selectionStart = cursor;
	textarea.selectionEnd = cursor;
	textarea.focus();
	updateWordCount();
	pushBodyHistory();
}

// 正文撤销 / 重做历史（最多保留 80 步）
const bodyHistory = {
	entries: [],
	index: -1,
	timer: 0,
	limit: 80,
};

function updateHistoryButtons() {
	if (els.undoEdit) els.undoEdit.disabled = bodyHistory.index <= 0;
	if (els.redoEdit) {
		els.redoEdit.disabled = bodyHistory.index >= bodyHistory.entries.length - 1;
	}
}

function resetBodyHistory() {
	window.clearTimeout(bodyHistory.timer);
	bodyHistory.entries = [els.body.value];
	bodyHistory.index = 0;
	updateHistoryButtons();
}

function pushBodyHistory() {
	window.clearTimeout(bodyHistory.timer);
	const value = els.body.value;
	if (bodyHistory.entries[bodyHistory.index] === value) return;
	bodyHistory.entries = bodyHistory.entries.slice(0, bodyHistory.index + 1);
	bodyHistory.entries.push(value);
	if (bodyHistory.entries.length > bodyHistory.limit) {
		bodyHistory.entries.shift();
	}
	bodyHistory.index = bodyHistory.entries.length - 1;
	updateHistoryButtons();
}

function scheduleBodyHistory() {
	window.clearTimeout(bodyHistory.timer);
	bodyHistory.timer = window.setTimeout(pushBodyHistory, 500);
}

function applyBodyHistory(nextIndex) {
	if (nextIndex < 0 || nextIndex >= bodyHistory.entries.length) return;
	bodyHistory.index = nextIndex;
	els.body.value = bodyHistory.entries[nextIndex];
	updateWordCount();
	renderBodyImages();
	updateHistoryButtons();
}

function undoBody() {
	window.clearTimeout(bodyHistory.timer);
	// 没来得及记录的输入先入栈，保证撤销退回上一次状态
	if (els.body.value !== bodyHistory.entries[bodyHistory.index]) pushBodyHistory();
	applyBodyHistory(bodyHistory.index - 1);
}

function redoBody() {
	window.clearTimeout(bodyHistory.timer);
	applyBodyHistory(bodyHistory.index + 1);
}

async function handleCoverUpload() {
	const file = els.fileCover.files[0];
	els.fileCover.value = "";
	if (!file) return;
	setBusy(true);
	try {
		// 等待旧封面删除完成，避免删除请求误删新上传的 header.jpg
		if (state.coverDeletePromise) {
			await state.coverDeletePromise;
			state.coverDeletePromise = null;
		}
		const path = await uploadFile(file, "cover");
		state.mediaVersion += 1;
		els.image.value = path;
		updateCoverPreview();
		toast("封面已上传");
	} catch (error) {
		toast(error.message, true);
	} finally {
		setBusy(false);
	}
}

async function uploadShotFiles(fileList) {
	if (state.busy) return;
	const files = [...fileList].filter(
		(file) => file && /^image\//.test(file.type || ""),
	);
	if (files.length === 0) return;
	setBusy(true);
	let inserted = 0;
	try {
		for (const file of files) {
			try {
				const path = await uploadFile(file, "shot");
				insertAtCursor(els.body, `![](${path})\n\n`);
				inserted += 1;
			} catch (error) {
				toast(error.message, true);
			}
		}
		if (inserted > 0) {
			state.mediaVersion += 1;
			toast(`已插入 ${inserted} 张图片`);
		}
		renderBodyImages();
	} finally {
		setBusy(false);
	}
}

async function handleShotsUpload() {
	const files = [...els.fileShots.files];
	els.fileShots.value = "";
	await uploadShotFiles(files);
}

async function refreshGitStatus() {
	try {
		const data = await api("/api/git/status");
		els.gitBranch.textContent = data.branch ? `分支 ${data.branch}` : "";
		els.gitStatus.textContent = data.status || "工作区干净，没有待提交的改动";
	} catch (error) {
		els.gitStatus.textContent = error.message;
	}
}

async function commitAndPush(push) {
	if (state.busy) return;
	const message =
		els.commitMessage.value.trim() ||
		(state.currentSlug
			? `chore(post): 更新文章《${els.title.value.trim() || state.currentSlug}》`
			: "chore(post): 更新文章内容");
	setBusy(true);
	els.gitOutput.hidden = false;
	els.gitOutput.textContent = push ? "正在提交并推送…" : "正在提交…";
	try {
		const result = await api("/api/git/commit", {
			method: "POST",
			body: JSON.stringify({ message, push }),
		});
		els.gitOutput.textContent = result.output || result.message;
		toast(result.message || "操作完成");
		await refreshGitStatus();
	} catch (error) {
		els.gitOutput.textContent = error.message;
		toast(error.message, true);
	} finally {
		setBusy(false);
	}
}

/* ===== 智能识别粘贴 ===== */

function detectImageUrls(text) {
	const urls = [];
	const push = (value) => {
		const url = String(value || "").trim();
		if (!url || url.startsWith("data:") || url.startsWith("/assets/")) return;
		if (!urls.includes(url)) urls.push(url);
	};
	for (const match of text.matchAll(
		/!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g,
	)) {
		push(match[1]);
	}
	for (const match of text.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
		push(match[1]);
	}
	for (const match of text.matchAll(
		/https?:\/\/[^\s"'<>()（）]+\.(?:png|jpg|jpeg|webp|gif|avif)(?:\?[^\s"'<>()（）]*)?/gi,
	)) {
		push(match[0]);
	}
	return urls;
}

function renderImportImages(urls) {
	state.importUrls = urls;
	els.importImages.innerHTML = "";
	if (urls.length === 0) {
		els.importImages.hidden = true;
		els.importFoundImages.hidden = true;
		return;
	}
	els.importImages.hidden = false;
	els.importFoundImages.hidden = false;
	for (const url of urls) {
		const item = document.createElement("div");
		item.className = "import-item";
		const image = document.createElement("img");
		image.src = url;
		image.loading = "lazy";
		image.referrerPolicy = "no-referrer";
		image.alt = "待导入图片";
		const label = document.createElement("div");
		label.className = "url";
		label.textContent = url;
		item.append(image, label);
		els.importImages.appendChild(item);
	}
}

function parseFrontMatterBlock(raw) {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
	if (!match) return null;
	const data = {};
	for (const line of match[1].split("\n")) {
		const index = line.indexOf(":");
		if (index === -1) continue;
		const key = line.slice(0, index).trim();
		let value = line.slice(index + 1).trim();
		if (value.startsWith("[") && value.endsWith("]")) {
			data[key] = value
				.slice(1, -1)
				.split(",")
				.map((item) => item.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
		} else {
			data[key] = value.replace(/^["']|["']$/g, "");
		}
	}
	return { data, body: raw.slice(match[0].length).replace(/^\n+/, "") };
}

// 粘贴的文章如果自带免责声明，导入时自动去掉，避免与站内固定声明重复
function stripDisclaimer(text) {
	return String(text || "")
		.replace(/\r\n/g, "\n")
		.replace(
			/^[ \t>*_-]*[^\n]*(?:免责声明|本站所有资源来自网络|严禁商用)[^\n]*$/gm,
			"",
		)
		.replace(/\n+\s*---\s*$/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

const GAME_INFO_FIELDS = [
	"游戏语言",
	"操作方式",
	"游戏类型",
	"游戏版本",
	"游戏大小",
	"注意事项",
];

const GAME_INFO_FIELD_PATTERNS = [
	{
		label: "游戏语言",
		pattern: /^(?:游戏语言|语言|语音|配音)\s*[:：]\s*(.+)$/,
	},
	{
		label: "操作方式",
		pattern: /^(?:操作方式|操控方式|操作|操控)\s*[:：]\s*(.+)$/,
	},
	{
		label: "游戏类型",
		pattern: /^(?:游戏类型|类型|题材)\s*[:：]\s*(.+)$/,
	},
	{
		label: "游戏版本",
		pattern: /^(?:游戏版本|版本号|版本)\s*[:：]\s*(.+)$/,
	},
	{
		label: "游戏大小",
		pattern: /^(?:游戏大小|安装包大小|大小)\s*[:：]\s*(.+)$/,
	},
	{
		label: "注意事项",
		pattern: /^(?:注意事项|备注|说明)\s*[:：]\s*(.+)$/,
	},
];

const GAME_INFO_LINE =
	/^(?:游戏语言|语言|语音|配音|操作方式|操控方式|操作|操控|游戏类型|类型|题材|游戏版本|版本号|版本|游戏大小|安装包大小|大小|注意事项|备注|说明)\s*[:：]/;

function normalizeInfoLine(line) {
	return line
		.trim()
		.replace(/^[-*+]\s*/, "")
		.replace(/\*\*/g, "");
}

function formatInfoValue(label, value) {
	const text = String(value || "").trim();
	if (label === "游戏类型") {
		return text.replace(/\s*[/、|]\s*/g, " / ");
	}
	return text;
}

function parseGameInfo(text) {
	const info = {};
	for (const line of String(text || "").split("\n")) {
		const normalized = normalizeInfoLine(line);
		for (const field of GAME_INFO_FIELD_PATTERNS) {
			if (info[field.label]) continue;
			const match = field.pattern.exec(normalized);
			if (match) info[field.label] = match[1].trim();
		}
	}
	return info;
}

function extractGameDescription(lines, titleIndex) {
	const paragraphs = [];
	let buffer = [];

	const flush = () => {
		if (buffer.length) {
			paragraphs.push(buffer.join("\n"));
			buffer = [];
		}
	};

	for (let i = titleIndex + 1; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (/^(?:下载|获取)(?:地址|链接|方式)/.test(line)) break;
		if (!line) {
			flush();
			continue;
		}
		if (/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(line)) continue;
		if (GAME_INFO_LINE.test(normalizeInfoLine(line))) continue;
		if (/^(?:#|---|\*免责声明)/.test(line)) continue;
		if (/^!\[|<img|^`https?:\/\//.test(line)) continue;
		buffer.push(
			line
				.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
				.replace(/`/g, "")
				.trim(),
		);
	}
	flush();

	return paragraphs.filter(Boolean).join("\n\n");
}

const DOWNLOAD_LABELS = [
	[/夸克|quark/i, "夸克网盘"],
	[/百度|baidu/i, "百度网盘"],
	[/蓝奏|lanzou/i, "蓝奏云"],
	[/迅雷|xunlei/i, "迅雷网盘"],
	[/天翼|189/i, "天翼云盘"],
	[/阿里|aliyun/i, "阿里云盘"],
	[/123/i, "123云盘"],
];

function detectDownloadLabel(line, url) {
	for (const [pattern, label] of DOWNLOAD_LABELS) {
		if (pattern.test(line)) return label;
	}
	if (/pan\.quark\.cn/.test(url)) return "夸克网盘";
	if (/pan\.baidu\.com|yun\.baidu\.com/.test(url)) return "百度网盘";
	if (/lanzou/.test(url)) return "蓝奏云";
	return "下载地址";
}

function extractDownloadLinks(text) {
	const lines = String(text || "").split("\n");
	const start = lines.findIndex((line) =>
		/^(?:下载|获取)(?:地址|链接|方式)/.test(line.trim().replace(/[#*>`]/g, "")),
	);
	if (start === -1) return [];

	const links = [];
	let lastLabel = "";
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i].trim().replace(/[-*+]\s*/, "").replace(/`/g, "");
		if (!line) continue;
		const urlMatch = /https?:\/\/[^\s)<>"'（）]+/.exec(line);
		if (!urlMatch) {
			if (line.length <= 16) lastLabel = line.replace(/[:：]\s*$/, "");
			continue;
		}
		const url = urlMatch[0];
		if (links.some((item) => item.url === url)) continue;
		links.push({
			label: detectDownloadLabel(lastLabel, url),
			url,
		});
		lastLabel = "";
	}
	return links;
}

// 识别夸克 / 百度网盘链接，并写入正文的「下载地址」区块
const NETDISK_PATTERNS = [
	{ label: "夸克网盘", regex: /(?:https?:\/\/)?pan\.quark\.cn\/s\/[^\s<>"'()（）]+/gi },
	{ label: "百度网盘", regex: /(?:https?:\/\/)?pan\.baidu\.com\/s\/[^\s<>"'()（）]+/gi },
];

function extractNetdiskLinks(text) {
	const content = String(text || "");
	const links = [];
	const seen = new Set();
	const pwdMatch = content.match(/提取码\s*[:：]?\s*([a-zA-Z0-9]{4})/);
	for (const { label, regex } of NETDISK_PATTERNS) {
		for (const match of content.matchAll(regex)) {
			let url = match[0]
				.replace(/[，。；、）】》"'<>)\]]+$/g, "")
				.trim();
			if (!url) continue;
			if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
			// 百度网盘分享文本里的提取码自动补进链接
			if (
				label === "百度网盘" &&
				pwdMatch &&
				!/[?&]pwd=/.test(url)
			) {
				url += `${url.includes("?") ? "&" : "?"}pwd=${pwdMatch[1]}`;
			}
			if (seen.has(url)) continue;
			seen.add(url);
			links.push({ label, url });
		}
	}
	return links;
}

function buildDownloadBlock(links) {
	return `## 下载地址\n\n${links
		.map((link) => `- **${link.label}**：[点击下载](${link.url})`)
		.join("\n")}\n`;
}

function fillDownloadLinks() {
	const text = els.netdiskInput.value.trim();
	if (!text) {
		toast("请先粘贴网盘分享文本", true);
		els.netdiskInput.focus();
		return;
	}
	const newLinks = extractNetdiskLinks(text);
	if (!newLinks.length) {
		toast("没有识别到夸克或百度网盘链接", true);
		return;
	}
	const body = els.body.value;
	const sectionRegex =
		/^##\s*下载地址\s*$[\s\S]*?(?=^##\s|(?![\s\S]))/m;
	const existingSection = body.match(sectionRegex)?.[0] ?? "";
	// 只替换同网盘的旧链接，另一种网盘的链接保持不变
	const newLabels = new Set(newLinks.map((link) => link.label));
	const keptLinks = extractNetdiskLinks(existingSection).filter(
		(link) => !newLabels.has(link.label),
	);
	const links = [];
	const seen = new Set();
	for (const link of [...keptLinks, ...newLinks]) {
		if (seen.has(link.url)) continue;
		seen.add(link.url);
		links.push(link);
	}
	const labelRank = (label) =>
		NETDISK_PATTERNS.findIndex((item) => item.label === label);
	links.sort((a, b) => labelRank(a.label) - labelRank(b.label));
	const block = buildDownloadBlock(links);
	if (sectionRegex.test(body)) {
		els.body.value = body.replace(sectionRegex, `${block}\n`);
	} else if (/^##\s*游戏图片\s*$/m.test(body)) {
		els.body.value = body.replace(
			/^##\s*游戏图片\s*$/m,
			`${block}\n## 游戏图片`,
		);
	} else {
		const prefix = body.replace(/\s+$/, "");
		els.body.value = prefix ? `${prefix}\n\n${block}` : block;
	}
	updateWordCount();
	renderBodyImages();
	pushBodyHistory();
	els.netdiskInput.value = "";
	els.netdiskPanel.hidden = true;
	toast(`已填入 ${links.length} 个网盘链接`);
}

function buildGameBody(info, description, links) {
	const infoLines = GAME_INFO_FIELDS.filter((label) => info[label]).map(
		(label) => `- **${label}**：${formatInfoValue(label, info[label])}`,
	);
	const parts = [];
	if (infoLines.length) {
		parts.push(`## 游戏信息\n\n${infoLines.join("\n")}`);
	}
	if (description) {
		parts.push(`## 游戏简介\n\n${description}`);
	}
	if (links.length) {
		parts.push(
			`## 下载地址\n\n${links
				.map((link) => `- **${link.label}**：[点击下载](${link.url})`)
				.join("\n")}`,
		);
	}
	parts.push("## 游戏图片");
	if (!infoLines.length && !links.length) return "";
	return parts.join("\n\n");
}

function buildGameSummary(title, info, descriptionBody, category, text) {
	const nameMatch = /《([^》]{1,30})》/.exec(String(title || ""));
	const name = nameMatch
		? nameMatch[1]
		: String(title || "")
				.split(/[，,。]/)[0]
				.trim();
	if (!name) return "";

	const source = `${title}\n${descriptionBody}`;
	const descriptors = [];
	const addDescriptor = (token) => {
		if (token && !descriptors.includes(token) && descriptors.length < 4) {
			descriptors.push(token);
		}
	};

	const checks = [
		[/\b3D\b/i, "3D"],
		[/\b2D\b/i, "2D"],
		[/像素/, "像素风"],
		[/第一人称/, "第一人称"],
		[/第三人称/, "第三人称"],
		[/心理恐怖/, "心理恐怖"],
		[/恐怖/, "恐怖"],
		[/恋爱冒险/, "恋爱冒险"],
		[/开放世界/, "开放世界"],
		[/解谜/, "解谜"],
		[/角色扮演|\bRPG\b/i, "角色扮演"],
		[/模拟经营/, "模拟经营"],
		[/射击/, "射击"],
		[/策略/, "策略"],
		[/生存/, "生存"],
		[/沙盒/, "沙盒"],
		[/横版/, "横版"],
		[/动作/, "动作"],
		[/音乐/, "音乐"],
		[/休闲/, "休闲"],
	];
	for (const [pattern, token] of checks) {
		if (token === "恐怖" && /心理恐怖/.test(source)) continue;
		if (pattern.test(source)) addDescriptor(token);
	}
	if (descriptors.includes("心理恐怖")) {
		const index = descriptors.indexOf("恐怖");
		if (index !== -1) descriptors.splice(index, 1);
	}

	let descriptionText = "";
	if (descriptors.length) {
		descriptionText = descriptors.join("");
	} else if (info["游戏类型"]) {
		descriptionText = String(info["游戏类型"])
			.split(/[/、|]/)
			.map((item) => item.trim())
			.filter(Boolean)
			.join("、");
	}

	if (!descriptionText) return "";

	const parts = [`《${name}》是一款${descriptionText}游戏`];

	const score =
		/(?:Steam\s*)?好评率(?:高达)?\s*(\d+(?:\.\d+)?%)/.exec(source);
	if (score) {
		parts.push(
			/Steam/i.test(source)
				? `Steam好评率高达${score[1]}`
				: `好评率高达${score[1]}`,
		);
	} else if (/好评如潮/.test(source)) {
		parts.push("Steam好评如潮");
	}

	const platformMap = {
		Steam移植: "本次为安卓移植版本",
		安卓原生: "本次为安卓原生版本",
		反编译移植: "本次为反编译移植版本",
	};
	const platform = platformMap[category];
	if (platform) parts.push(platform);

	let summary = `${parts.join("，")}。`;
	if (summary.length > 120) {
		summary = `${parts.slice(0, -1).join("，")}。`;
	}
	return summary;
}

// 在已有标签基础上补足游戏相关标签，保证自动粘贴至少 6 个
function fillGameTags(tags, source, gameType = "") {
	const addTag = (value) => {
		const tag = String(value || "")
			.trim()
			.replace(/^#/, "");
		if (tag && !tags.includes(tag) && tags.length < 12) tags.push(tag);
	};
	for (const [pattern, tag] of GAME_TAG_RULES) {
		if (tag === "恐怖" && tags.includes("心理恐怖")) continue;
		if (pattern.test(source)) addTag(tag);
	}
	for (const item of String(gameType || "").split(/[/、|,，]/)) addTag(item);
	if (tags.length < 6) {
		for (const tag of GAME_TAG_FALLBACKS) {
			addTag(tag);
			if (tags.length >= 6) break;
		}
	}
	return tags;
}

function guessPostFromText(raw) {
	const text = raw.replace(/\r\n/g, "\n").trim();
	const frontMatter = parseFrontMatterBlock(text);
	if (frontMatter) {
		const data = frontMatter.data;
		const body = stripDisclaimer(frontMatter.body);
		const tags = Array.isArray(data.tags)
			? data.tags.map(String)
			: String(data.tags || "")
					.split(/[,，]/)
					.filter(Boolean);
		fillGameTags(
			tags,
			`${String(data.title || "")}\n${body}`,
			parseGameInfo(body)["游戏类型"],
		);
		return {
			title: String(data.title || ""),
			published: String(data.published || "").slice(0, 10),
			description: String(data.description || ""),
			tags,
			categories: categoriesFromData(data),
			image: String(data.image || ""),
			body,
		};
	}

	const lines = text.split("\n");
	const titleIndex = lines.findIndex((line) => line.trim());
	let title = "";
	if (titleIndex !== -1) {
		title = lines[titleIndex]
			.replace(/^#+\s*/, "")
			.replace(/^\*\*|\*\*$/g, "")
			.trim();
	}

	let published = "";
	const dateMatch = /\b(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/.exec(text);
	if (dateMatch) {
		published = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
	}

	const info = parseGameInfo(text);
	const links = extractDownloadLinks(text);
	const descriptionBody = extractGameDescription(lines, titleIndex);

	const tags = [];
	const addTag = (value) => {
		const tag = String(value || "")
			.trim()
			.replace(/^#/, "");
		if (tag && !tags.includes(tag) && tags.length < 12) tags.push(tag);
	};
	for (const match of text.matchAll(
		/#([^\s#，,。.!！?？:：;；"'“”‘’()（）[\]【】]+)/g,
	)) {
		const tag = match[1].trim();
		if (tag.length >= 2 && tag.length <= 12) addTag(tag);
	}
	const tagLine = /(?:标签|Tags?)[:：]\s*([^\n]+)/i.exec(text);
	if (tagLine) tagLine[1].split(/[,，、|/]/).forEach(addTag);
	for (const option of els.tagSuggestions.options) {
		if (option.value && text.includes(option.value)) addTag(option.value);
	}
	// 板块标签兜底，确保「必玩榜 / Steam移植」等不会被漏掉
	for (const name of [
		"必玩榜",
		"Steam移植",
		"手柄专区",
		"安卓原生",
		"反编译移植",
	]) {
		if (text.includes(name)) addTag(name);
	}

	// 游戏相关标签：按正文关键词识别，自动粘贴时至少 6 个
	fillGameTags(tags, `${title}\n${text}`, info["游戏类型"]);

	// 识别出的分类可以多选：先收集全部命中的预设分类
	const categoryNames = categoryInputs()
		.map((input) => input.value)
		.filter(Boolean);
	const guessedCategories = [];
	const addCategory = (name) => {
		if (name && !guessedCategories.includes(name)) guessedCategories.push(name);
	};
	for (const name of categoryNames) {
		if (name === "Steam移植") {
			if (tags.includes(name)) addCategory(name);
		} else if (name === "反编译移植") {
			if (/反编译/.test(text)) addCategory(name);
		} else if (name === "安卓原生") {
			if (/安卓原生/.test(text)) addCategory(name);
		} else if (text.includes(name)) {
			addCategory(name);
		}
	}
	// 生成简介时只需要一个平台分类
	const summaryCategory =
		guessedCategories.find(
			(name) => !SECTION_TAG_CATEGORIES.includes(name),
		) || "";

	const gameBody = buildGameBody(info, descriptionBody, links);

	// 描述自动总结：游戏名 + 类型要素 + 好评亮点 + 移植版本
	const firstParagraph = descriptionBody
		.split(/\n\n/)[0]
		.replace(/[*_`#>]/g, "")
		.trim();
	const firstSentence = /^(.{1,120}?[。！？!?])/.exec(firstParagraph);
	const fallbackDescription = firstSentence
		? firstSentence[1]
		: firstParagraph.slice(0, 120);
	const description =
		buildGameSummary(title, info, descriptionBody, summaryCategory, text) ||
		fallbackDescription;

	const body = stripDisclaimer(
		gameBody ||
			(titleIndex !== -1
				? lines.slice(titleIndex + 1).join("\n").trim()
				: text),
	);

	return {
		title,
		published,
		description,
		tags,
		categories: guessedCategories,
		image: "",
		body,
	};
}

// 从 front-matter 还原分类数组：category 字段 + 标签中的标签型板块
function categoriesFromData(data) {
	const categoryNames = Array.isArray(data.category)
		? data.category.map(String)
		: String(data.category || "").split(/[,，]/);
	const tagNames = Array.isArray(data.tags)
		? data.tags.map(String)
		: String(data.tags || "").split(/[,，]/);
	const selected = [];
	for (const name of categoryNames) {
		const value = String(name).trim();
		if (value && !selected.includes(value)) selected.push(value);
	}
	for (const name of tagNames) {
		const value = String(name).trim();
		if (
			SECTION_TAG_CATEGORIES.includes(value) &&
			!selected.includes(value)
		) {
			selected.push(value);
		}
	}
	return selected;
}

async function applyGuessedPost(guess, options = {}) {
	const hasContent =
		Boolean(els.title.value.trim()) ||
		els.body.value.trim() !== GAME_TEMPLATE.trim();
	if (
		hasContent &&
		!options.silent &&
		!window.confirm("识别结果将覆盖当前编辑内容，是否继续？")
	) {
		return false;
	}

	els.title.value = guess.title;
	state.slugTouched = false;
	if (guess.title) {
		try {
			const result = await api(
				`/api/slug?title=${encodeURIComponent(guess.title)}&text=${encodeURIComponent(guess.body.slice(0, 4000))}`,
			);
			els.slug.value = result.slug;
		} catch {
			els.slug.value = "";
		}
	}
	els.published.value = guess.published || state.today;
	els.description.value = guess.description;
	els.tags.value = guess.tags.join(", ");
	setSelectedCategories(guess.categories ?? []);
	// 保留当前正文里已上传的本地图片，避免识别时被覆盖丢失
	const existingImages = collectBodyImages().filter((src) =>
		src.startsWith("/assets/"),
	);
	const missingImages = existingImages.filter(
		(src) => !guess.body.includes(src),
	);
	const nextBody = guess.body.replace(/\s+$/, "");
	const imagesBlock = `<div class="game-shots">\n${missingImages
		.map((src) => `<img src="${src}" alt="" loading="lazy" />`)
		.join("\n")}\n</div>`;
	els.body.value = missingImages.length
		? `${nextBody}\n\n${/##\s*游戏图片/.test(nextBody) ? "" : "## 游戏图片\n\n"}${imagesBlock}\n`
		: guess.body;
	renderBodyImages();
	resetBodyHistory();

	// 自动识别只处理文字，不再识别或导入图片
	state.importCoverUrl = "";
	renderImportImages([]);

	updateCoverPreview();
	updateWordCount();
	toast(
		guess.title
			? `已识别：${guess.title.slice(0, 24)}`
			: "已识别正文，请手动填写标题",
	);
	return true;
}

async function smartParse() {
	const raw = els.importText.value.trim();
	if (!raw) {
		toast("请先粘贴文章内容", true);
		return;
	}
	await applyGuessedPost(guessPostFromText(raw));
}

async function importFoundImages() {
	const urls = [...state.importUrls];
	if (urls.length === 0) return;
	setBusy(true);
	let folder = state.currentSlug;
	if (!folder) {
		try {
			folder = (
				await api(
					`/api/slug?title=${encodeURIComponent(els.title.value)}&text=${encodeURIComponent(els.body.value.slice(0, 2000))}`,
				)
			).slug;
		} catch {
			folder = "uploads";
		}
	}
	let count = 0;
	let coverSet = Boolean(els.image.value.trim());
	for (const url of urls) {
		try {
			const asCover =
				url === state.importCoverUrl || (!coverSet && !state.importCoverUrl);
			const result = await api("/api/download-image", {
				method: "POST",
				body: JSON.stringify({
					url,
					folder,
					filename: "shot",
					role: asCover ? "cover" : "shot",
				}),
			});
			const path = result.path;
			els.body.value = els.body.value.split(url).join(path);
			if (asCover) {
				els.image.value = path;
				coverSet = true;
			}
			count += 1;
		} catch (error) {
			toast(`${url.slice(0, 36)}：${error.message}`, true);
		}
	}
	updateCoverPreview();
	updateWordCount();
	renderImportImages([]);
	state.importCoverUrl = "";
	toast(
		count > 0 ? `已导入并替换 ${count} 张图片` : "没有成功导入图片",
		count === 0,
	);
	setBusy(false);
}

async function uploadPastedImages(files, insertOnly = false) {
	setBusy(true);
	try {
		for (const file of files) {
			const asCover = !insertOnly && !els.image.value.trim();
			const path = await uploadFile(file, asCover ? "cover" : "shot");
			if (asCover) {
				els.image.value = path;
				updateCoverPreview();
				toast("图片已识别并设为封面");
			} else {
				insertAtCursor(els.body, `![](${path})\n\n`);
				toast("图片已识别并插入正文");
			}
		}
	} catch (error) {
		toast(error.message, true);
	} finally {
		setBusy(false);
	}
}

els.loginForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	els.loginError.hidden = true;
	const password = els.password.value;
	try {
		await api("/api/login", {
			method: "POST",
			body: JSON.stringify({ password }),
		});
		showApp();
		await loadMeta();
		await loadPosts();
		startNewPost();
		refreshGitStatus();
	} catch (error) {
		els.loginError.textContent = error.message;
		els.loginError.hidden = false;
	}
});

els.logout.addEventListener("click", async () => {
	try {
		await api("/api/logout", { method: "POST" });
	} catch {
		// 忽略退出失败
	}
	showLogin();
});

els.newPost.addEventListener("click", startNewPost);
els.search.addEventListener("input", renderPosts);
els.title.addEventListener("input", scheduleSlugUpdate);
els.slug.addEventListener("input", () => {
	state.slugTouched = Boolean(els.slug.value.trim());
});
els.savePost.addEventListener("click", savePost);
els.deletePost.addEventListener("click", deletePost);
els.body.addEventListener("input", updateWordCount);
els.image.addEventListener("input", updateCoverPreview);
els.pickCover.addEventListener("click", () => els.fileCover.click());
els.fileCover.addEventListener("change", handleCoverUpload);
els.clearCover.addEventListener("click", async () => {
	const previous = els.image.value.trim();
	els.image.value = "";
	state.mediaVersion += 1;
	updateCoverPreview();
	state.coverDeletePromise = deleteUploadedImage(previous);
	await state.coverDeletePromise;
	state.coverDeletePromise = null;
});
els.pickShots.addEventListener("click", () => els.fileShots.click());
els.fileShots.addEventListener("change", handleShotsUpload);

let dragDepth = 0;
els.bodyImagesPanel.addEventListener("dragenter", (event) => {
	event.preventDefault();
	dragDepth += 1;
	els.bodyImagesPanel.classList.add("dragging");
});
els.bodyImagesPanel.addEventListener("dragover", (event) => {
	event.preventDefault();
});
els.bodyImagesPanel.addEventListener("dragleave", () => {
	dragDepth = Math.max(0, dragDepth - 1);
	if (dragDepth === 0) els.bodyImagesPanel.classList.remove("dragging");
});
els.bodyImagesPanel.addEventListener("drop", (event) => {
	event.preventDefault();
	dragDepth = 0;
	els.bodyImagesPanel.classList.remove("dragging");
	uploadShotFiles(event.dataTransfer?.files || []);
});
els.body.addEventListener("paste", (event) => {
	const files = [...(event.clipboardData?.files || [])];
	if (!files.some((file) => /^image\//.test(file.type || ""))) return;
	event.preventDefault();
	uploadShotFiles(files);
});

let bodyImagesTimer = 0;
els.body.addEventListener("input", () => {
	window.clearTimeout(bodyImagesTimer);
	bodyImagesTimer = window.setTimeout(renderBodyImages, 400);
	scheduleBodyHistory();
});

els.undoEdit.addEventListener("click", () => {
	undoBody();
	els.body.focus();
});
els.redoEdit.addEventListener("click", () => {
	redoBody();
	els.body.focus();
});
els.body.addEventListener("keydown", (event) => {
	if (!(event.ctrlKey || event.metaKey)) return;
	const key = event.key.toLowerCase();
	if (key === "z") {
		event.preventDefault();
		if (event.shiftKey) redoBody();
		else undoBody();
	} else if (key === "y") {
		event.preventDefault();
		redoBody();
	}
});
resetBodyHistory();
els.imageLightboxClose.addEventListener("click", closeBodyImagePreview);
els.imageLightbox.addEventListener("click", (event) => {
	if (event.target === els.imageLightbox) closeBodyImagePreview();
});
window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") closeBodyImagePreview();
});
els.detectLinks.addEventListener("click", () => {
	els.netdiskPanel.hidden = false;
	els.netdiskInput.focus();
});
els.netdiskFill.addEventListener("click", fillDownloadLinks);
els.netdiskCancel.addEventListener("click", () => {
	els.netdiskPanel.hidden = true;
	els.netdiskInput.value = "";
});
els.gitRefresh.addEventListener("click", refreshGitStatus);
els.gitCommit.addEventListener("click", () => commitAndPush(false));
els.gitPush.addEventListener("click", () => commitAndPush(true));

let slugTimer = 0;

// 输入标题后自动按游戏英文名生成链接别名
function scheduleSlugUpdate() {
	if (state.slugTouched) return;
	window.clearTimeout(slugTimer);
	slugTimer = window.setTimeout(async () => {
		const title = els.title.value.trim();
		if (!title) {
			els.slug.value = "";
			return;
		}
		try {
			const text = els.importText.value.slice(0, 4000);
			const result = await api(
				`/api/slug?title=${encodeURIComponent(title)}&text=${encodeURIComponent(text)}`,
			);
			if (!state.slugTouched) els.slug.value = result.slug;
		} catch {
			// 保留当前输入
		}
	}, 500);
}

els.smartParse.addEventListener("click", smartParse);
els.importFoundImages.addEventListener("click", importFoundImages);
els.smartClear.addEventListener("click", () => {
	els.importText.value = "";
	state.importCoverUrl = "";
	renderImportImages([]);
});
els.importText.addEventListener("paste", () => {
	window.setTimeout(() => {
		if (!els.title.value.trim()) smartParse();
	}, 0);
});
els.body.addEventListener("paste", (event) => {
	const files = [...(event.clipboardData?.files || [])].filter((file) =>
		file.type.startsWith("image/"),
	);
	if (files.length > 0) {
		event.preventDefault();
		uploadPastedImages(files, true);
	}
});

async function boot() {
	try {
		const session = await api("/api/session");
		if (session.ok) {
			showApp();
			await loadMeta();
			await loadPosts();
			startNewPost();
			refreshGitStatus();
			return;
		}
	} catch {
		// 未登录或网络异常，走登录界面
	}
	showLogin();
}

boot();
